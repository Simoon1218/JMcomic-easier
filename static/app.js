import { createZipBlob } from "./zip.js";
import { createPdfBlob } from "./pdf.js";

const STORAGE_KEYS = {
  THEME: "jm_theme",
  HISTORY: "jm_history_v1",
  FAVORITES: "jm_favorites_v1",
  PROGRESS: "jm_read_progress_v1",
  READER_MODE: "jm_reader_mode",
  READER_WIDTH: "jm_reader_width",
  READER_BRIGHTNESS: "jm_reader_brightness",
  READER_RTL: "jm_reader_rtl",
};

const state = {
  deviceType: "desktop", // mobile | tablet | desktop
  isTouch: false,
  authEnabled: false,
  authenticated: false,
  currentView: "home", // home | album | reader
  lastSearch: null, // { query, page, mode, orderBy }
  discoverTab: "week",
  discoverPage: 1,
  discoverLoaded: false,
  currentAlbum: null,
  currentPhoto: null,
  chapterDescending: false,
  batchMode: false,
  selectedChapters: new Set(),
  readerMode: localStorage.getItem(STORAGE_KEYS.READER_MODE) || "scroll", // scroll | single | double
  readerWidth: Number(localStorage.getItem(STORAGE_KEYS.READER_WIDTH) || "80"),
  readerBrightness: Number(localStorage.getItem(STORAGE_KEYS.READER_BRIGHTNESS) || "100"),
  readerRtl: localStorage.getItem(STORAGE_KEYS.READER_RTL) !== "false",
  autoScrollActive: false,
  autoScrollSpeedIdx: 1, // 0: slow, 1: medium, 2: fast
  autoScrollRaf: null,
  singlePageIndex: 0,
  downloadController: null,
  downloading: false,
  pageObserver: null,
  suppressHashEvent: false,
};

const $ = (id) => document.getElementById(id);

const els = {
  authGate: $("authGate"),
  authForm: $("authForm"),
  authPasswordInput: $("authPasswordInput"),
  authSubmitBtn: $("authSubmitBtn"),
  authError: $("authError"),

  appShell: $("appShell"),
  brandHomeBtn: $("brandHomeBtn"),
  headerSearchForm: $("headerSearchForm"),
  searchModeSelect: $("searchModeSelect"),
  searchInput: $("searchInput"),
  themeToggleBtn: $("themeToggleBtn"),
  themeIcon: $("themeIcon"),
  logoutBtn: $("logoutBtn"),

  globalAlert: $("globalAlert"),
  viewHome: $("viewHome"),
  heroCard: $("heroCard"),
  heroSearchForm: $("heroSearchForm"),
  heroSearchInput: $("heroSearchInput"),
  favoritesSection: $("favoritesSection"),
  favoritesCount: $("favoritesCount"),
  favoritesGrid: $("favoritesGrid"),
  exportBackupBtn: $("exportBackupBtn"),
  importBackupBtn: $("importBackupBtn"),
  importBackupInput: $("importBackupInput"),
  historySection: $("historySection"),
  historyList: $("historyList"),
  historyImportBackupBtn: $("historyImportBackupBtn"),
  clearHistoryBtn: $("clearHistoryBtn"),
  searchResultsSection: $("searchResultsSection"),
  searchResultsHeading: $("searchResultsHeading"),
  searchOrderSelect: $("searchOrderSelect"),
  searchResultsMeta: $("searchResultsMeta"),
  searchResultsGrid: $("searchResultsGrid"),
  searchPagination: $("searchPagination"),
  discoverSection: $("discoverSection"),
  discoverTabs: $("discoverTabs"),
  discoverGrid: $("discoverGrid"),
  discoverPagination: $("discoverPagination"),

  viewAlbum: $("viewAlbum"),
  backFromAlbumBtn: $("backFromAlbumBtn"),
  albumDetailContainer: $("albumDetailContainer"),

  viewReader: $("viewReader"),
  backFromReaderBtn: $("backFromReaderBtn"),
  readerTitle: $("readerTitle"),
  readerChapterSelect: $("readerChapterSelect"),
  modeScrollBtn: $("modeScrollBtn"),
  modeSingleBtn: $("modeSingleBtn"),
  modeDoubleBtn: $("modeDoubleBtn"),
  readerWidthSlider: $("readerWidthSlider"),
  readerProgressBtn: $("readerProgressBtn"),
  readerProgressText: $("readerProgressText"),
  readerDownloadChapterBtn: $("readerDownloadChapterBtn"),
  readerToolsDrawer: $("readerToolsDrawer"),
  readerPageSlider: $("readerPageSlider"),
  readerSliderVal: $("readerSliderVal"),
  readerBrightnessSlider: $("readerBrightnessSlider"),
  readerBrightnessVal: $("readerBrightnessVal"),
  autoScrollBtn: $("autoScrollBtn"),
  autoScrollSpeedBtn: $("autoScrollSpeedBtn"),
  readerRtlBtn: $("readerRtlBtn"),
  readerFullscreenBtn: $("readerFullscreenBtn"),
  readerDownloadPdfBtn: $("readerDownloadPdfBtn"),
  readerCanvas: $("readerCanvas"),
  prevChapterBtn: $("prevChapterBtn"),
  nextChapterBtn: $("nextChapterBtn"),
  singlePageControls: $("singlePageControls"),
  prevPageBtn: $("prevPageBtn"),
  nextPageBtn: $("nextPageBtn"),
  jumpPageInput: $("jumpPageInput"),

  loadingOverlay: $("loadingOverlay"),
  loadingText: $("loadingText"),

  downloadDock: $("downloadDock"),
  downloadTitle: $("downloadTitle"),
  cancelDownloadBtn: $("cancelDownloadBtn"),
  downloadProgressBar: $("downloadProgressBar"),
  downloadStatusText: $("downloadStatusText"),
  downloadPercentText: $("downloadPercentText"),

  scrollProgressTrack: $("scrollProgressTrack"),
  scrollProgressBar: $("scrollProgressBar"),
  backToTopBtn: $("backToTopBtn"),
  toastContainer: $("toastContainer"),
};

const ICONS = {
  sun: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
  moon: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`,
  book: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`,
  download: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
  heart: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`,
  heartFilled: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`,
  copy: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
};

// ---------------- Utilities ----------------

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeFilename(name, fallback = "comic") {
  const cleaned = String(name ?? "")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "");
  return (cleaned || fallback).slice(0, 120);
}

function showToast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  els.toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 0.25s ease";
    setTimeout(() => el.remove(), 260);
  }, 2200);
}

function showLoading(text = "正在加载...") {
  els.loadingText.textContent = text;
  els.loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
  els.loadingOverlay.classList.add("hidden");
}

function showAlert(message) {
  if (!message) {
    els.globalAlert.classList.add("hidden");
    els.globalAlert.textContent = "";
    return;
  }
  els.globalAlert.textContent = message;
  els.globalAlert.classList.remove("hidden");
}

async function apiFetch(url, options = {}) {
  const resp = await fetch(url, {
    credentials: "same-origin",
    ...options,
  });
  if (resp.status === 401) {
    state.authenticated = false;
    showAuthGate();
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.detail || "会话已过期，请重新输入访问口令");
  }
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.detail || `请求失败 (${resp.status})`);
  }
  return resp.json();
}

// ---------------- Hash Router ----------------

function setHash(hashStr) {
  const normalized = hashStr.startsWith("#") ? hashStr : `#${hashStr}`;
  if (window.location.hash === normalized) return;
  state.suppressHashEvent = true;
  window.location.hash = normalized;
  setTimeout(() => {
    state.suppressHashEvent = false;
  }, 0);
}

async function handleRouteFromHash() {
  if (state.authEnabled && !state.authenticated) return;
  const raw = window.location.hash.replace(/^#/, "") || "/";

  if (raw.startsWith("/album/")) {
    const albumId = decodeURIComponent(raw.slice("/album/".length).split("?")[0]);
    if (albumId) {
      await loadAlbum(albumId, { updateHash: false });
      return;
    }
  }

  if (raw.startsWith("/read/")) {
    const parts = raw.slice("/read/".length).split("/");
    const photoId = decodeURIComponent(parts[parts.length - 1] || "");
    const albumId = parts.length >= 2 ? decodeURIComponent(parts[0]) : "";
    if (albumId && (!state.currentAlbum || String(state.currentAlbum.id) !== albumId)) {
      try {
        state.currentAlbum = await apiFetch(`/api/album/${encodeURIComponent(albumId)}`);
      } catch {
        // Proceed with photo only
      }
    }
    if (photoId) {
      await openReader(photoId, { updateHash: false });
      return;
    }
  }

  if (raw.startsWith("/search")) {
    const qs = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "";
    const params = new URLSearchParams(qs);
    const q = params.get("q") || "";
    const p = Number(params.get("p") || "1") || 1;
    const mode = params.get("mode") || "auto";
    if (q) {
      await performSearch(q, p, mode, { updateHash: false });
      return;
    }
  }

  switchView("home");
}

// ---------------- Device Detection ----------------

function detectDeviceType() {
  const width = window.innerWidth;
  const ua = navigator.userAgent || "";
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const hasTouch = coarsePointer || "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
  const isMobileUA = /Android.*Mobile|iPhone|iPod|Windows Phone|Mobile Safari/i.test(ua);
  const isTabletUA = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));

  let device = "desktop";
  if (width <= 680 || (isMobileUA && width <= 820)) {
    device = "mobile";
  } else if (width <= 1080 || isTabletUA || (coarsePointer && width <= 1200)) {
    device = "tablet";
  }

  state.deviceType = device;
  state.isTouch = hasTouch;
  document.documentElement.setAttribute("data-device", device);
  document.documentElement.setAttribute("data-touch", hasTouch ? "true" : "false");

  // Keep reader canvas comfortable per device without overwriting user's desktop setting
  if (device === "mobile") {
    document.documentElement.style.setProperty("--reader-width", "100%");
  } else {
    document.documentElement.style.setProperty("--reader-width", `${state.readerWidth}%`);
  }
}

// ---------------- Theme ----------------

function applyTheme(theme) {
  const finalTheme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", finalTheme);
  localStorage.setItem(STORAGE_KEYS.THEME, finalTheme);
  els.themeIcon.innerHTML = finalTheme === "dark" ? ICONS.sun : ICONS.moon;
}

function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.THEME) || "dark";
  applyTheme(saved);
  applyBrightness(state.readerBrightness);
}

function applyBrightness(val) {
  const clamped = Math.max(35, Math.min(100, Number(val) || 100));
  state.readerBrightness = clamped;
  localStorage.setItem(STORAGE_KEYS.READER_BRIGHTNESS, String(clamped));
  document.documentElement.style.setProperty("--reader-brightness", String(clamped / 100));
  if (els.readerBrightnessSlider) els.readerBrightnessSlider.value = String(clamped);
  if (els.readerBrightnessVal) els.readerBrightnessVal.textContent = `${clamped}%`;
}

// ---------------- Backup & Restore ----------------

function exportBackup() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites: loadFavorites(),
    progress: loadAllProgress(),
    history: loadHistory(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  triggerBlobDownload(blob, `rinseki-backup-${stamp}.json`);
  showToast("已导出收藏与阅读进度备份");
}

async function importBackupFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data !== "object") throw new Error("无效的备份文件");

    if (Array.isArray(data.favorites)) {
      const existing = loadFavorites();
      const map = new Map(existing.map((i) => [String(i.id), i]));
      for (const item of data.favorites) {
        if (item?.id && !map.has(String(item.id))) {
          map.set(String(item.id), item);
        }
      }
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify([...map.values()].slice(0, 200)));
      renderFavorites();
    }

    if (data.progress && typeof data.progress === "object") {
      const merged = { ...loadAllProgress(), ...data.progress };
      localStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(merged));
    }

    if (Array.isArray(data.history)) {
      const existing = loadHistory();
      const map = new Map(existing.map((i) => [String(i.id), i]));
      for (const item of data.history) {
        if (item?.id && !map.has(String(item.id))) {
          map.set(String(item.id), item);
        }
      }
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify([...map.values()].slice(0, 24)));
      renderHistory();
    }

    showToast("备份导入成功，已合并收藏与进度");
  } catch (err) {
    showAlert(`导入备份失败：${err.message}`);
  }
}

// ---------------- Favorites & Progress & History ----------------

function loadFavorites() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.FAVORITES) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isFavorite(albumId) {
  return loadFavorites().some((item) => String(item.id) === String(albumId));
}

function toggleFavorite(album) {
  if (!album?.id) return false;
  const list = loadFavorites();
  const exists = list.some((item) => String(item.id) === String(album.id));
  let next;
  if (exists) {
    next = list.filter((item) => String(item.id) !== String(album.id));
    showToast("已移出收藏");
  } else {
    next = [
      {
        id: String(album.id),
        title: album.title || `JM${album.id}`,
        cover_url: album.cover_url || `/api/cover/${album.id}`,
        ts: Date.now(),
      },
      ...list,
    ].slice(0, 100);
    showToast("已加入我的收藏");
  }
  localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(next));
  renderFavorites();
  return !exists;
}

function removeFavoriteById(albumId) {
  const next = loadFavorites().filter((item) => String(item.id) !== String(albumId));
  localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(next));
  renderFavorites();
  showToast("已移出收藏");
}

function renderFavorites() {
  const list = loadFavorites();
  if (!list.length) {
    els.favoritesSection.classList.add("hidden");
    els.favoritesGrid.innerHTML = "";
    return;
  }
  els.favoritesSection.classList.remove("hidden");
  els.favoritesCount.textContent = `${list.length} 本`;
  els.favoritesGrid.innerHTML = list
    .map(
      (item) => `
      <article class="comic-card" data-album-id="${escapeHtml(item.id)}">
        <div class="comic-cover-wrap">
          <img src="${escapeHtml(item.cover_url || `/api/cover/${item.id}`)}" alt="${escapeHtml(item.title)}" loading="lazy" />
          <span class="comic-id-badge">JM${escapeHtml(item.id)}</span>
          <button class="comic-card-fav-remove" type="button" data-remove-fav="${escapeHtml(item.id)}" title="取消收藏">×</button>
        </div>
        <div class="comic-card-body">
          <div class="comic-card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
        </div>
      </article>
    `
    )
    .join("");
}

function loadAllProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROGRESS) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getAlbumProgress(albumId) {
  if (!albumId) return null;
  return loadAllProgress()[String(albumId)] || null;
}

function saveReadProgress(albumId, photoId, chapterIndex, pageNumber) {
  if (!albumId || !photoId) return;
  const all = loadAllProgress();
  all[String(albumId)] = {
    photoId: String(photoId),
    chapterIndex: Number(chapterIndex) || 1,
    pageNumber: Math.max(1, Number(pageNumber) || 1),
    ts: Date.now(),
  };
  // Keep latest 120 albums
  const entries = Object.entries(all)
    .sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0))
    .slice(0, 120);
  localStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(Object.fromEntries(entries)));
}

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToHistory(album) {
  if (!album?.id) return;
  const list = loadHistory().filter((item) => String(item.id) !== String(album.id));
  list.unshift({
    id: String(album.id),
    title: album.title || `JM${album.id}`,
    ts: Date.now(),
  });
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(list.slice(0, 16)));
  renderHistory();
}

function renderHistory() {
  const list = loadHistory();
  if (!list.length) {
    els.historySection.classList.add("hidden");
    els.historyList.innerHTML = "";
    return;
  }
  els.historySection.classList.remove("hidden");
  els.historyList.innerHTML = list
    .map(
      (item) => `
      <button class="chip" type="button" data-album-id="${escapeHtml(item.id)}" title="${escapeHtml(item.title)}">
        <span class="chip-id">JM${escapeHtml(item.id)}</span>
        <span>${escapeHtml(item.title)}</span>
      </button>
    `
    )
    .join("");
}

// ---------------- Auth ----------------

function showAuthGate() {
  document.body.classList.remove("immersive-reader");
  els.authGate.classList.remove("hidden");
  els.appShell.classList.add("hidden");
  els.authPasswordInput.focus();
}

function showAppShell() {
  els.authGate.classList.add("hidden");
  els.appShell.classList.remove("hidden");
  els.logoutBtn.classList.toggle("hidden", !state.authEnabled);
}

async function checkAuthStatus() {
  const data = await fetch("/api/auth/status", { credentials: "same-origin" }).then((r) => r.json());
  state.authEnabled = Boolean(data.auth_enabled);
  state.authenticated = Boolean(data.authenticated);
  if (state.authEnabled && !state.authenticated) {
    showAuthGate();
  } else {
    showAppShell();
    await handleRouteFromHash();
    if (!state.discoverLoaded) loadDiscover(state.discoverTab, 1);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const password = els.authPasswordInput.value;
  els.authError.classList.add("hidden");
  els.authSubmitBtn.disabled = true;
  try {
    const resp = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || "口令错误");
    }
    state.authenticated = true;
    els.authPasswordInput.value = "";
    showAppShell();
    await handleRouteFromHash();
    if (!state.discoverLoaded) loadDiscover(state.discoverTab, 1);
  } catch (err) {
    els.authError.textContent = err.message;
    els.authError.classList.remove("hidden");
  } finally {
    els.authSubmitBtn.disabled = false;
  }
}

async function handleLogout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  state.authenticated = false;
  showAuthGate();
}

// ---------------- View Switching ----------------

function disconnectPageObserver() {
  if (state.pageObserver) {
    state.pageObserver.disconnect();
    state.pageObserver = null;
  }
}

function switchView(name) {
  const isReader = name === "reader";
  document.body.classList.toggle("in-reader", isReader);
  if (!isReader) {
    stopAutoScroll();
    document.body.classList.remove("immersive-reader");
    if (els.readerToolsDrawer) els.readerToolsDrawer.classList.add("hidden");
    disconnectPageObserver();
  }
  state.currentView = name;
  els.viewHome.classList.toggle("hidden", name !== "home");
  els.viewAlbum.classList.toggle("hidden", name !== "album");
  els.viewReader.classList.toggle("hidden", !isReader);
  els.scrollProgressTrack.classList.toggle("hidden", !isReader);
  if (isReader) {
    els.scrollProgressBar.style.width = "0%";
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}

// ---------------- Discover / Rankings ----------------

async function loadDiscover(tab = "week", page = 1) {
  state.discoverTab = tab;
  state.discoverPage = page;
  els.discoverTabs.querySelectorAll("[data-discover-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.discoverTab === tab);
  });
  els.discoverGrid.innerHTML = `<p class="muted">正在加载榜单...</p>`;
  try {
    const params = new URLSearchParams({ tab, page: String(page) });
    const data = await apiFetch(`/api/discover?${params.toString()}`);
    state.discoverLoaded = true;
    renderComicCardGrid(els.discoverGrid, data.items);

    if (data.page_count > 1) {
      els.discoverPagination.classList.remove("hidden");
      els.discoverPagination.innerHTML = `
        <button class="btn btn-secondary btn-sm" type="button" data-discover-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}>上一页</button>
        <span class="muted">第 ${data.page} / ${data.page_count} 页</span>
        <button class="btn btn-secondary btn-sm" type="button" data-discover-page="${data.page + 1}" ${data.page >= data.page_count ? "disabled" : ""}>下一页</button>
      `;
    } else {
      els.discoverPagination.classList.add("hidden");
    }
  } catch (err) {
    els.discoverGrid.innerHTML = `<p class="muted">榜单加载失败：${escapeHtml(err.message)}</p>`;
  }
}

function renderComicCardGrid(container, items) {
  if (!items || !items.length) {
    container.innerHTML = `<p class="muted">暂无漫画内容。</p>`;
    return;
  }
  container.innerHTML = items
    .map((item) => {
      const tagsHtml = (item.tags || [])
        .slice(0, 4)
        .map(
          (tag) =>
            `<button class="tag" type="button" data-search-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
        )
        .join("");

      return `
        <article class="comic-card" data-album-id="${escapeHtml(item.id)}">
          <div class="comic-cover-wrap">
            <img src="${escapeHtml(item.cover_url)}" alt="${escapeHtml(item.title)}" loading="lazy" />
            <span class="comic-id-badge">JM${escapeHtml(item.id)}</span>
          </div>
          <div class="comic-card-body">
            <div class="comic-card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
            ${tagsHtml ? `<div class="tag-list">${tagsHtml}</div>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

// ---------------- Search ----------------

async function performSearch(query, page = 1, mode = "auto", { updateHash = true, orderBy } = {}) {
  const q = query.trim();
  if (!q) return;
  const sortOrder = orderBy || els.searchOrderSelect?.value || "mr";

  showAlert("");
  els.searchInput.value = q;
  els.heroSearchInput.value = q;
  showLoading("正在搜索...");

  try {
    const params = new URLSearchParams({ q, page: String(page), mode, order_by: sortOrder });
    const data = await apiFetch(`/api/search?${params.toString()}`);

    if (data.type === "album" && data.album) {
      openAlbumObject(data.album, { updateHash });
      return;
    }

    state.lastSearch = { query: q, page: data.page, mode, orderBy: sortOrder };
    if (els.searchOrderSelect) els.searchOrderSelect.value = sortOrder;
    if (updateHash) {
      const hParams = new URLSearchParams({ q, p: String(data.page), mode, order_by: sortOrder });
      setHash(`/search?${hParams.toString()}`);
    }
    renderSearchResults(data);
    switchView("home");
  } catch (err) {
    showAlert(err.message);
  } finally {
    hideLoading();
  }
}

function renderSearchResults(data) {
  els.searchResultsSection.classList.remove("hidden");
  els.searchResultsHeading.textContent = `“${data.query}” 的搜索结果`;
  els.searchResultsMeta.textContent = `共 ${data.total} 条 · 第 ${data.page} / ${data.page_count} 页`;

  if (!data.items || !data.items.length) {
    els.searchResultsGrid.innerHTML = `<p class="muted">没有找到相关漫画，可以换个关键词或直接输入 JM 编号试试。</p>`;
    els.searchPagination.classList.add("hidden");
    return;
  }

  renderComicCardGrid(els.searchResultsGrid, data.items);

  if (data.page_count > 1) {
    els.searchPagination.classList.remove("hidden");
    els.searchPagination.innerHTML = `
      <button class="btn btn-secondary btn-sm" type="button" data-goto-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}>上一页</button>
      <span class="muted">第 ${data.page} / ${data.page_count} 页</span>
      <button class="btn btn-secondary btn-sm" type="button" data-goto-page="${data.page + 1}" ${data.page >= data.page_count ? "disabled" : ""}>下一页</button>
    `;
  } else {
    els.searchPagination.classList.add("hidden");
  }
}

// ---------------- Album Detail ----------------

async function loadAlbum(albumId, { updateHash = true } = {}) {
  showAlert("");
  showLoading(`正在获取 JM${albumId} 详情...`);
  try {
    const album = await apiFetch(`/api/album/${encodeURIComponent(albumId)}`);
    openAlbumObject(album, { updateHash });
  } catch (err) {
    showAlert(err.message);
  } finally {
    hideLoading();
  }
}

function openAlbumObject(album, { updateHash = true } = {}) {
  state.currentAlbum = album;
  state.chapterDescending = false;
  state.batchMode = false;
  state.selectedChapters = new Set();
  saveToHistory(album);
  if (updateHash) {
    setHash(`/album/${encodeURIComponent(album.id)}`);
  }
  renderAlbumDetail(album);
  switchView("album");
}

function renderAlbumDetail(album) {
  const authorsHtml = album.authors?.length
    ? album.authors
        .map(
          (a) =>
            `<button class="author-link" type="button" data-search-author="${escapeHtml(a)}">${escapeHtml(a)}</button>`
        )
        .join(" / ")
    : "<strong>未知作者</strong>";

  const metaParts = [
    `<span class="meta-chip">编号 <strong>JM${escapeHtml(album.id)}</strong></span>`,
    `<span class="meta-chip">作者 ${authorsHtml}</span>`,
    `<span class="meta-chip">章节 <strong>${album.chapter_count} 话</strong></span>`,
  ];
  if (album.page_count) {
    metaParts.push(`<span class="meta-chip">总页数 <strong>${album.page_count} 页</strong></span>`);
  }

  const tagsHtml = (album.tags || [])
    .map(
      (tag) => `<button class="tag" type="button" data-search-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
    )
    .join("");

  const orderedChapters = state.chapterDescending
    ? [...(album.chapters || [])].reverse()
    : album.chapters || [];

  const chaptersHtml = orderedChapters
    .map((ch) => {
      const checked = state.selectedChapters.has(String(ch.photo_id)) ? "checked" : "";
      const checkboxHtml = state.batchMode
        ? `<input class="chapter-checkbox" type="checkbox" data-batch-ch="${escapeHtml(ch.photo_id)}" ${checked} />`
        : "";
      return `
      <div class="chapter-item">
        <div class="chapter-item-main">
          ${checkboxHtml}
          <span class="chapter-num">${String(ch.index).padStart(2, "0")}</span>
          <span class="chapter-item-title" title="${escapeHtml(ch.title)}">${escapeHtml(ch.title)}</span>
        </div>
        <div class="chapter-item-actions">
          <button class="btn btn-secondary btn-xs" type="button" data-read-photo="${escapeHtml(ch.photo_id)}">预览</button>
          <button class="btn btn-ghost btn-xs" type="button" data-zip-chapter="${escapeHtml(ch.photo_id)}" data-zip-chapter-title="${escapeHtml(ch.title)}">ZIP</button>
          <button class="btn btn-ghost btn-xs" type="button" data-pdf-chapter="${escapeHtml(ch.photo_id)}" data-pdf-chapter-title="${escapeHtml(ch.title)}">PDF</button>
        </div>
      </div>
    `;
    })
    .join("");

  const batchBarHtml =
    state.batchMode && album.chapter_count > 1
      ? `
      <div class="batch-bar">
        <span class="muted">已勾选 <strong>${state.selectedChapters.size}</strong> / ${album.chapter_count} 话</span>
        <div class="chapter-panel-tools">
          <button class="btn btn-ghost btn-xs" type="button" id="batchSelectAllBtn">全选</button>
          <button class="btn btn-ghost btn-xs" type="button" id="batchClearBtn">清空</button>
          <button class="btn btn-primary btn-xs" type="button" id="batchDownloadZipBtn" ${state.selectedChapters.size ? "" : "disabled"}>打包已选 ZIP</button>
          <button class="btn btn-secondary btn-xs" type="button" id="batchDownloadPdfBtn" ${state.selectedChapters.size ? "" : "disabled"}>打包已选 PDF</button>
        </div>
      </div>
    `
      : "";

  const relatedHtml =
    album.related && album.related.length
      ? `
      <div class="related-panel">
        <div class="section-header">
          <div class="section-title-group">
            <h2>相关推荐</h2>
          </div>
          <span class="meta-pill">${album.related.length} 本</span>
        </div>
        <div class="comic-grid">
          ${album.related
            .map(
              (item) => `
            <article class="comic-card" data-album-id="${escapeHtml(item.id)}">
              <div class="comic-cover-wrap">
                <img src="${escapeHtml(item.cover_url)}" alt="${escapeHtml(item.title)}" loading="lazy" />
                <span class="comic-id-badge">JM${escapeHtml(item.id)}</span>
              </div>
              <div class="comic-card-body">
                <div class="comic-card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
              </div>
            </article>
          `
            )
            .join("")}
        </div>
      </div>
    `
      : "";

  const savedProg = getAlbumProgress(album.id);
  const firstPhotoId = album.chapters?.[0]?.photo_id || album.id;
  const resumePhotoId = savedProg?.photoId || firstPhotoId;
  const resumePage = savedProg?.pageNumber || 1;
  const readBtnLabel = savedProg
    ? album.chapter_count > 1
      ? `继续阅读（第 ${savedProg.chapterIndex} 话 · P${resumePage}）`
      : `继续阅读（第 ${resumePage} 页）`
    : "开始在线预览";

  const fav = isFavorite(album.id);
  const safeCoverUrl = escapeHtml(album.cover_url);

  els.albumDetailContainer.innerHTML = `
    <div class="album-hero">
      <div class="album-backdrop" style="background-image: url('${safeCoverUrl}')"></div>
      <div class="album-card">
        <div class="album-cover-frame">
          <img class="album-cover" src="${safeCoverUrl}" alt="${escapeHtml(album.title)}" />
        </div>
        <div class="album-info">
          <h1>${escapeHtml(album.title)}</h1>
          <div class="album-meta">${metaParts.join("")}</div>
          ${tagsHtml ? `<div class="tag-list">${tagsHtml}</div>` : ""}
          ${album.description ? `<p class="album-desc">${escapeHtml(album.description)}</p>` : ""}
          <div class="album-actions">
            <button class="btn btn-primary btn-lg" type="button" id="startReadBtn" data-read-photo="${escapeHtml(resumePhotoId)}" data-start-page="${resumePage}">
              ${ICONS.book}
              <span>${escapeHtml(readBtnLabel)}</span>
            </button>
            <button class="btn btn-secondary btn-lg" type="button" id="downloadAlbumZipBtn">
              ${ICONS.download}
              <span>${album.chapter_count > 1 ? `整本 ZIP` : "下载 ZIP"}</span>
            </button>
            <button class="btn btn-secondary btn-lg" type="button" id="downloadAlbumPdfBtn">
              ${ICONS.download}
              <span>${album.chapter_count > 1 ? `整本 PDF` : "下载 PDF"}</span>
            </button>
            <button class="btn btn-secondary btn-lg btn-fav ${fav ? "active" : ""}" type="button" id="toggleFavBtn">
              ${fav ? ICONS.heartFilled : ICONS.heart}
              <span>${fav ? "已收藏" : "收藏"}</span>
            </button>
            <button class="btn btn-ghost btn-lg" type="button" id="copyAlbumIdBtn" title="复制编号和分享链接">
              ${ICONS.copy}
              <span>复制编号</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="chapters-panel">
      <div class="chapters-panel-header">
        <h2>章节目录</h2>
        <div class="chapter-panel-tools">
          <span class="meta-pill">共 ${album.chapter_count} 话</span>
          ${album.chapter_count > 1 ? `<button class="btn btn-ghost btn-xs" type="button" id="toggleBatchModeBtn">${state.batchMode ? "退出多选" : "多选打包"}</button>` : ""}
          ${album.chapter_count > 1 ? `<button class="btn btn-ghost btn-xs" type="button" id="sortChaptersBtn">${state.chapterDescending ? "倒序 ↓" : "正序 ↑"}</button>` : ""}
        </div>
      </div>
      ${batchBarHtml}
      <div class="chapter-list">${chaptersHtml}</div>
    </div>

    ${relatedHtml}
  `;
}

// ---------------- Reader ----------------

async function openReader(photoId, { startPage = 1, updateHash = true } = {}) {
  showAlert("");
  showLoading("正在加载章节图片清单...");
  try {
    const photo = await apiFetch(`/api/photo/${encodeURIComponent(photoId)}`);
    state.currentPhoto = photo;
    const total = Math.max(1, photo.pages.length);
    state.singlePageIndex = Math.max(0, Math.min(total - 1, Number(startPage) - 1));

    const albumId = state.currentAlbum?.id || photo.album_id;
    if (updateHash) {
      setHash(`/read/${encodeURIComponent(albumId)}/${encodeURIComponent(photo.photo_id)}`);
    }

    renderReaderToolbar();
    renderReaderPages(startPage);
    switchView("reader");

    // In scroll mode, jump smoothly to resumed page if > 1
    if (state.readerMode === "scroll" && startPage > 1) {
      requestAnimationFrame(() => {
        const targetBox = els.readerCanvas.querySelector(`[data-page-index="${startPage - 1}"]`);
        if (targetBox) {
          targetBox.scrollIntoView({ behavior: "instant", block: "start" });
        }
      });
    }
  } catch (err) {
    showAlert(err.message);
  } finally {
    hideLoading();
  }
}

function getCurrentChapterIdx() {
  if (!state.currentAlbum?.chapters?.length || !state.currentPhoto) return -1;
  return state.currentAlbum.chapters.findIndex(
    (c) => String(c.photo_id) === String(state.currentPhoto.photo_id)
  );
}

function recordCurrentPageProgress(pageNumber) {
  if (!state.currentPhoto) return;
  const albumId = state.currentAlbum?.id || state.currentPhoto.album_id;
  const chIdx = getCurrentChapterIdx();
  saveReadProgress(albumId, state.currentPhoto.photo_id, chIdx >= 0 ? chIdx + 1 : 1, pageNumber);
}

function stopAutoScroll() {
  state.autoScrollActive = false;
  if (state.autoScrollRaf) {
    cancelAnimationFrame(state.autoScrollRaf);
    state.autoScrollRaf = null;
  }
  if (els.autoScrollBtn) els.autoScrollBtn.textContent = "自动滚动：关";
}

function startAutoScroll() {
  if (state.readerMode !== "scroll") {
    showToast("自动滚动仅在条漫模式下可用");
    return;
  }
  state.autoScrollActive = true;
  if (els.autoScrollBtn) els.autoScrollBtn.textContent = "自动滚动：开";
  const speeds = [0.65, 1.35, 2.4]; // px per frame
  const step = () => {
    if (!state.autoScrollActive || state.currentView !== "reader" || state.readerMode !== "scroll") {
      stopAutoScroll();
      return;
    }
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    if (window.scrollY >= maxY - 2) {
      stopAutoScroll();
      showToast("已滚动至本话底部");
      return;
    }
    window.scrollBy(0, speeds[state.autoScrollSpeedIdx] || 1.35);
    state.autoScrollRaf = requestAnimationFrame(step);
  };
  state.autoScrollRaf = requestAnimationFrame(step);
}

function syncReaderSlider(pageNumber, total) {
  if (!els.readerPageSlider || !els.readerSliderVal) return;
  els.readerPageSlider.max = String(Math.max(1, total));
  els.readerPageSlider.value = String(Math.max(1, Math.min(total, pageNumber)));
  els.readerSliderVal.textContent = `${pageNumber} / ${total}`;
}

function jumpToReaderPage(pageNumber) {
  const photo = state.currentPhoto;
  if (!photo || !photo.pages.length) return;
  const total = photo.pages.length;
  const clamped = Math.max(1, Math.min(total, Number(pageNumber) || 1));
  if (state.readerMode === "scroll") {
    const targetBox = els.readerCanvas.querySelector(`[data-page-index="${clamped - 1}"]`);
    if (targetBox) targetBox.scrollIntoView({ behavior: "smooth", block: "start" });
    els.readerProgressText.textContent = `${clamped} / ${total}`;
    syncReaderSlider(clamped, total);
    recordCurrentPageProgress(clamped);
  } else {
    state.singlePageIndex = clamped - 1;
    renderSinglePage();
  }
}

function renderReaderToolbar() {
  const photo = state.currentPhoto;
  const album = state.currentAlbum;
  els.readerTitle.textContent = album ? `${album.title} - ${photo.title}` : photo.title;

  if (album?.chapters?.length) {
    els.readerChapterSelect.classList.remove("hidden");
    els.readerChapterSelect.innerHTML = album.chapters
      .map(
        (ch) =>
          `<option value="${escapeHtml(ch.photo_id)}" ${String(ch.photo_id) === String(photo.photo_id) ? "selected" : ""}>${ch.index}. ${escapeHtml(ch.title)}</option>`
      )
      .join("");
  } else {
    els.readerChapterSelect.classList.add("hidden");
  }

  const idx = getCurrentChapterIdx();
  els.prevChapterBtn.disabled = idx <= 0;
  els.nextChapterBtn.disabled = idx < 0 || !album || idx >= album.chapters.length - 1;

  // Fallback double -> single on narrow mobile
  if (state.deviceType === "mobile" && state.readerMode === "double") {
    state.readerMode = "single";
  }

  els.modeScrollBtn.classList.toggle("active", state.readerMode === "scroll");
  els.modeSingleBtn.classList.toggle("active", state.readerMode === "single");
  if (els.modeDoubleBtn) els.modeDoubleBtn.classList.toggle("active", state.readerMode === "double");
  els.singlePageControls.classList.toggle("hidden", state.readerMode === "scroll");
  if (els.readerRtlBtn) els.readerRtlBtn.textContent = state.readerRtl ? "双页：右→左" : "双页：左→右";

  els.readerWidthSlider.value = String(state.readerWidth);
  if (state.deviceType !== "mobile") {
    document.documentElement.style.setProperty("--reader-width", `${state.readerWidth}%`);
  }
}

function createPageBox(page, total, isSingleMode) {
  const box = document.createElement("div");
  box.className = `reader-page-box${isSingleMode ? " single-mode" : ""}`;
  box.dataset.pageIndex = String(page.index);
  box.dataset.pageNumber = String(page.number);

  const img = document.createElement("img");
  img.alt = `第 ${page.number} 页`;
  img.loading = isSingleMode ? "eager" : "lazy";
  img.decoding = "async";
  img.onload = () => box.classList.add("loaded");
  img.src = page.url;
  if (img.complete && img.naturalWidth > 0) {
    box.classList.add("loaded");
  }

  const badge = document.createElement("span");
  badge.className = "page-index-badge";
  badge.textContent = `${page.number} / ${total}`;

  img.onerror = () => {
    box.classList.add("loaded");
    box.innerHTML = "";
    const fb = document.createElement("div");
    fb.className = "reader-page-fallback";
    fb.innerHTML = `<span>第 ${page.number} 页加载失败</span>`;
    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "btn btn-secondary btn-sm";
    retryBtn.textContent = "点击重试";
    retryBtn.onclick = (e) => {
      e.stopPropagation();
      const freshUrl = `${page.url}?t=${Date.now()}`;
      box.classList.remove("loaded");
      box.innerHTML = "";
      img.src = freshUrl;
      box.appendChild(img);
      box.appendChild(badge);
    };
    fb.appendChild(retryBtn);
    box.appendChild(fb);
  };

  if (isSingleMode) {
    box.onclick = (e) => {
      const rect = box.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      if (clickX < rect.width * 0.35) {
        gotoSinglePage(state.singlePageIndex - 1);
      } else {
        gotoSinglePage(state.singlePageIndex + 1);
      }
    };
  } else {
    // Tap image in scroll mode to toggle distraction-free immersive toolbar
    box.onclick = () => {
      document.body.classList.toggle("immersive-reader");
    };
  }

  box.appendChild(img);
  box.appendChild(badge);
  return box;
}

function setupScrollPageObserver(total) {
  disconnectPageObserver();
  if (!("IntersectionObserver" in window)) return;

  state.pageObserver = new IntersectionObserver(
    (entries) => {
      let bestEntry = null;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (!bestEntry || entry.intersectionRatio > bestEntry.intersectionRatio) {
            bestEntry = entry;
          }
        }
      }
      if (bestEntry) {
        const pageNum = Number(bestEntry.target.dataset.pageNumber || "1");
        els.readerProgressText.textContent = `${pageNum} / ${total}`;
        syncReaderSlider(pageNum, total);
        recordCurrentPageProgress(pageNum);
      }
    },
    { threshold: [0.25, 0.5, 0.75] }
  );

  els.readerCanvas.querySelectorAll(".reader-page-box").forEach((el) => {
    state.pageObserver.observe(el);
  });
}

function renderReaderPages(initialPage = 1) {
  const photo = state.currentPhoto;
  if (!photo) return;
  disconnectPageObserver();
  els.readerCanvas.innerHTML = "";

  if (!photo.pages.length) {
    els.readerCanvas.innerHTML = `<p class="muted">本章节没有可显示的图片。</p>`;
    els.readerProgressText.textContent = "0 / 0";
    return;
  }

  if (state.readerMode === "scroll") {
    els.readerProgressText.textContent = `${initialPage} / ${photo.page_count}`;
    syncReaderSlider(initialPage, photo.page_count);
    recordCurrentPageProgress(initialPage);
    const frag = document.createDocumentFragment();
    for (const page of photo.pages) {
      frag.appendChild(createPageBox(page, photo.page_count, false));
    }
    els.readerCanvas.appendChild(frag);
    setupScrollPageObserver(photo.page_count);
  } else {
    renderSinglePage();
  }
}

function renderSinglePage() {
  const photo = state.currentPhoto;
  if (!photo || !photo.pages.length) return;
  const total = photo.pages.length;
  const isDouble = state.readerMode === "double";
  const step = isDouble ? 2 : 1;

  state.singlePageIndex = Math.max(0, Math.min(total - 1, state.singlePageIndex));
  const page = photo.pages[state.singlePageIndex];

  els.readerCanvas.innerHTML = "";
  if (isDouble) {
    const spread = document.createElement("div");
    spread.className = `reader-spread${state.readerRtl ? " rtl" : ""}`;
    spread.appendChild(createPageBox(page, total, true));
    const secondPage = photo.pages[state.singlePageIndex + 1];
    if (secondPage) {
      spread.appendChild(createPageBox(secondPage, total, true));
    }
    els.readerCanvas.appendChild(spread);
    const label = secondPage ? `${page.number}-${secondPage.number} / ${total}` : `${page.number} / ${total}`;
    els.readerProgressText.textContent = label;
  } else {
    els.readerCanvas.appendChild(createPageBox(page, total, true));
    els.readerProgressText.textContent = `${page.number} / ${total}`;
  }

  syncReaderSlider(page.number, total);
  els.jumpPageInput.max = String(total);
  els.jumpPageInput.value = String(page.number);
  els.prevPageBtn.disabled = state.singlePageIndex <= 0;
  els.nextPageBtn.disabled = state.singlePageIndex + step >= total;
  els.scrollProgressBar.style.width = `${(Math.min(total, page.number + (isDouble ? 1 : 0)) / total) * 100}%`;

  recordCurrentPageProgress(page.number);

  // Preload next 2 pages silently
  for (let offset = step; offset < step + 2; offset++) {
    const nextPage = photo.pages[state.singlePageIndex + offset];
    if (nextPage) {
      const pre = new Image();
      pre.src = nextPage.url;
    }
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function gotoSinglePage(index) {
  if (state.readerMode === "scroll" || !state.currentPhoto) return;
  const total = state.currentPhoto.pages.length;
  const clamped = Math.max(0, Math.min(total - 1, index));
  if (clamped === state.singlePageIndex) return;
  state.singlePageIndex = clamped;
  renderSinglePage();
}

// ---------------- Browser-side Zero-Dep ZIP Downloader ----------------

function updateDownloadDock({ visible = true, title, status, percent }) {
  els.downloadDock.classList.toggle("hidden", !visible);
  if (title !== undefined) els.downloadTitle.textContent = title;
  if (status !== undefined) els.downloadStatusText.textContent = status;
  if (percent !== undefined) {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    els.downloadProgressBar.style.width = `${clamped}%`;
    els.downloadPercentText.textContent = `${clamped}%`;
  }
}

async function fetchBlobWithRetry(url, signal, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, { credentials: "same-origin", signal });
      if (resp.status === 401) {
        state.authenticated = false;
        showAuthGate();
        throw new Error("登录已失效，请重新验证口令");
      }
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      return await resp.blob();
    } catch (err) {
      if (signal.aborted) throw err;
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

function guessExtensionFromBlob(blob) {
  const type = (blob.type || "").toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  return "jpg";
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function runZipDownload(chaptersToFetch, zipFilename, label) {
  if (state.downloading) {
    showToast("已有正在进行的下载任务，请稍候");
    return;
  }

  state.downloading = true;
  const controller = new AbortController();
  state.downloadController = controller;
  const { signal } = controller;

  updateDownloadDock({
    visible: true,
    title: label,
    status: "正在获取章节清单...",
    percent: 2,
  });

  try {
    const tasks = [];
    const multiChapter = chaptersToFetch.length > 1;
    for (let cIdx = 0; cIdx < chaptersToFetch.length; cIdx++) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const ch = chaptersToFetch[cIdx];
      updateDownloadDock({
        status: `获取章节清单 (${cIdx + 1}/${chaptersToFetch.length})...`,
      });
      const photo = await apiFetch(`/api/photo/${encodeURIComponent(ch.photo_id)}`);
      const folderName = multiChapter
        ? `${String(cIdx + 1).padStart(2, "0")}_${sanitizeFilename(ch.title || photo.title, `ch${cIdx + 1}`)}`
        : "";
      for (const page of photo.pages) {
        tasks.push({
          url: page.url,
          folderName,
          pageNumber: page.number,
        });
      }
    }

    if (!tasks.length) {
      throw new Error("未找到可下载的图片");
    }

    const entries = new Array(tasks.length);
    const total = tasks.length;
    let completed = 0;
    let failed = 0;
    let cursor = 0;

    const worker = async () => {
      while (cursor < total) {
        if (signal.aborted) return;
        const idx = cursor++;
        const current = tasks[idx];
        try {
          const blob = await fetchBlobWithRetry(current.url, signal, 2);
          const ext = guessExtensionFromBlob(blob);
          const fileName = `${String(current.pageNumber).padStart(3, "0")}.${ext}`;
          const targetPath = current.folderName ? `${current.folderName}/${fileName}` : fileName;
          const bytes = new Uint8Array(await blob.arrayBuffer());
          entries[idx] = { name: targetPath, data: bytes };
        } catch (err) {
          if (signal.aborted) return;
          failed++;
          console.error("Failed page:", current.url, err);
        } finally {
          completed++;
          const pct = 5 + (completed / total) * 85;
          updateDownloadDock({
            status: `下载图片 ${completed}/${total}${failed ? `（失败 ${failed}）` : ""}`,
            percent: pct,
          });
        }
      }
    };

    const concurrency = Math.min(3, total);
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const validEntries = entries.filter(Boolean);
    if (!validEntries.length) {
      throw new Error("所有图片均下载失败，请稍后重试");
    }

    updateDownloadDock({
      status: "正在浏览器中打包 ZIP...",
      percent: 94,
    });

    const zipBlob = createZipBlob(validEntries);

    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    triggerBlobDownload(zipBlob, zipFilename);
    updateDownloadDock({
      status: failed ? `打包完成（有 ${failed} 页失败）` : "打包完成，已开始保存！",
      percent: 100,
    });
    setTimeout(() => {
      if (!state.downloading) {
        updateDownloadDock({ visible: false });
      }
    }, 3500);
  } catch (err) {
    if (err?.name === "AbortError") {
      updateDownloadDock({ status: "已取消下载", percent: 0 });
      setTimeout(() => updateDownloadDock({ visible: false }), 1500);
    } else {
      showAlert(`ZIP 下载失败：${err.message || err}`);
      updateDownloadDock({ visible: false });
    }
  } finally {
    state.downloading = false;
    state.downloadController = null;
  }
}

async function downloadAlbumAsZip(album) {
  if (!album?.chapters?.length) return;
  const filename = `[JM${album.id}] ${sanitizeFilename(album.title)}.zip`;
  await runZipDownload(album.chapters, filename, `整本打包：JM${album.id}`);
}

async function downloadSingleChapterAsZip(photoId, chapterTitle) {
  const album = state.currentAlbum;
  const prefix = album ? `[JM${album.id}] ${sanitizeFilename(album.title)} - ` : "";
  const safeChapter = sanitizeFilename(chapterTitle || `章节${photoId}`);
  const filename = `${prefix}${safeChapter}.zip`;
  await runZipDownload(
    [{ photo_id: photoId, title: chapterTitle }],
    filename,
    `单话打包：${chapterTitle || photoId}`
  );
}

async function runPdfDownload(chaptersToFetch, pdfFilename, label) {
  if (state.downloading) {
    showToast("已有正在进行的下载任务，请稍候");
    return;
  }

  state.downloading = true;
  const controller = new AbortController();
  state.downloadController = controller;
  const { signal } = controller;

  updateDownloadDock({
    visible: true,
    title: label,
    status: "正在获取章节清单...",
    percent: 2,
  });

  try {
    const tasks = [];
    for (let cIdx = 0; cIdx < chaptersToFetch.length; cIdx++) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const ch = chaptersToFetch[cIdx];
      updateDownloadDock({ status: `获取章节清单 (${cIdx + 1}/${chaptersToFetch.length})...` });
      const photo = await apiFetch(`/api/photo/${encodeURIComponent(ch.photo_id)}`);
      for (const page of photo.pages) {
        tasks.push({ url: page.url });
      }
    }
    if (!tasks.length) throw new Error("未找到可下载的图片");

    const blobs = new Array(tasks.length);
    const total = tasks.length;
    let completed = 0;
    let failed = 0;
    let cursor = 0;

    const worker = async () => {
      while (cursor < total) {
        if (signal.aborted) return;
        const idx = cursor++;
        try {
          blobs[idx] = await fetchBlobWithRetry(tasks[idx].url, signal, 2);
        } catch (err) {
          if (signal.aborted) return;
          failed++;
        } finally {
          completed++;
          updateDownloadDock({
            status: `下载图片 ${completed}/${total}${failed ? `（失败 ${failed}）` : ""}`,
            percent: 5 + (completed / total) * 75,
          });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(3, total) }, () => worker()));
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const validBlobs = blobs.filter(Boolean);
    if (!validBlobs.length) throw new Error("所有图片均下载失败，请稍后重试");

    updateDownloadDock({ status: "正在浏览器中合成 PDF...", percent: 82 });
    const pdfBlob = await createPdfBlob(validBlobs, (done, sum) => {
      updateDownloadDock({
        status: `正在合成 PDF (${done}/${sum})...`,
        percent: 82 + (done / sum) * 16,
      });
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    triggerBlobDownload(pdfBlob, pdfFilename);
    updateDownloadDock({
      status: failed ? `PDF 完成（有 ${failed} 页失败）` : "PDF 合成完成，已开始保存！",
      percent: 100,
    });
    setTimeout(() => {
      if (!state.downloading) updateDownloadDock({ visible: false });
    }, 3500);
  } catch (err) {
    if (err?.name === "AbortError") {
      updateDownloadDock({ status: "已取消下载", percent: 0 });
      setTimeout(() => updateDownloadDock({ visible: false }), 1500);
    } else {
      showAlert(`PDF 导出失败：${err.message || err}`);
      updateDownloadDock({ visible: false });
    }
  } finally {
    state.downloading = false;
    state.downloadController = null;
  }
}

async function downloadAlbumAsPdf(album) {
  if (!album?.chapters?.length) return;
  const filename = `[JM${album.id}] ${sanitizeFilename(album.title)}.pdf`;
  await runPdfDownload(album.chapters, filename, `整本 PDF：JM${album.id}`);
}

async function downloadSingleChapterAsPdf(photoId, chapterTitle) {
  const album = state.currentAlbum;
  const prefix = album ? `[JM${album.id}] ${sanitizeFilename(album.title)} - ` : "";
  const safeChapter = sanitizeFilename(chapterTitle || `章节${photoId}`);
  const filename = `${prefix}${safeChapter}.pdf`;
  await runPdfDownload(
    [{ photo_id: photoId, title: chapterTitle }],
    filename,
    `单话 PDF：${chapterTitle || photoId}`
  );
}

// ---------------- Event Binding ----------------

function bindEvents() {
  els.authForm.addEventListener("submit", handleLogin);
  els.logoutBtn.addEventListener("click", handleLogout);

  els.themeToggleBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
  });

  els.brandHomeBtn.addEventListener("click", () => {
    showAlert("");
    setHash("/");
    switchView("home");
  });

  els.headerSearchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    performSearch(els.searchInput.value, 1, els.searchModeSelect.value);
  });

  els.heroSearchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    performSearch(els.heroSearchInput.value, 1, "auto");
  });

  els.clearHistoryBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
    renderHistory();
    showToast("已清空浏览记录");
  });

  els.exportBackupBtn?.addEventListener("click", exportBackup);
  els.importBackupBtn?.addEventListener("click", () => els.importBackupInput?.click());
  els.historyImportBackupBtn?.addEventListener("click", () => els.importBackupInput?.click());
  els.importBackupInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importBackupFile(file);
    e.target.value = "";
  });

  els.searchOrderSelect?.addEventListener("change", () => {
    if (state.lastSearch) {
      performSearch(state.lastSearch.query, 1, state.lastSearch.mode, {
        orderBy: els.searchOrderSelect.value,
      });
    }
  });

  els.discoverTabs?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-discover-tab]");
    if (btn) loadDiscover(btn.dataset.discoverTab, 1);
  });

  els.discoverGrid?.addEventListener("click", (e) => {
    const tagBtn = e.target.closest("[data-search-tag]");
    if (tagBtn) {
      e.stopPropagation();
      performSearch(tagBtn.dataset.searchTag, 1, "keyword");
      return;
    }
    const card = e.target.closest("[data-album-id]");
    if (card) loadAlbum(card.dataset.albumId);
  });

  els.discoverPagination?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-discover-page]");
    if (!btn || btn.disabled) return;
    loadDiscover(state.discoverTab, Number(btn.dataset.discoverPage));
    els.discoverSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  els.favoritesGrid.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove-fav]");
    if (removeBtn) {
      e.stopPropagation();
      removeFavoriteById(removeBtn.dataset.removeFav);
      return;
    }
    const card = e.target.closest("[data-album-id]");
    if (card) loadAlbum(card.dataset.albumId);
  });

  els.historyList.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-album-id]");
    if (chip) loadAlbum(chip.dataset.albumId);
  });

  els.searchResultsGrid.addEventListener("click", (e) => {
    const tagBtn = e.target.closest("[data-search-tag]");
    if (tagBtn) {
      e.stopPropagation();
      performSearch(tagBtn.dataset.searchTag, 1, "keyword");
      return;
    }
    const card = e.target.closest("[data-album-id]");
    if (card) loadAlbum(card.dataset.albumId);
  });

  els.searchPagination.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-goto-page]");
    if (!btn || btn.disabled || !state.lastSearch) return;
    performSearch(state.lastSearch.query, Number(btn.dataset.gotoPage), state.lastSearch.mode);
  });

  els.backFromAlbumBtn.addEventListener("click", () => {
    if (state.lastSearch) {
      const hParams = new URLSearchParams({
        q: state.lastSearch.query,
        p: String(state.lastSearch.page),
        mode: state.lastSearch.mode,
      });
      setHash(`/search?${hParams.toString()}`);
    } else {
      setHash("/");
    }
    switchView("home");
  });

  els.albumDetailContainer.addEventListener("click", async (e) => {
    const relatedCard = e.target.closest(".related-panel [data-album-id]");
    if (relatedCard) {
      loadAlbum(relatedCard.dataset.albumId);
      return;
    }
    const authorBtn = e.target.closest("[data-search-author]");
    if (authorBtn) {
      performSearch(authorBtn.dataset.searchAuthor, 1, "keyword");
      return;
    }
    const tagBtn = e.target.closest("[data-search-tag]");
    if (tagBtn) {
      performSearch(tagBtn.dataset.searchTag, 1, "keyword");
      return;
    }
    const batchCheck = e.target.closest("[data-batch-ch]");
    if (batchCheck) {
      const pid = String(batchCheck.dataset.batchCh);
      if (batchCheck.checked) state.selectedChapters.add(pid);
      else state.selectedChapters.delete(pid);
      renderAlbumDetail(state.currentAlbum);
      return;
    }
    const readBtn = e.target.closest("[data-read-photo]");
    if (readBtn) {
      const startPage = Number(readBtn.dataset.startPage || "1") || 1;
      openReader(readBtn.dataset.readPhoto, { startPage });
      return;
    }
    const zipChapterBtn = e.target.closest("[data-zip-chapter]");
    if (zipChapterBtn) {
      downloadSingleChapterAsZip(
        zipChapterBtn.dataset.zipChapter,
        zipChapterBtn.dataset.zipChapterTitle
      );
      return;
    }
    const pdfChapterBtn = e.target.closest("[data-pdf-chapter]");
    if (pdfChapterBtn) {
      downloadSingleChapterAsPdf(
        pdfChapterBtn.dataset.pdfChapter,
        pdfChapterBtn.dataset.pdfChapterTitle
      );
      return;
    }
    if (e.target.closest("#downloadAlbumZipBtn") && state.currentAlbum) {
      downloadAlbumAsZip(state.currentAlbum);
      return;
    }
    if (e.target.closest("#downloadAlbumPdfBtn") && state.currentAlbum) {
      downloadAlbumAsPdf(state.currentAlbum);
      return;
    }
    if (e.target.closest("#toggleBatchModeBtn") && state.currentAlbum) {
      state.batchMode = !state.batchMode;
      if (!state.batchMode) state.selectedChapters.clear();
      renderAlbumDetail(state.currentAlbum);
      return;
    }
    if (e.target.closest("#batchSelectAllBtn") && state.currentAlbum) {
      state.currentAlbum.chapters.forEach((c) => state.selectedChapters.add(String(c.photo_id)));
      renderAlbumDetail(state.currentAlbum);
      return;
    }
    if (e.target.closest("#batchClearBtn") && state.currentAlbum) {
      state.selectedChapters.clear();
      renderAlbumDetail(state.currentAlbum);
      return;
    }
    if (e.target.closest("#batchDownloadZipBtn") && state.currentAlbum) {
      const chosen = state.currentAlbum.chapters.filter((c) =>
        state.selectedChapters.has(String(c.photo_id))
      );
      if (!chosen.length) return;
      const fname = `[JM${state.currentAlbum.id}] ${sanitizeFilename(state.currentAlbum.title)} (选${chosen.length}话).zip`;
      runZipDownload(chosen, fname, `批量 ZIP（${chosen.length} 话）`);
      return;
    }
    if (e.target.closest("#batchDownloadPdfBtn") && state.currentAlbum) {
      const chosen = state.currentAlbum.chapters.filter((c) =>
        state.selectedChapters.has(String(c.photo_id))
      );
      if (!chosen.length) return;
      const fname = `[JM${state.currentAlbum.id}] ${sanitizeFilename(state.currentAlbum.title)} (选${chosen.length}话).pdf`;
      runPdfDownload(chosen, fname, `批量 PDF（${chosen.length} 话）`);
      return;
    }
    if (e.target.closest("#toggleFavBtn") && state.currentAlbum) {
      toggleFavorite(state.currentAlbum);
      renderAlbumDetail(state.currentAlbum);
      return;
    }
    if (e.target.closest("#copyAlbumIdBtn") && state.currentAlbum) {
      const text = `JM${state.currentAlbum.id} ${window.location.href}`;
      try {
        await navigator.clipboard.writeText(text);
        showToast(`已复制 JM${state.currentAlbum.id} 与直达链接`);
      } catch {
        showToast(`编号：JM${state.currentAlbum.id}`);
      }
      return;
    }
    if (e.target.closest("#sortChaptersBtn") && state.currentAlbum) {
      state.chapterDescending = !state.chapterDescending;
      renderAlbumDetail(state.currentAlbum);
    }
  });

  // Reader events
  els.backFromReaderBtn.addEventListener("click", () => {
    if (state.currentAlbum) {
      setHash(`/album/${encodeURIComponent(state.currentAlbum.id)}`);
      renderAlbumDetail(state.currentAlbum);
      switchView("album");
    } else {
      setHash("/");
      switchView("home");
    }
  });

  els.readerChapterSelect.addEventListener("change", () => {
    if (els.readerChapterSelect.value) {
      openReader(els.readerChapterSelect.value);
    }
  });

  els.modeScrollBtn.addEventListener("click", () => {
    state.readerMode = "scroll";
    localStorage.setItem(STORAGE_KEYS.READER_MODE, "scroll");
    renderReaderToolbar();
    renderReaderPages(state.singlePageIndex + 1);
  });

  els.modeSingleBtn.addEventListener("click", () => {
    stopAutoScroll();
    state.readerMode = "single";
    document.body.classList.remove("immersive-reader");
    localStorage.setItem(STORAGE_KEYS.READER_MODE, "single");
    renderReaderToolbar();
    renderReaderPages();
  });

  els.modeDoubleBtn?.addEventListener("click", () => {
    stopAutoScroll();
    state.readerMode = "double";
    document.body.classList.remove("immersive-reader");
    localStorage.setItem(STORAGE_KEYS.READER_MODE, "double");
    renderReaderToolbar();
    renderReaderPages();
  });

  els.readerProgressBtn?.addEventListener("click", () => {
    els.readerToolsDrawer?.classList.toggle("hidden");
  });

  els.readerPageSlider?.addEventListener("input", () => {
    const val = Number(els.readerPageSlider.value);
    const total = state.currentPhoto?.pages?.length || 1;
    els.readerSliderVal.textContent = `${val} / ${total}`;
  });

  els.readerPageSlider?.addEventListener("change", () => {
    jumpToReaderPage(Number(els.readerPageSlider.value));
  });

  els.readerBrightnessSlider?.addEventListener("input", () => {
    applyBrightness(els.readerBrightnessSlider.value);
  });

  els.autoScrollBtn?.addEventListener("click", () => {
    if (state.autoScrollActive) stopAutoScroll();
    else startAutoScroll();
  });

  els.autoScrollSpeedBtn?.addEventListener("click", () => {
    state.autoScrollSpeedIdx = (state.autoScrollSpeedIdx + 1) % 3;
    const labels = ["速度：慢", "速度：中", "速度：快"];
    els.autoScrollSpeedBtn.textContent = labels[state.autoScrollSpeedIdx];
  });

  els.readerRtlBtn?.addEventListener("click", () => {
    state.readerRtl = !state.readerRtl;
    localStorage.setItem(STORAGE_KEYS.READER_RTL, String(state.readerRtl));
    renderReaderToolbar();
    if (state.readerMode === "double") renderSinglePage();
  });

  els.readerFullscreenBtn?.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        els.readerFullscreenBtn.textContent = "退出全屏";
      } else {
        await document.exitFullscreen();
        els.readerFullscreenBtn.textContent = "全屏阅读";
      }
    } catch {
      showToast("当前浏览器不支持一键全屏");
    }
  });

  els.readerDownloadPdfBtn?.addEventListener("click", () => {
    if (!state.currentPhoto) return;
    downloadSingleChapterAsPdf(state.currentPhoto.photo_id, state.currentPhoto.title);
  });

  els.readerWidthSlider.addEventListener("input", () => {
    state.readerWidth = Number(els.readerWidthSlider.value);
    localStorage.setItem(STORAGE_KEYS.READER_WIDTH, String(state.readerWidth));
    document.documentElement.style.setProperty("--reader-width", `${state.readerWidth}%`);
  });

  els.readerDownloadChapterBtn.addEventListener("click", () => {
    if (!state.currentPhoto) return;
    downloadSingleChapterAsZip(state.currentPhoto.photo_id, state.currentPhoto.title);
  });

  els.prevChapterBtn.addEventListener("click", () => {
    const idx = getCurrentChapterIdx();
    if (idx > 0 && state.currentAlbum) {
      openReader(state.currentAlbum.chapters[idx - 1].photo_id);
    }
  });

  els.nextChapterBtn.addEventListener("click", () => {
    const idx = getCurrentChapterIdx();
    if (idx >= 0 && state.currentAlbum && idx < state.currentAlbum.chapters.length - 1) {
      openReader(state.currentAlbum.chapters[idx + 1].photo_id);
    }
  });

  els.prevPageBtn.addEventListener("click", () => {
    const step = state.readerMode === "double" ? 2 : 1;
    gotoSinglePage(state.singlePageIndex - step);
  });
  els.nextPageBtn.addEventListener("click", () => {
    const step = state.readerMode === "double" ? 2 : 1;
    gotoSinglePage(state.singlePageIndex + step);
  });
  els.jumpPageInput.addEventListener("change", () => {
    const target = Number(els.jumpPageInput.value) - 1;
    if (!Number.isNaN(target)) gotoSinglePage(target);
  });

  // Keyboard navigation in single/double-page mode
  document.addEventListener("keydown", (e) => {
    if (state.currentView !== "reader" || state.readerMode === "scroll") return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    const step = state.readerMode === "double" ? 2 : 1;
    const rtl = state.readerMode === "double" && state.readerRtl;
    if (e.key === "ArrowLeft") gotoSinglePage(state.singlePageIndex + (rtl ? step : -step));
    if (e.key === "ArrowRight") gotoSinglePage(state.singlePageIndex + (rtl ? -step : step));
  });

  // Mobile touch swipe in single-page mode
  let touchStartX = 0;
  let touchStartY = 0;
  els.readerCanvas.addEventListener(
    "touchstart",
    (e) => {
      if (state.readerMode !== "single" || e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    },
    { passive: true }
  );
  els.readerCanvas.addEventListener(
    "touchend",
    (e) => {
      if (state.readerMode !== "single" || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        if (dx < 0) gotoSinglePage(state.singlePageIndex + 1);
        else gotoSinglePage(state.singlePageIndex - 1);
      }
    },
    { passive: true }
  );

  els.cancelDownloadBtn.addEventListener("click", () => {
    if (state.downloadController) {
      state.downloadController.abort();
    } else {
      updateDownloadDock({ visible: false });
    }
  });

  els.backToTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener(
    "scroll",
    () => {
      const y = window.scrollY || document.documentElement.scrollTop;
      els.backToTopBtn.classList.toggle("hidden", y < 420);

      if (state.currentView === "reader" && state.readerMode === "scroll") {
        const doc = document.documentElement;
        const scrollable = Math.max(1, doc.scrollHeight - window.innerHeight);
        const pct = Math.min(100, Math.max(0, (y / scrollable) * 100));
        els.scrollProgressBar.style.width = `${pct}%`;
      }
    },
    { passive: true }
  );

  window.addEventListener("hashchange", () => {
    if (state.suppressHashEvent) return;
    handleRouteFromHash();
  });

  window.addEventListener("resize", detectDeviceType, { passive: true });
  window.addEventListener("orientationchange", detectDeviceType, { passive: true });
}

// ---------------- Init ----------------

async function init() {
  detectDeviceType();
  initTheme();
  renderFavorites();
  renderHistory();
  bindEvents();
  try {
    await checkAuthStatus();
  } catch (err) {
    showAlert(`初始化失败：${err.message}`);
  }
}

init();
