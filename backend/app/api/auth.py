"""Invite-only email/password authentication.

Accounts are created by an organization owner or admin through
``POST /auth/accounts``. There is no public sign-up and no password-reset
flow. A signed-in session is an opaque token in an HTTP-only cookie, stored in
the ``sessions`` table.

Organization access is scoped only by ``OrganizationMember`` rows — the same
rows every org-scoped endpoint already checks. Signed-out requests keep the
demo path (organization exists, no membership check) so the seeded demo stays
explorable.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
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
from ..security import hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

SESSION_COOKIE = "heatfair_session"
SESSION_TTL = timedelta(days=7)


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
) -> Organization:
    """Return the organization when the signed-in user belongs to it.

    Signed-out requests keep the demo path: the organization is returned
    without a membership check so the seeded demo remains explorable.
    """
    org = db.get(Organization, organization_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")

    if user is not None:
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


@router.post("/login", response_model=AuthSessionOut)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """Sign in with the email and password an administrator issued."""
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    db.execute(delete(SessionRow).where(SessionRow.expires_at < _now()))
    token = secrets.token_urlsafe(32)
    db.add(SessionRow(token=token, user_id=user.id, expires_at=_now() + SESSION_TTL))
    db.commit()

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

    user = User(
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.flush()
    db.add(OrganizationMember(user_id=user.id, organization_id=org.id, role="member"))
    db.commit()
    db.refresh(user)
    return _session_payload(user, db)
