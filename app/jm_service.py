from __future__ import annotations

import os
import re
import threading
import time
import uuid
from collections import OrderedDict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from jmcomic import JmOption

from .config import settings


class JmServiceError(Exception):
    """Domain error with an HTTP status code for clean API responses."""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class _TTLCache:
    def __init__(self, maxsize: int = 128, ttl: int = 600) -> None:
        self._maxsize = maxsize
        self._ttl = ttl
        self._lock = threading.Lock()
        self._data: OrderedDict[str, Tuple[float, Any]] = OrderedDict()

    def get(self, key: str) -> Any:
        now = time.monotonic()
        with self._lock:
            item = self._data.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at < now:
                self._data.pop(key, None)
                return None
            self._data.move_to_end(key)
            return value

    def set(self, key: str, value: Any) -> None:
        now = time.monotonic()
        with self._lock:
            self._data[key] = (now + self._ttl, value)
            self._data.move_to_end(key)
            while len(self._data) > self._maxsize:
                self._data.popitem(last=False)


def _detect_image_mime(data: bytes) -> str:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return "image/jpeg"


def _sanitize_key(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z_.-]", "_", value)


def extract_album_id(raw: str) -> Optional[str]:
    """Extract a JM album ID from '422866', 'JM422866', or a comic URL."""
    text = raw.strip()
    if not text:
        return None
    if re.fullmatch(r"\d{4,10}", text):
        return text
    match = re.fullmatch(r"(?i)jm[\s_-]*(\d{4,10})", text)
    if match:
        return match.group(1)
    url_match = re.search(r"/(?:album|photo)/(\d{4,10})", text)
    if url_match:
        return url_match.group(1)
    return None


class JmService:
    def __init__(self) -> None:
        self._thread_local = threading.local()
        self._option = self._build_option()
        self._album_cache = _TTLCache(maxsize=128, ttl=600)
        self._photo_cache = _TTLCache(maxsize=256, ttl=600)
        self._discover_cache = _TTLCache(maxsize=64, ttl=300)
        self._key_locks_guard = threading.Lock()
        self._key_locks: Dict[str, threading.Lock] = {}
        self._evict_lock = threading.Lock()
        self._last_evict_ts = 0.0

    @staticmethod
    def _build_option() -> JmOption:
        option_dict: Dict[str, Any] = {
            "client": {
                "impl": settings.jm_client_impl,
                "retry_times": 3,
            },
            "download": {
                "cache": True,
                "image": {
                    "decode": True,
                    "suffix": ".jpg",
                },
            },
        }
        if settings.jm_proxy:
            option_dict["client"]["postman"] = {
                "meta_data": {
                    "proxies": {
                        "http": settings.jm_proxy,
                        "https": settings.jm_proxy,
                    }
                }
            }
        try:
            return JmOption.construct(option_dict)
        except Exception:
            try:
                return JmOption.create_option_by_dict(option_dict)
            except Exception:
                return JmOption.default()

    def _get_client(self):
        client = getattr(self._thread_local, "client", None)
        if client is None:
            client = self._option.new_jm_client()
            self._thread_local.client = client
        return client

    def _lock_for(self, cache_key: str) -> threading.Lock:
        with self._key_locks_guard:
            lock = self._key_locks.get(cache_key)
            if lock is None:
                if len(self._key_locks) > 2048:
                    self._key_locks.clear()
                lock = threading.Lock()
                self._key_locks[cache_key] = lock
            return lock

    def _maybe_evict_disk_cache(self) -> None:
        now = time.monotonic()
        if now - self._last_evict_ts < 30:
            return
        if not self._evict_lock.acquire(blocking=False):
            return
        try:
            self._last_evict_ts = now
            files: List[Tuple[float, int, Path]] = []
            total_size = 0
            for entry in settings.cache_dir.iterdir():
                if not entry.is_file() or entry.name.startswith("_tmp_"):
                    continue
                try:
                    stat = entry.stat()
                    total_size += stat.st_size
                    files.append((stat.st_mtime, stat.st_size, entry))
                except OSError:
                    continue

            if total_size <= settings.cache_max_bytes:
                return

            files.sort(key=lambda item: item[0])  # oldest first
            target = int(settings.cache_max_bytes * 0.75)
            for _, size, path in files:
                if total_size <= target:
                    break
                try:
                    path.unlink(missing_ok=True)
                    total_size -= size
                except OSError:
                    pass
        finally:
            self._evict_lock.release()

    def _read_cached_file(self, cache_path: Path) -> Optional[bytes]:
        if not cache_path.is_file():
            return None
        try:
            data = cache_path.read_bytes()
            if data:
                try:
                    os.utime(cache_path, None)
                except OSError:
                    pass
                return data
        except OSError:
            return None
        return None

    def _get_album_detail_obj(self, album_id: str):
        cached = self._album_cache.get(album_id)
        if cached is not None:
            return cached
        client = self._get_client()
        try:
            album = client.get_album_detail(album_id)
        except Exception as exc:
            msg = str(exc)
            if "不存在" in msg or "404" in msg or "MissingAlbumPhotoException" in type(exc).__name__:
                raise JmServiceError(f"未找到编号为 JM{album_id} 的漫画", status_code=404) from exc
            raise JmServiceError(f"获取漫画详情失败：{msg}", status_code=502) from exc
        self._album_cache.set(album_id, album)
        return album

    def _get_photo_detail_obj(self, photo_id: str):
        cached = self._photo_cache.get(photo_id)
        if cached is not None:
            return cached
        client = self._get_client()
        try:
            photo = client.get_photo_detail(photo_id)
        except Exception as exc:
            msg = str(exc)
            if "不存在" in msg or "404" in msg or "MissingAlbumPhotoException" in type(exc).__name__:
                raise JmServiceError(f"未找到章节 {photo_id}", status_code=404) from exc
            raise JmServiceError(f"获取章节详情失败：{msg}", status_code=502) from exc
        self._photo_cache.set(photo_id, photo)
        return photo

    def get_album(self, album_id: str) -> Dict[str, Any]:
        album_id = album_id.strip()
        album = self._get_album_detail_obj(album_id)

        aid = str(getattr(album, "album_id", None) or getattr(album, "id", None) or album_id)
        title = str(getattr(album, "title", None) or getattr(album, "name", None) or f"JM{aid}")
        authors = list(getattr(album, "authors", None) or [])
        if not authors:
            single_author = getattr(album, "author", None)
            if single_author:
                authors = [str(single_author)]
        tags = [str(t) for t in (getattr(album, "tags", None) or []) if t]
        works = [str(w) for w in (getattr(album, "works", None) or []) if w]
        actors = [str(a) for a in (getattr(album, "actors", None) or []) if a]
        description = str(getattr(album, "description", None) or "").strip()
        page_count = getattr(album, "page_count", None)

        chapters: List[Dict[str, Any]] = []
        episode_list = getattr(album, "episode_list", None) or []
        for idx, ep in enumerate(episode_list, start=1):
            if isinstance(ep, (tuple, list)):
                pid = str(ep[0])
                ep_sort = str(ep[1]) if len(ep) > 1 and ep[1] else str(idx)
                ep_title = str(ep[2]).strip() if len(ep) > 2 and ep[2] else ""
                label = ep_title or f"第 {ep_sort} 话"
                chapters.append({"photo_id": pid, "index": idx, "title": label})
            elif isinstance(ep, dict):
                pid = str(ep.get("photo_id") or ep.get("id") or "")
                label = str(ep.get("title") or ep.get("name") or f"第 {idx} 话").strip()
                if pid:
                    chapters.append({"photo_id": pid, "index": idx, "title": label})
            else:
                pid = str(getattr(ep, "photo_id", None) or getattr(ep, "id", None) or "")
                label = str(getattr(ep, "title", None) or getattr(ep, "name", None) or f"第 {idx} 话").strip()
                if pid:
                    chapters.append({"photo_id": pid, "index": idx, "title": label})

        if not chapters:
            chapters.append({"photo_id": aid, "index": 1, "title": "全一话"})

        related: List[Dict[str, Any]] = []
        raw_related = getattr(album, "related_list", None) or []
        for item in raw_related[:12]:
            if isinstance(item, dict):
                rid = str(item.get("id") or item.get("album_id") or "").strip()
                rtitle = str(item.get("name") or item.get("title") or "").strip()
                rauthor = str(item.get("author") or "").strip()
                if rid:
                    related.append(
                        {
                            "id": rid,
                            "title": rtitle or f"JM{rid}",
                            "author": rauthor,
                            "cover_url": f"/api/cover/{rid}",
                        }
                    )

        return {
            "id": aid,
            "title": title,
            "authors": authors,
            "tags": tags,
            "works": works,
            "actors": actors,
            "description": description,
            "page_count": int(page_count) if page_count else None,
            "chapter_count": len(chapters),
            "chapters": chapters,
            "related": related,
            "cover_url": f"/api/cover/{aid}",
        }

    @staticmethod
    def _parse_page_items(page_obj: Any) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        seen_ids = set()

        iter_tag_fn = getattr(page_obj, "iter_id_title_tag", None)
        if callable(iter_tag_fn):
            try:
                for aid, title, tags in iter_tag_fn():
                    aid_str = str(aid)
                    if not aid_str or aid_str in seen_ids:
                        continue
                    seen_ids.add(aid_str)
                    items.append(
                        {
                            "id": aid_str,
                            "title": str(title or f"JM{aid_str}"),
                            "tags": [str(t) for t in (tags or []) if t],
                            "cover_url": f"/api/cover/{aid_str}",
                        }
                    )
                if items:
                    return items
            except Exception:
                items.clear()
                seen_ids.clear()

        content = getattr(page_obj, "content", None) or []
        for entry in content:
            aid_str = ""
            title = ""
            tags: List[str] = []
            if isinstance(entry, (tuple, list)) and len(entry) >= 2:
                aid_str = str(entry[0])
                info = entry[1]
                if isinstance(info, dict):
                    title = str(info.get("name") or info.get("title") or f"JM{aid_str}")
                    tags = [str(t) for t in (info.get("tags") or []) if t]
                else:
                    title = str(info or f"JM{aid_str}")
            elif isinstance(entry, dict):
                aid_str = str(entry.get("id") or entry.get("album_id") or "")
                title = str(entry.get("name") or entry.get("title") or f"JM{aid_str}")
                tags = [str(t) for t in (entry.get("tags") or []) if t]
            else:
                aid_str = str(getattr(entry, "album_id", None) or getattr(entry, "id", None) or "")
                title = str(getattr(entry, "title", None) or getattr(entry, "name", None) or f"JM{aid_str}")
                tags = [str(t) for t in (getattr(entry, "tags", None) or []) if t]

            if aid_str and aid_str not in seen_ids:
                seen_ids.add(aid_str)
                items.append(
                    {
                        "id": aid_str,
                        "title": title or f"JM{aid_str}",
                        "tags": tags,
                        "cover_url": f"/api/cover/{aid_str}",
                    }
                )
        return items

    def search(self, query: str, page: int = 1, order_by: str = "mr") -> Dict[str, Any]:
        query = query.strip()
        if not query:
            raise JmServiceError("请输入搜索关键词或漫画编号", status_code=400)
        page = max(1, page)
        valid_orders = {"mr", "mv", "tf", "mp"}
        order_code = order_by if order_by in valid_orders else "mr"

        client = self._get_client()
        try:
            try:
                search_page = client.search_site(search_query=query, page=page, order_by=order_code)
            except TypeError:
                search_page = client.search_site(search_query=query, page=page)
        except Exception as exc:
            raise JmServiceError(f"搜索失败：{exc}", status_code=502) from exc

        items = self._parse_page_items(search_page)
        total = int(getattr(search_page, "total", len(items)) or len(items))
        page_size = int(getattr(search_page, "page_size", 0) or max(len(items), 1))
        page_count = int(getattr(search_page, "page_count", 0) or 0)
        if page_count <= 0:
            page_count = max(1, (total + page_size - 1) // page_size) if total > 0 else 1

        return {
            "query": query,
            "page": page,
            "order_by": order_code,
            "total": total,
            "page_size": page_size,
            "page_count": page_count,
            "items": items,
        }

    def discover(self, tab: str = "week", page: int = 1) -> Dict[str, Any]:
        page = max(1, page)
        presets = {
            "latest": ("a", "mr"),
            "week": ("w", "mv"),
            "month": ("m", "mv"),
            "all": ("a", "tf"),
        }
        tab_key = tab if tab in presets else "week"
        cache_key = f"{tab_key}:{page}"
        cached = self._discover_cache.get(cache_key)
        if cached is not None:
            return cached

        time_val, order_val = presets[tab_key]
        client = self._get_client()
        try:
            cat_page = client.categories_filter(
                page=page,
                time=time_val,
                category="0",
                order_by=order_val,
            )
        except Exception as exc:
            raise JmServiceError(f"获取排行榜失败：{exc}", status_code=502) from exc

        items = self._parse_page_items(cat_page)
        total = int(getattr(cat_page, "total", len(items)) or len(items))
        page_size = int(getattr(cat_page, "page_size", 0) or max(len(items), 1))
        page_count = int(getattr(cat_page, "page_count", 0) or getattr(cat_page, "total_page", 0) or 0)
        if page_count <= 0:
            page_count = max(1, (total + page_size - 1) // page_size) if total > 0 else 1

        result = {
            "tab": tab_key,
            "page": page,
            "total": total,
            "page_size": page_size,
            "page_count": page_count,
            "items": items,
        }
        self._discover_cache.set(cache_key, result)
        return result

    def get_photo(self, photo_id: str) -> Dict[str, Any]:
        photo_id = photo_id.strip()
        photo = self._get_photo_detail_obj(photo_id)
        count = len(photo)
        pages = [
            {
                "index": i,
                "number": i + 1,
                "filename": f"{i + 1:03d}.jpg",
                "url": f"/api/photo/{photo_id}/page/{i}",
            }
            for i in range(count)
        ]
        return {
            "photo_id": str(getattr(photo, "photo_id", None) or photo_id),
            "album_id": str(getattr(photo, "album_id", None) or photo_id),
            "title": str(getattr(photo, "title", None) or getattr(photo, "name", None) or f"章节 {photo_id}"),
            "page_count": count,
            "pages": pages,
        }

    def get_cover_bytes(self, album_id: str) -> Tuple[bytes, str]:
        album_id = album_id.strip()
        cache_key = f"cover_{_sanitize_key(album_id)}"
        cache_path = settings.cache_dir / f"{cache_key}.jpg"

        cached = self._read_cached_file(cache_path)
        if cached is not None:
            return cached, _detect_image_mime(cached)

        lock = self._lock_for(cache_key)
        with lock:
            cached = self._read_cached_file(cache_path)
            if cached is not None:
                return cached, _detect_image_mime(cached)

            # Must end with .jpg so jmcomic/Pillow recognizes the image format
            tmp_path = settings.cache_dir / f"_tmp_{cache_key}_{uuid.uuid4().hex}.jpg"
            client = self._get_client()
            try:
                client.download_album_cover(album_id, str(tmp_path))
                if not tmp_path.is_file() or tmp_path.stat().st_size == 0:
                    raise JmServiceError("封面下载失败", status_code=502)
                os.replace(tmp_path, cache_path)
                data = cache_path.read_bytes()
            except Exception as cover_exc:
                tmp_path.unlink(missing_ok=True)
                # Fallback: resolve first chapter's photo_id and use page 0 as cover
                try:
                    album_info = self.get_album(album_id)
                    first_pid = album_info["chapters"][0]["photo_id"] if album_info.get("chapters") else album_id
                    return self.get_page_bytes(first_pid, 0)
                except Exception:
                    if isinstance(cover_exc, JmServiceError):
                        raise cover_exc
                    raise JmServiceError(f"获取封面失败：{cover_exc}", status_code=502) from cover_exc

        self._maybe_evict_disk_cache()
        return data, _detect_image_mime(data)

    def get_page_bytes(self, photo_id: str, index: int) -> Tuple[bytes, str]:
        photo_id = photo_id.strip()
        photo = self._get_photo_detail_obj(photo_id)
        if index < 0 or index >= len(photo):
            raise JmServiceError(f"页码超出范围：{index + 1}/{len(photo)}", status_code=404)

        cache_key = f"page_{_sanitize_key(photo_id)}_{index:04d}"
        cache_path = settings.cache_dir / f"{cache_key}.jpg"

        cached = self._read_cached_file(cache_path)
        if cached is not None:
            return cached, _detect_image_mime(cached)

        lock = self._lock_for(cache_key)
        with lock:
            cached = self._read_cached_file(cache_path)
            if cached is not None:
                return cached, _detect_image_mime(cached)

            image_detail = photo[index]
            # Use .jpg suffix on temp path so PIL/jmcomic detects format cleanly
            tmp_path = settings.cache_dir / f"_tmp_{cache_key}_{uuid.uuid4().hex}.jpg"
            client = self._get_client()
            try:
                client.download_by_image_detail(image_detail, str(tmp_path), decode_image=True)
                if not tmp_path.is_file() or tmp_path.stat().st_size == 0:
                    raise JmServiceError("图片下载为空", status_code=502)
                os.replace(tmp_path, cache_path)
                data = cache_path.read_bytes()
            except JmServiceError:
                tmp_path.unlink(missing_ok=True)
                raise
            except Exception as exc:
                tmp_path.unlink(missing_ok=True)
                raise JmServiceError(f"加载第 {index + 1} 页图片失败：{exc}", status_code=502) from exc

        self._maybe_evict_disk_cache()
        return data, _detect_image_mime(data)


jm_service = JmService()
