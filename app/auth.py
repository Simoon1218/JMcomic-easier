from __future__ import annotations

import base64
import hashlib
import hmac
import time
from typing import Optional

from fastapi import HTTPException, Request, Response, status

from .config import settings

SESSION_COOKIE_NAME = "jm_session"
SESSION_TTL_SECONDS = 7 * 24 * 3600  # 7 days


def _sign(payload: str) -> str:
    digest = hmac.new(
        settings.auth_secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def create_session_token() -> str:
    exp = int(time.time()) + SESSION_TTL_SECONDS
    payload = f"ok.{exp}"
    sig = _sign(payload)
    return f"{payload}.{sig}"


def verify_session_token(token: Optional[str]) -> bool:
    if not token:
        return False
    parts = token.split(".")
    if len(parts) != 3:
        return False
    marker, exp_str, sig = parts
    if marker != "ok":
        return False
    try:
        exp = int(exp_str)
    except ValueError:
        return False
    if exp < int(time.time()):
        return False
    expected = _sign(f"{marker}.{exp_str}")
    return hmac.compare_digest(sig, expected)


def verify_password(password: str) -> bool:
    if not settings.auth_enabled:
        return True
    return hmac.compare_digest(password.strip(), settings.access_password)


def is_authenticated(request: Request) -> bool:
    if not settings.auth_enabled:
        return True
    cookie_token = request.cookies.get(SESSION_COOKIE_NAME)
    if verify_session_token(cookie_token):
        return True
    header_token = request.headers.get("X-Access-Token")
    if verify_session_token(header_token):
        return True
    return False


def set_session_cookie(response: Response, request: Request) -> str:
    token = create_session_token()
    is_https = (
        request.url.scheme == "https"
        or request.headers.get("x-forwarded-proto", "").lower() == "https"
    )
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=is_https,
        path="/",
    )
    return token


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")


def require_auth(request: Request) -> None:
    if not is_authenticated(request):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="请输入访问口令后再继续操作",
        )
