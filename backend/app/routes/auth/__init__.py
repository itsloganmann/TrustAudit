"""Auth routes package.

Exports one aggregate ``router`` that includes every auth sub-router so
``main.py`` can mount the whole auth surface with a single call:

    from app.routes.auth import router as auth_router
    app.include_router(auth_router, prefix="/api/auth")

Sub-routers are defined in individual files under this package.
"""
from __future__ import annotations

from fastapi import APIRouter

from .magic import router as _magic_router
from .me import router as _me_router
from .signin import router as _signin_router
from .signout import router as _signout_router
from .signup import router as _signup_router
from .verify import router as _verify_router

# W6 sub-routers — OAuth + OTP + identity linking. Imported after W5's so
# the aggregate registration order is deterministic.
from .oauth_google import router as _oauth_google_router
from .oauth_facebook import router as _oauth_facebook_router
from .otp import router as _otp_router
from .identities import router as _identities_router

router = APIRouter(tags=["auth"])
router.include_router(_signup_router)
router.include_router(_signin_router)
router.include_router(_magic_router)
router.include_router(_verify_router)
router.include_router(_me_router)
router.include_router(_signout_router)
router.include_router(_oauth_google_router)
router.include_router(_oauth_facebook_router)
router.include_router(_otp_router)
router.include_router(_identities_router)

__all__ = ["router"]
