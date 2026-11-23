from __future__ import annotations

import os
import secrets
import tempfile
from dataclasses import dataclass
from pathlib import Path


def _load_dotenv_if_present() -> None:
    """Lightweight .env loader without requiring python-dotenv."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.is_file():
        return
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except OSError:
        pass


_load_dotenv_if_present()


@dataclass(frozen=True)
class Settings:
    access_password: str
    auth_secret: str
    jm_proxy: str
    jm_client_impl: str
    cache_dir: Path
    cache_max_bytes: int
    jm_workers: int
    port: int

    @property
    def auth_enabled(self) -> bool:
        return bool(self.access_password)


def load_settings() -> Settings:
    access_password = os.getenv("ACCESS_PASSWORD", "").strip()
    auth_secret = os.getenv("AUTH_SECRET", "").strip() or secrets.token_hex(32)
    jm_proxy = os.getenv("JM_PROXY", "").strip()
    jm_client_impl = os.getenv("JM_CLIENT_IMPL", "api").strip().lower()
    if jm_client_impl not in {"api", "html"}:
        jm_client_impl = "api"

    cache_root = os.getenv("CACHE_DIR", "").strip()
    if cache_root:
        cache_dir = Path(cache_root)
    else:
        cache_dir = Path(tempfile.gettempdir()) / "jmcomic_web_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)

    try:
        cache_max_mb = max(20, int(os.getenv("CACHE_MAX_MB", "120")))
    except ValueError:
        cache_max_mb = 120

    try:
        jm_workers = max(2, min(16, int(os.getenv("JM_WORKERS", "6"))))
    except ValueError:
        jm_workers = 6

    try:
        port = int(os.getenv("PORT", "7860"))
    except ValueError:
        port = 7860

    return Settings(
        access_password=access_password,
        auth_secret=auth_secret,
        jm_proxy=jm_proxy,
        jm_client_impl=jm_client_impl,
        cache_dir=cache_dir,
        cache_max_bytes=cache_max_mb * 1024 * 1024,
        jm_workers=jm_workers,
        port=port,
    )


settings = load_settings()
