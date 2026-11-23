from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable, TypeVar

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .auth import (
    clear_session_cookie,
    is_authenticated,
    require_auth,
    set_session_cookie,
    verify_password,
)
from .config import settings
from .jm_service import JmServiceError, extract_album_id, jm_service

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

executor = ThreadPoolExecutor(max_workers=settings.jm_workers)
T = TypeVar("T")


async def run_blocking(fn: Callable[..., T], *args) -> T:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(executor, fn, *args)


app = FastAPI(
    title="Rinseki的本子站",
    description="Lightweight stateless comic preview, search, and browser-side ZIP downloader powered by JMComic-Crawler-Python.",
    docs_url=None,
    redoc_url=None,
)

app.add_middleware(GZipMiddleware, minimum_size=500)


@app.exception_handler(JmServiceError)
async def jm_service_error_handler(_request: Request, exc: JmServiceError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Robots-Tag", "noindex, nofollow, noarchive")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    return response


class LoginPayload(BaseModel):
    password: str


@app.get("/api/health")
async def health():
    return {"status": "ok", "auth_enabled": settings.auth_enabled}


@app.get("/api/auth/status")
async def auth_status(request: Request):
    return {
        "auth_enabled": settings.auth_enabled,
        "authenticated": is_authenticated(request),
    }


@app.post("/api/auth/login")
async def auth_login(payload: LoginPayload, request: Request, response: Response):
    if not verify_password(payload.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="访问口令不正确",
        )
    set_session_cookie(response, request)
    return {"ok": True, "auth_enabled": settings.auth_enabled}


@app.post("/api/auth/logout")
async def auth_logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}


@app.get("/api/discover", dependencies=[Depends(require_auth)])
async def discover_comics(
    tab: str = Query("week", pattern="^(latest|week|month|all)$"),
    page: int = Query(1, ge=1, le=200),
):
    return await run_blocking(jm_service.discover, tab, page)


@app.get("/api/search", dependencies=[Depends(require_auth)])
async def search_comics(
    q: str = Query(..., min_length=1, max_length=200),
    page: int = Query(1, ge=1, le=500),
    mode: str = Query("auto", pattern="^(auto|id|keyword)$"),
    order_by: str = Query("mr", pattern="^(mr|mv|tf|mp)$"),
):
    raw = q.strip()
    detected_id = extract_album_id(raw) if mode in ("auto", "id") else None
    if detected_id:
        album = await run_blocking(jm_service.get_album, detected_id)
        return {"type": "album", "album": album}

    if mode == "id":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请输入有效的数字编号（例如 422866 或 JM422866）",
        )

    result = await run_blocking(jm_service.search, raw, page, order_by)
    return {"type": "search", **result}


@app.get("/api/album/{album_id}", dependencies=[Depends(require_auth)])
async def get_album(album_id: str):
    extracted = extract_album_id(album_id)
    if not extracted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的漫画编号")
    return await run_blocking(jm_service.get_album, extracted)


@app.get("/api/cover/{album_id}", dependencies=[Depends(require_auth)])
async def get_cover(album_id: str):
    extracted = extract_album_id(album_id)
    if not extracted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的漫画编号")
    data, media_type = await run_blocking(jm_service.get_cover_bytes, extracted)
    return Response(
        content=data,
        media_type=media_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )


@app.get("/api/photo/{photo_id}", dependencies=[Depends(require_auth)])
async def get_photo(photo_id: str):
    extracted = extract_album_id(photo_id)
    if not extracted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的章节编号")
    return await run_blocking(jm_service.get_photo, extracted)


@app.get("/api/photo/{photo_id}/page/{index}", dependencies=[Depends(require_auth)])
async def get_photo_page(photo_id: str, index: int):
    extracted = extract_album_id(photo_id)
    if not extracted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的章节编号")
    data, media_type = await run_blocking(jm_service.get_page_bytes, extracted, index)
    return Response(
        content=data,
        media_type=media_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    return FileResponse(STATIC_DIR / "index.html")
