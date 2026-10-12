import os

from dotenv import load_dotenv
from fastapi import HTTPException, Request
from fastapi_plugin import Auth0FastAPI

load_dotenv()

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN", "")
AUTH0_AUDIENCE = os.getenv("AUTH0_AUDIENCE", "")
# Auth0 user ids (token `sub`) allowed to use the admin API; comma-separated.
ADMIN_SUBS = {s.strip() for s in os.getenv("AUTH0_ADMIN_SUBS", "").split(",") if s.strip()}

# Admin enforcement point. The SDK validates the Bearer token (JWKS, issuer,
# audience, expiry); unconfigured -> the gate fails closed (503).
_auth0 = (
    Auth0FastAPI(domain=AUTH0_DOMAIN, audience=AUTH0_AUDIENCE)
    if AUTH0_DOMAIN and AUTH0_AUDIENCE
    else None
)
_require_auth = _auth0.require_auth() if _auth0 is not None else None


def _assert_admin(claims: dict) -> None:
    # A valid token proves authentication, not that the caller is the admin.
    # Require `sub` on the allowlist; empty allowlist fails closed. The caller's
    # id is echoed back so the real admin can discover it and self-configure.
    subject = claims.get("sub")
    if not ADMIN_SUBS or subject not in ADMIN_SUBS:
        raise HTTPException(
            status_code=403, detail=f"not authorized as admin (your id: {subject})"
        )


async def require_admin(request: Request) -> dict:
    if _require_auth is None:
        raise HTTPException(status_code=503, detail="admin auth not configured")
    claims = await _require_auth(request)
    _assert_admin(claims)
    return claims
