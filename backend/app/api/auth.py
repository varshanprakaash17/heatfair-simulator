"""Invite-only authentication.

People sign in with Google (``GET /auth/google/start``); only email addresses
that already belong to an invited ``User`` are accepted, so there is still no
public sign-up. Accounts are invited by an organization owner or admin through
``POST /auth/accounts`` with just an email address. Password sign-in remains as
a local-development escape hatch (tests and the seeded demo), and is refused in
production unless ``PASSWORD_LOGIN_ENABLED`` is set. A signed-in session is an opaque token in an
HTTP-only cookie, stored in the ``sessions`` table.

Organization access is scoped only by ``OrganizationMember`` rows — the same
rows every org-scoped endpoint already checks. Signed-out requests keep the
demo path (organization exists, no membership check) so the seeded demo stays
explorable.
"""

from __future__ import annotations

import json
import re
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Organization, OrganizationMember, Session as SessionRow, User
from ..schemas.auth import (
    AccountCreateRequest,
    AuthSessionOut,
    LoginRequest,
    MembershipOut,
    UserOut,
)
from ..security import verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

SESSION_COOKIE = "heatfair_session"
SESSION_TTL = timedelta(days=7)

# Google OAuth 2.0 / OpenID Connect endpoints. The authorization-code flow keeps
# the client secret on the server; the browser only ever sees Google's own pages.
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
OAUTH_STATE_COOKIE = "heatfair_oauth_state"
OAUTH_STATE_TTL_SECONDS = 600
SIGN_IN_PATH = "/auth/signin"

# A publicly reachable sign-in form needs a brake: five failures per client and
# email inside the window, then 429 until the oldest failure ages out. This is
# per-process state, which is enough for a single-instance deployment; a
# multi-instance deployment would need a shared store instead.
LOGIN_WINDOW = timedelta(minutes=5)
LOGIN_MAX_FAILURES = 5
LOGIN_MAX_TRACKED = 5_000
_login_failures: dict[str, list[datetime]] = {}


def _now() -> datetime:
    """Naive UTC now, matching how SQLite stores DateTime values."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _user_payload(user: User) -> UserOut:
    return UserOut(id=user.id, email=user.email, name=user.name, created_at=user.created_at)


def _membership_payload(m: OrganizationMember) -> MembershipOut:
    return MembershipOut(
        organization_id=m.organization_id,
        organization_name=m.organization.name,
        role=m.role,
    )


def _session_payload(user: User, db: Session) -> AuthSessionOut:
    memberships = (
        db.execute(
            select(OrganizationMember)
            .where(OrganizationMember.user_id == user.id)
            .order_by(OrganizationMember.created_at)
        )
        .scalars()
        .all()
    )
    return AuthSessionOut(
        user=_user_payload(user),
        memberships=[_membership_payload(m) for m in memberships],
    )


def get_optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    """Resolve the session cookie to a user, or None when signed out."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    row = db.get(SessionRow, token)
    if row is None:
        return None
    if row.expires_at < _now():
        db.delete(row)
        db.commit()
        return None
    return db.get(User, row.user_id)


def get_current_user(user: User | None = Depends(get_optional_user)) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to continue")
    return user


def require_org_membership(
    organization_id: str,
    user: User | None,
    db: Session,
    *,
    allow_public_demo: bool = False,
) -> Organization:
    """Enforce tenant membership; optionally permit read-only demo access.

    Public demo access is intentionally opt-in at read endpoints only. All
    mutations must use the default (authenticated membership required).
    """
    org = db.get(Organization, organization_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")

    if user is None:
        settings = get_settings()
        if allow_public_demo and org.name == settings.demo_organization_name:
            return org
        raise HTTPException(status_code=401, detail="Sign in to access this organization")

    membership = db.execute(
        select(OrganizationMember).where(
            OrganizationMember.user_id == user.id,
            OrganizationMember.organization_id == organization_id,
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=403, detail="Not a member of this organization")

    return org


def _cookie_secure() -> bool:
    return get_settings().environment != "development"


def password_login_available() -> bool:
    """Password sign-in is for local development; production is Google only."""
    settings = get_settings()
    return settings.environment == "development" or settings.password_login_enabled


def _set_session_cookie(response: Response, token: str) -> None:
    secure = _cookie_secure()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        secure=secure,
        samesite="none" if secure else "lax",
        path="/",
    )


def _start_session(user_id: str, db: Session) -> str:
    db.execute(delete(SessionRow).where(SessionRow.expires_at < _now()))
    token = secrets.token_urlsafe(32)
    db.add(SessionRow(token=token, user_id=user_id, expires_at=_now() + SESSION_TTL))
    db.commit()
    return token


def _google_configured() -> bool:
    settings = get_settings()
    return bool(settings.google_client_id.strip() and settings.google_client_secret.strip())


def _origin_allowed(origin: str) -> bool:
    """Only send people back to an origin this deployment already trusts."""
    if not origin:
        return False
    settings = get_settings()
    if origin in settings.cors_origin_list:
        return True
    pattern = settings.cors_origin_regex
    return bool(pattern) and re.fullmatch(pattern, origin) is not None


def _safe_next_path(next_path: str | None) -> str:
    """Local path only, so the callback cannot be used as an open redirect."""
    if not next_path or not next_path.startswith("/") or next_path.startswith("//"):
        return "/dashboard"
    return next_path


def _frontend_redirect(
    frontend: str,
    next_path: str = SIGN_IN_PATH,
    error: str | None = None,
) -> RedirectResponse:
    url = f"{frontend.rstrip('/')}{next_path}"
    if error:
        url = f"{url}?{urlencode({'error': error})}"
    return RedirectResponse(url, status_code=303)


def _api_origin(request: Request) -> str:
    origin = str(request.base_url).rstrip("/")
    if get_settings().environment != "development" and origin.startswith("http://"):
        origin = f"https://{origin[len('http://'):]}"
    return origin


def _google_redirect_uri(request: Request) -> str:
    configured = get_settings().google_redirect_uri.strip()
    if configured:
        return configured
    return f"{_api_origin(request)}{get_settings().api_prefix}/auth/google/callback"


def _failure_key(request: Request, email: str) -> str:
    client = request.client.host if request.client else "unknown"
    return f"{client}|{email}"


def _prune_failures(cutoff: datetime) -> None:
    for stale in [k for k, v in _login_failures.items() if not v or v[-1] < cutoff]:
        _login_failures.pop(stale, None)


def _recent_failures(key: str) -> list[datetime]:
    cutoff = _now() - LOGIN_WINDOW
    recent = [stamp for stamp in _login_failures.get(key, []) if stamp > cutoff]
    if recent:
        _login_failures[key] = recent
    else:
        _login_failures.pop(key, None)
    return recent


@router.post("/login", response_model=AuthSessionOut)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Sign in with the email and password an administrator issued."""
    if not password_login_available():
        raise HTTPException(
            status_code=403,
            detail="Password sign-in is disabled. Continue with Google.",
        )

    key = _failure_key(request, payload.email)
    recent = _recent_failures(key)
    if len(recent) >= LOGIN_MAX_FAILURES:
        retry_after = max(int((recent[0] + LOGIN_WINDOW - _now()).total_seconds()) + 1, 1)
        raise HTTPException(
            status_code=429,
            detail="Too many failed sign-in attempts. Try again in a few minutes.",
            headers={"Retry-After": str(retry_after)},
        )

    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        if len(_login_failures) >= LOGIN_MAX_TRACKED:
            _prune_failures(_now() - LOGIN_WINDOW)
        _login_failures.setdefault(key, []).append(_now())
        raise HTTPException(status_code=401, detail="Invalid email or password")

    _login_failures.pop(key, None)

    _set_session_cookie(response, _start_session(user.id, db))
    return _session_payload(user, db)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        db.execute(delete(SessionRow).where(SessionRow.token == token))
        db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return None


@router.get("/me", response_model=AuthSessionOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _session_payload(user, db)


@router.post("/accounts", response_model=AuthSessionOut, status_code=201)
def create_account(
    payload: AccountCreateRequest,
    admin: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Invite-only account creation for staff and workers."""
    org = db.get(Organization, payload.organization_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")

    admin_membership = db.execute(
        select(OrganizationMember).where(
            OrganizationMember.user_id == admin.id,
            OrganizationMember.organization_id == org.id,
        )
    ).scalar_one_or_none()
    if admin_membership is None or admin_membership.role not in ("owner", "admin"):
        raise HTTPException(
            status_code=403, detail="Only an organization owner or admin can add accounts"
        )

    existing = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user = User(email=payload.email, name=payload.name)
    db.add(user)
    db.flush()
    db.add(OrganizationMember(user_id=user.id, organization_id=org.id, role="member"))
    db.commit()
    db.refresh(user)
    return _session_payload(user, db)


@router.get("/google/start")
def google_start(
    request: Request,
    origin: str = "",
    next: str = "/dashboard",
) -> RedirectResponse:
    """Send the browser to Google's consent screen.

    ``origin`` lets a hosted frontend ask to come back to its own address; it is
    ignored unless the CORS configuration already trusts it.
    """
    settings = get_settings()
    frontend = origin.rstrip("/") if _origin_allowed(origin) else settings.frontend_url.rstrip("/")

    if not _google_configured():
        return _frontend_redirect(frontend, error="google_unconfigured")

    state = secrets.token_urlsafe(24)
    stored = json.dumps(
        {"state": state, "frontend": frontend, "next": _safe_next_path(next)}
    )
    query = urlencode(
        {
            "client_id": settings.google_client_id.strip(),
            "redirect_uri": _google_redirect_uri(request),
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
            "access_type": "online",
        }
    )
    response = RedirectResponse(f"{GOOGLE_AUTH_URL}?{query}", status_code=303)
    secure = _cookie_secure()
    response.set_cookie(
        OAUTH_STATE_COOKIE,
        stored,
        max_age=OAUTH_STATE_TTL_SECONDS,
        httponly=True,
        secure=secure,
        samesite="none" if secure else "lax",
        path="/",
    )
    return response


@router.get("/google/callback")
def google_callback(
    request: Request,
    code: str = "",
    state: str = "",
    error: str = "",
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Exchange Google's code for a session, matching an invited account by email."""
    settings = get_settings()

    stored: dict = {}
    raw = request.cookies.get(OAUTH_STATE_COOKIE)
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                stored = parsed
        except json.JSONDecodeError:
            stored = {}

    stored_frontend = stored.get("frontend")
    frontend = (
        stored_frontend.rstrip("/")
        if isinstance(stored_frontend, str) and _origin_allowed(stored_frontend)
        else settings.frontend_url.rstrip("/")
    )
    next_path = _safe_next_path(stored.get("next") if isinstance(stored.get("next"), str) else None)

    def failure(reason: str) -> RedirectResponse:
        response = _frontend_redirect(frontend, error=reason)
        response.delete_cookie(OAUTH_STATE_COOKIE, path="/")
        return response

    if error:
        return failure("google_cancelled")
    if not _google_configured():
        return failure("google_unconfigured")
    if not code or not state or stored.get("state") != state:
        return failure("google_expired")

    try:
        token_response = httpx.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": settings.google_client_id.strip(),
                "client_secret": settings.google_client_secret.strip(),
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": _google_redirect_uri(request),
            },
            timeout=10.0,
        )
        token_response.raise_for_status()
        access_token = token_response.json().get("access_token")
        if not access_token:
            return failure("google_unavailable")

        profile_response = httpx.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0,
        )
        profile_response.raise_for_status()
        profile = profile_response.json()
    except (httpx.HTTPError, ValueError):
        return failure("google_unavailable")

    email = str(profile.get("email") or "").strip().lower()
    if not email or profile.get("email_verified") is False:
        return failure("google_unverified")

    user = db.execute(select(User).where(func.lower(User.email) == email)).scalar_one_or_none()
    if user is None:
        # Invite-only: a Google account without an invitation gets no access.
        return failure("no_account")

    name = profile.get("name")
    if not user.name and isinstance(name, str) and name.strip():
        user.name = name.strip()
        db.commit()

    token = _start_session(user.id, db)
    response = RedirectResponse(f"{frontend}{next_path}", status_code=303)
    _set_session_cookie(response, token)
    response.delete_cookie(OAUTH_STATE_COOKIE, path="/")
    return response
