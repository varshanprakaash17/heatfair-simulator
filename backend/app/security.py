"""Password hashing for invite-only email/password accounts.

PBKDF2-SHA256 from the standard library keeps this dependency-free while
storing a per-password salt. Format: ``pbkdf2_sha256$<iterations>$<salt>$<hash>``.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

_ITERATIONS = 240_000
_ALGORITHM = "pbkdf2_sha256"


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), _ITERATIONS
    ).hex()
    return f"{_ALGORITHM}${_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt, digest = stored.split("$")
        rounds = int(iterations)
    except (ValueError, AttributeError):
        return False
    if algorithm != _ALGORITHM:
        return False
    candidate = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), rounds
    ).hex()
    return hmac.compare_digest(candidate, digest)
