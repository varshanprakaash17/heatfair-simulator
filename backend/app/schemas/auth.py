"""Pydantic schemas for invite-only authentication."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _normalise_email(value: str) -> str:
    value = value.strip().lower()
    if "@" not in value:
        raise ValueError("Enter a valid email address")
    return value


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str | None = None
    created_at: datetime


class MembershipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    organization_id: str
    organization_name: str
    role: str


class AuthSessionOut(BaseModel):
    """The signed-in account and the organizations it can act on."""

    user: UserOut
    memberships: list[MembershipOut]


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=256)

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        return _normalise_email(value)


class AccountCreateRequest(BaseModel):
    """An owner/admin invites a staff or worker account into their organization.

    Sign-in is Google, so an invitation only needs the email address the person
    will sign in with.
    """

    organization_id: str = Field(..., min_length=1, max_length=36)
    email: str = Field(..., min_length=3, max_length=255)
    name: str | None = Field(None, max_length=200)

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        return _normalise_email(value)
