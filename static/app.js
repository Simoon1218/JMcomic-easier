const STORAGE_KEYS = {
  THEME: "jm_theme",
  HISTORY: "jm_history_v1",
  READER_MODE: "jm_reader_mode",
  READER_WIDTH: "jm_reader_width",
};

const state = {
  authEnabled: false,
  authenticated: false,
  currentView: "home", // home | album | reader
  lastSearch: null, // { query, page, mode }
  currentAlbum: null,
  currentPhoto: null,
  readerMode: localStorage.getItem(STORAGE_KEYS.READER_MODE) || "scroll", // scroll | single
  readerWidth: Number(localStorage.getItem(STORAGE_KEYS.READER_WIDTH) || "80"),
  singlePageIndex: 0,
  downloadController: null,
  downloading: false,
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
  historySection: $("historySection"),
  historyList: $("historyList"),
  clearHistoryBtn: $("clearHistoryBtn"),
  searchResultsSection: $("searchResultsSection"),
  searchResultsHeading: $("searchResultsHeading"),
  searchResultsMeta: $("searchResultsMeta"),
  searchResultsGrid: $("searchResultsGrid"),
  searchPagination: $("searchPagination"),

  viewAlbum: $("viewAlbum"),
  backFromAlbumBtn: $("backFromAlbumBtn"),
  albumDetailContainer: $("albumDetailContainer"),

  viewReader: $("viewReader"),
  backFromReaderBtn: $("backFromReaderBtn"),
  readerTitle: $("readerTitle"),
  readerChapterSelect: $("readerChapterSelect"),
  modeScrollBtn: $("modeScrollBtn"),
  modeSingleBtn: $("modeSingleBtn"),
  readerWidthSlider: $("readerWidthSlider"),
  readerProgressText: $("readerProgressText"),
  readerDownloadChapterBtn: $("readerDownloadChapterBtn"),
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

// ---------------- Theme ----------------

function applyTheme(theme) {
  const finalTheme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", finalTheme);
  localStorage.setItem(STORAGE_KEYS.THEME, finalTheme);
  els.themeIcon.textContent = finalTheme === "dark" ? "☀️" : "🌙";
}

function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.THEME) || "dark";
  applyTheme(saved);
}

// ---------------- History ----------------

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToHistory(album) {
  if (!album?.id) return;
  const list = loadHistory().filter((item) => item.id !== album.id);
  list.unshift({
    id: album.id,
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

function switchView(name) {
  state.currentView = name;
  els.viewHome.classList.toggle("hidden", name !== "home");
  els.viewAlbum.classList.toggle("hidden", name !== "album");
  els.viewReader.classList.toggle("hidden", name !== "reader");
  window.scrollTo({ top: 0, behavior: "instant" });
}

// ---------------- Search ----------------

async function performSearch(query, page = 1, mode = "auto") {
  const q = query.trim();
  if (!q) return;

  showAlert("");
  els.searchInput.value = q;
  els.heroSearchInput.value = q;
  showLoading("正在搜索...");

  try {
    const params = new URLSearchParams({ q, page: String(page), mode });
    const data = await apiFetch(`/api/search?${params.toString()}`);

    if (data.type === "album" && data.album) {
      openAlbumObject(data.album);
      return;
    }

    state.lastSearch = { query: q, page: data.page, mode };
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

  els.searchResultsGrid.innerHTML = data.items
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

async function loadAlbum(albumId) {
  showAlert("");
  showLoading(`正在获取 JM${albumId} 详情...`);
  try {
    const album = await apiFetch(`/api/album/${encodeURIComponent(albumId)}`);
    openAlbumObject(album);
  } catch (err) {
    showAlert(err.message);
  } finally {
    hideLoading();
  }
}

function openAlbumObject(album) {
  state.currentAlbum = album;
  saveToHistory(album);
  renderAlbumDetail(album);
  switchView("album");
}

function renderAlbumDetail(album) {
  const authorsText = album.authors?.length ? album.authors.join(" / ") : "未知作者";
  const metaParts = [
    `<span>编号：<strong>JM${escapeHtml(album.id)}</strong></span>`,
    `<span>作者：${escapeHtml(authorsText)}</span>`,
    `<span>章节：${album.chapter_count} 话</span>`,
  ];
  if (album.page_count) {
    metaParts.push(`<span>总页数：${album.page_count} 页</span>`);
  }

  const tagsHtml = (album.tags || [])
    .map(
      (tag) => `<button class="tag" type="button" data-search-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
    )
    .join("");

  const chaptersHtml = (album.chapters || [])
    .map(
      (ch) => `
      <div class="chapter-item">
        <span class="chapter-item-title" title="${escapeHtml(ch.title)}">
          ${ch.index}. ${escapeHtml(ch.title)}
        </span>
        <div class="chapter-item-actions">
          <button class="btn btn-secondary btn-xs" type="button" data-read-photo="${escapeHtml(ch.photo_id)}">预览</button>
          <button class="btn btn-ghost btn-xs" type="button" data-zip-chapter="${escapeHtml(ch.photo_id)}" data-zip-chapter-title="${escapeHtml(ch.title)}">ZIP</button>
        </div>
      </div>
    `
    )
    .join("");

  const firstPhotoId = album.chapters?.[0]?.photo_id || album.id;

  els.albumDetailContainer.innerHTML = `
    <div class="album-card">
      <img class="album-cover" src="${escapeHtml(album.cover_url)}" alt="${escapeHtml(album.title)}" />
      <div class="album-info">
        <h1>${escapeHtml(album.title)}</h1>
        <div class="album-meta">${metaParts.join("")}</div>
        ${tagsHtml ? `<div class="tag-list">${tagsHtml}</div>` : ""}
        ${album.description ? `<p class="album-desc">${escapeHtml(album.description)}</p>` : ""}
        <div class="album-actions">
          <button class="btn btn-primary" type="button" id="startReadBtn" data-read-photo="${escapeHtml(firstPhotoId)}">开始在线预览</button>
          <button class="btn btn-secondary" type="button" id="downloadAlbumZipBtn">
            ${album.chapter_count > 1 ? `整本打包 ZIP（共 ${album.chapter_count} 话）` : "下载为 ZIP"}
          </button>
        </div>
      </div>
    </div>

    <div class="chapters-panel">
      <h2>章节列表（支持单话预览与单话 ZIP 下载）</h2>
      <div class="chapter-list">${chaptersHtml}</div>
    </div>
  `;
}

// ---------------- Reader ----------------

async function openReader(photoId) {
  showAlert("");
  showLoading("正在加载章节图片清单...");
  try {
    const photo = await apiFetch(`/api/photo/${encodeURIComponent(photoId)}`);
    state.currentPhoto = photo;
    state.singlePageIndex = 0;

    // Populate chapter selector if album matches
    renderReaderToolbar();
    renderReaderPages();
    switchView("reader");
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

  els.modeScrollBtn.classList.toggle("active", state.readerMode === "scroll");
  els.modeSingleBtn.classList.toggle("active", state.readerMode === "single");
  els.singlePageControls.classList.toggle("hidden", state.readerMode !== "single");

  els.readerWidthSlider.value = String(state.readerWidth);
  document.documentElement.style.setProperty("--reader-width", `${state.readerWidth}%`);
}

function createPageBox(page, total, isSingleMode) {
  const box = document.createElement("div");
  box.className = `reader-page-box${isSingleMode ? " single-mode" : ""}`;
  box.dataset.pageIndex = String(page.index);

  const img = document.createElement("img");
  img.alt = `第 ${page.number} 页`;
  img.loading = isSingleMode ? "eager" : "lazy";
  img.decoding = "async";
  img.src = page.url;

  const badge = document.createElement("span");
  badge.className = "page-index-badge";
  badge.textContent = `${page.number} / ${total}`;

  img.onerror = () => {
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
  }

  box.appendChild(img);
  box.appendChild(badge);
  return box;
}

function renderReaderPages() {
  const photo = state.currentPhoto;
  if (!photo) return;
  els.readerCanvas.innerHTML = "";

  if (!photo.pages.length) {
    els.readerCanvas.innerHTML = `<p class="muted">本章节没有可显示的图片。</p>`;
    els.readerProgressText.textContent = "0 / 0";
    return;
  }

  if (state.readerMode === "scroll") {
    els.readerProgressText.textContent = `共 ${photo.page_count} 页`;
    const frag = document.createDocumentFragment();
    for (const page of photo.pages) {
      frag.appendChild(createPageBox(page, photo.page_count, false));
    }
    els.readerCanvas.appendChild(frag);
  } else {
    renderSinglePage();
  }
}

function renderSinglePage() {
  const photo = state.currentPhoto;
  if (!photo || !photo.pages.length) return;
  const total = photo.pages.length;
  state.singlePageIndex = Math.max(0, Math.min(total - 1, state.singlePageIndex));
  const page = photo.pages[state.singlePageIndex];

  els.readerCanvas.innerHTML = "";
  els.readerCanvas.appendChild(createPageBox(page, total, true));
  els.readerProgressText.textContent = `${page.number} / ${total}`;
  els.jumpPageInput.max = String(total);
  els.jumpPageInput.value = String(page.number);
  els.prevPageBtn.disabled = state.singlePageIndex <= 0;
  els.nextPageBtn.disabled = state.singlePageIndex >= total - 1;

  // Preload next 2 pages silently
  for (let offset = 1; offset <= 2; offset++) {
    const nextPage = photo.pages[state.singlePageIndex + offset];
    if (nextPage) {
      const pre = new Image();
      pre.src = nextPage.url;
    }
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function gotoSinglePage(index) {
  if (state.readerMode !== "single" || !state.currentPhoto) return;
  const total = state.currentPhoto.pages.length;
  if (index < 0 || index >= total) return;
  state.singlePageIndex = index;
  renderSinglePage();
}

// ---------------- Browser-side JSZip Downloader ----------------

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
    showAlert("已有正在进行的 ZIP 下载任务，请等待完成或先取消当前任务。");
    return;
  }
  if (typeof window.JSZip === "undefined") {
    showAlert("JSZip 脚本未能加载，请检查网络连接后刷新页面重试。");
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
    // 1. Resolve all pages across requested chapters
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

    // 2. Concurrent download (max 3 workers to stay friendly to free hosting)
    const zip = new window.JSZip();
    const total = tasks.length;
    let completed = 0;
    let failed = 0;
    let cursor = 0;

    const worker = async () => {
      while (cursor < total) {
        if (signal.aborted) return;
        const current = tasks[cursor++];
        try {
          const blob = await fetchBlobWithRetry(current.url, signal, 2);
          const ext = guessExtensionFromBlob(blob);
          const fileName = `${String(current.pageNumber).padStart(3, "0")}.${ext}`;
          const targetPath = current.folderName ? `${current.folderName}/${fileName}` : fileName;
          zip.file(targetPath, blob);
        } catch (err) {
          if (signal.aborted) return;
          failed++;
          console.error("Failed page:", current.url, err);
        } finally {
          completed++;
          const pct = 5 + (completed / total) * 80;
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

    // 3. Package ZIP in browser memory
    updateDownloadDock({
      status: "正在浏览器中打包 ZIP...",
      percent: 88,
    });

    const zipBlob = await zip.generateAsync(
      { type: "blob", compression: "STORE" },
      (meta) => {
        updateDownloadDock({
          status: `正在打包 ZIP (${Math.round(meta.percent)}%)...`,
          percent: 85 + meta.percent * 0.15,
        });
      }
    );

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
    switchView("home");
  });

  els.albumDetailContainer.addEventListener("click", (e) => {
    const tagBtn = e.target.closest("[data-search-tag]");
    if (tagBtn) {
      performSearch(tagBtn.dataset.searchTag, 1, "keyword");
      return;
    }
    const readBtn = e.target.closest("[data-read-photo]");
    if (readBtn) {
      openReader(readBtn.dataset.readPhoto);
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
    if (e.target.closest("#downloadAlbumZipBtn") && state.currentAlbum) {
      downloadAlbumAsZip(state.currentAlbum);
    }
  });

  // Reader events
  els.backFromReaderBtn.addEventListener("click", () => {
    if (state.currentAlbum) {
      switchView("album");
    } else {
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
    renderReaderPages();
  });

  els.modeSingleBtn.addEventListener("click", () => {
    state.readerMode = "single";
    localStorage.setItem(STORAGE_KEYS.READER_MODE, "single");
    renderReaderToolbar();
    renderReaderPages();
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

  els.prevPageBtn.addEventListener("click", () => gotoSinglePage(state.singlePageIndex - 1));
  els.nextPageBtn.addEventListener("click", () => gotoSinglePage(state.singlePageIndex + 1));
  els.jumpPageInput.addEventListener("change", () => {
    const target = Number(els.jumpPageInput.value) - 1;
    if (!Number.isNaN(target)) gotoSinglePage(target);
  });

  document.addEventListener("keydown", (e) => {
    if (state.currentView !== "reader" || state.readerMode !== "single") return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    if (e.key === "ArrowLeft") gotoSinglePage(state.singlePageIndex - 1);
    if (e.key === "ArrowRight") gotoSinglePage(state.singlePageIndex + 1);
  });

  els.cancelDownloadBtn.addEventListener("click", () => {
    if (state.downloadController) {
      state.downloadController.abort();
    } else {
      updateDownloadDock({ visible: false });
    }
  });
}

// ---------------- Init ----------------

async function init() {
  initTheme();
  renderHistory();
  bindEvents();
  try {
    await checkAuthStatus();
  } catch (err) {
    showAlert(`初始化失败：${err.message}`);
  }
}

init();
