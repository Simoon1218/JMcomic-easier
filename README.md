# Rinseki的本子站（JMComic Easier）

基于 [JMComic-Crawler-Python](https://github.com/hect0x7/JMComic-Crawler-Python) 构建的轻量级无状态漫画网页阅读与下载工具，支持免费云平台（Render / Hugging Face Spaces / Docker）一键部署与多人访问。

## 在线访问

- **网址**：https://jmcomic-easier.onrender.com
- **访问口令**：`aao`

> 提示：免费版云服务在 15 分钟无访问后会自动休眠，首次打开若加载较慢，等待约 30~60 秒唤醒即可。

## 功能特性

- **双模式搜索 + 发现排行**：支持纯数字编号（如 `422866`）、`JM422866`、链接直达、关键词/作者/标签搜索（支持按最新/观看/点赞/图片数排序），首页内置周榜/月榜/最新/高赞发现页，详情页支持相关推荐。
- **在线沉浸式预览**：
  - 后端实时代理并解密混淆图片（带轻量 LRU 临时缓存，重复访问秒开）。
  - 支持 **条漫滚动 / 单页翻页 / 双页对开（日漫右→左）** 三种模式，支持手机触控滑页、页码滑块直达、夜间防刺眼调光、条漫自动滚动、一键全屏、阅读进度断点续看与单页重试。
  - 支持 **暗色 / 浅色** 主题切换与 **PWA 桌面应用**（手机可添加到主屏幕全屏使用）。
- **浏览器端零依赖打包下载（ZIP & PDF）**：
  - 支持 **整本 / 单话 / 多章节自定义勾选** 打包下载为 **ZIP** 或 **PDF**，全部在用户浏览器本地完成，不占服务器硬盘。
- **本地收藏与跨设备备份**：支持「我的收藏」书架与 JSON 一键导出/导入备份。
- **访问口令保护**：通过环境变量 `ACCESS_PASSWORD` 开启私密口令验证（HMAC-SHA256 签名 Cookie），并默认输出 `noindex, nofollow` 响应头防止搜索引擎收录。

---

## 快速部署（无需个人服务器）

### 方式一：Render 免费部署（推荐）

1. 将本仓库导入或推送到你的 GitHub（如 `Simoon1218/JMcomic-easier`）。
2. 登录 [Render](https://render.com/)，点击 **New +** -> **Blueprint**（或 **Web Service**），关联本仓库。
3. Render 会自动识别 `render.yaml` 与 `Dockerfile`：
   - 在环境变量中填写 **`ACCESS_PASSWORD`**（强烈建议设置一个访问口令）。
   - `AUTH_SECRET` 会自动生成。
4. 等待构建完成即可获得一个公网 HTTPS 网址，分享给朋友输入口令即可使用。

> 注：Render 免费版 15 分钟无访问会自动休眠，下次打开等待约 30~60 秒唤醒即可；海外机房通常可直接连通源站，无需配置代理。

### 方式二：Hugging Face Spaces（Docker）

1. 在 Hugging Face 创建一个新的 Space，SDK 选择 **Docker**（Blank 模板）。
2. 将本仓库代码推送到 Space，或在 Space 的 **Settings -> Variables and secrets** 中添加：
   - Secret: `ACCESS_PASSWORD`（访问口令）
   - Secret: `AUTH_SECRET`（任意随机长字符串）
3. 本项目 `Dockerfile` 默认监听 `7860` 端口并以非 root 用户运行，可直接兼容 Hugging Face Spaces。

### 方式三：Docker 本地 / 服务器运行

```bash
docker build -t jmcomic-easier .
docker run -d --name jmcomic-easier \
  -p 7860:7860 \
  -e ACCESS_PASSWORD="your-password" \
  -e AUTH_SECRET="change-me-to-random-string" \
  jmcomic-easier
```

浏览器访问 `http://localhost:7860`。

### 方式四：本地 Python 直接运行

需要 Python 3.10+（无需 Node.js）：

```bash
pip install -r requirements.txt
cp .env.example .env
# 按需编辑 .env（例如设置 ACCESS_PASSWORD 或本地代理 JM_PROXY）
uvicorn app.main:app --host 0.0.0.0 --port 7860
```

---

## 环境变量说明

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `ACCESS_PASSWORD` | 空（免密） | 访问口令，公网部署强烈建议设置 |
| `AUTH_SECRET` | 启动随机生成 | 会话 Cookie 签名密钥，建议固定为随机字符串 |
| `JM_PROXY` | 空 | 代理地址（如 `http://127.0.0.1:7890`），海外云平台通常留空 |
| `JM_CLIENT_IMPL` | `api` | `jmcomic` 客户端模式：`api`（推荐）或 `html` |
| `CACHE_MAX_MB` | `120` | 临时解密图片 LRU 磁盘缓存上限（MB） |
| `JM_WORKERS` | `6` | 后端抓取/解密并发线程数 |
| `PORT` | `7860` | Web 服务监听端口 |

---

## 项目结构

```text
.
├── app/
│   ├── auth.py          # 访问口令与 HMAC 会话认证
│   ├── config.py        # 环境变量与缓存配置
│   ├── jm_service.py    # jmcomic 线程安全封装、解密代理与 LRU 缓存
│   └── main.py          # FastAPI 路由与静态文件托管
├── static/
│   ├── index.html       # 单页应用入口
│   ├── styles.css       # 暗色/浅色主题与响应式样式
│   └── app.js           # 搜索、阅读器与 JSZip 浏览器打包逻辑
├── Dockerfile           # 兼容 Render / Hugging Face Spaces / Docker
├── render.yaml          # Render Blueprint 一键部署配置
├── requirements.txt     # Python 依赖
└── .env.example         # 环境变量示例
```
