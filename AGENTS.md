# AGENTS.md — 项目导览与开发上手指南

> 本文档面向后续接手该仓库的开发者 / AI 编程代理（agent），目标是 5 分钟内对项目结构、关键接口、运行/部署方式建立全局认知。
>
> 仓库基于上游 [HumanSignal/label-studio](https://github.com/HumanSignal/label-studio)（Apache 2.0），在其基础上做了 **本地 Windows 开发流程 + SAM3 本地 ML Backend + 离线部署包** 的二次开发。

---

## 1. 项目定位与功能总览

Label Studio 是一个面向多模态（图像 / 文本 / 音频 / 视频 / 时序）数据的开源标注平台，对外提供：

- 多用户多项目的数据标注工作台（Web UI）
- 可配置标注模板的标注界面（基于 React + mobx-state-tree）
- REST API（DRF + drf-spectacular OpenAPI Schema）
- 数据源/数据汇接入（S3 / GCS / Azure Blob / Redis / 本地文件）
- ML Backend 接入协议（用模型做 pre-label / interactive / online learning）
- Webhook、用户/组织管理、JWT/Token 鉴权

本仓库在此之上扩展了：

| 扩展点 | 位置 | 说明 |
| --- | --- | --- |
| SAM3 本地推理后端 | `ml_backends/sam3_local_backend/` | 把 Meta SAM3 `sam3.1_multiplex.pt` 包成符合 LS ML Backend 协议的本地 HTTP 服务 |
| Windows 本地开发脚本 | `scripts/*.ps1` | 一键拉起 LS + SAM3，复位默认管理员，按需重建前端 |
| 离线部署 bundle | `scripts/offline/` | 在联网机器生成自包含 zip，在离线 Windows 机器一键安装并启动 |
| 软著申报材料 | `software_reg/` | 历史生成的软件著作权登记申请相关文档（与运行无关） |

---

## 2. 顶层目录速查

```
label-studio-develop/
├── label_studio/            # Django 后端（核心业务，pip 包入口）
├── web/                     # 前端 monorepo（NX + Yarn workspaces）
│   ├── apps/labelstudio/    # 主前端 SPA（React + TS）
│   ├── apps/labelstudio-e2e # Cypress E2E 测试
│   ├── apps/playground/     # 标签模板调试
│   └── libs/
│       ├── editor/          # Label Studio Frontend (LSF) 标注器内核
│       ├── datamanager/     # 任务/数据浏览管理器
│       ├── app-common/      # 主 app 通用页面/Provider
│       ├── core/            # 通用工具与 SDK 封装
│       └── ui/              # 设计系统 / 组件库（含 Storybook）
├── ml_backends/
│   └── sam3_local_backend/  # 本地 SAM3 推理服务（独立 Python 包）
├── scripts/                 # Windows 本地开发脚本（PowerShell）
│   └── offline/             # 离线部署打包/安装脚本
├── deploy/                  # 部署相关辅助文件
├── docs/                    # 用户文档源
├── prometheus/              # Prometheus 监控配置
├── tools/                   # 杂项开发工具
├── software_reg/            # 软著申报材料（与运行无关）
├── pyproject.toml           # Python 包定义 + Poetry 锁
├── Makefile                 # 后端 / 前端常用命令
├── Dockerfile*              # 多种 Docker 镜像（生产 / 开发 / 测试 / 云）
├── docker-compose*.yml      # 本地容器编排（含 MinIO / MySQL 选项）
└── README.md                # 上游 README + 本仓库 Windows 运行片段
```

---

## 3. 后端 (`label_studio/`)：Django App 与 API

### 3.1 入口

- `label_studio/server.py` — pip 包入口（`label-studio` 命令）。负责：
  - 解析 CLI 参数（`init / start / user / reset_password / export / shell / version / calculate_stats_all_orgs`）
  - 自动建库迁移、自动创建默认 superuser、可选启动浏览器
  - `_resolve_user_by_identifier()` 是本仓库定制：兼容 email/username/大小写变体，避免重复账号
- `label_studio/manage.py` — 标准 Django manage
- `label_studio/core/wsgi.py` — WSGI 入口
- `label_studio/core/urls.py` — 总路由（见下）
- `label_studio/core/settings/` — `base.py` 通用，`label_studio.py` OSS 版本启动配置
- `label_studio/conftest.py` / `label_studio/pytest.ini` — pytest 配置

### 3.2 Django 应用一览

每个子目录都是一个 Django app（包含 `models.py / api.py / urls.py / serializers.py / migrations/`）。下表给出职责与 REST 前缀：

| App | 职责 | 主要 URL 前缀 |
| --- | --- | --- |
| `core` | 全局路由、设置、中间件、版本、健康检查、静态资源、`feature_flags.json` | `/`, `/health/`, `/metrics/`, `/version/`, `/feature-flags/`, `/admin/users` |
| `organizations` | 组织与成员管理 | `/api/organizations/`, `/api/invite`, `/people/` |
| `users` | 用户、登录/注册、Token、管理员用户管理、Product Tours | `/user/login`, `/user/signup`, `/api/users/`, `/api/admin/users/`, `/api/current-user/*` |
| `jwt_auth` | DRF SimpleJWT 集成（access/refresh/rotate/blacklist） | `/api/jwt/settings`, `/api/token/*` |
| `session_policy` | 会话策略 | 在 `core.urls` 中 include |
| `projects` | 项目 CRUD、成员、工作流、模板、采样、`label_config` 校验 | `/projects/`, `/api/projects/`, `/api/templates/` |
| `tasks` | 任务、标注（Annotation）、草稿（Draft）、预测（Prediction）、评审 | `/api/tasks/`, `/api/annotations/`, `/api/drafts/`, `/api/predictions/` |
| `data_import` | 导入任务、上传文件、分块上传、本地文件导入 | `/api/projects/<pk>/import`, `/api/projects/<pk>/import/chunked/*`, `/data/upload/...` |
| `data_export` | 导出快照、转换格式（COCO/VOC/JSON 等）、打包下载 | `/api/projects/<pk>/export*`, `/api/projects/<pk>/exports/*` |
| `data_manager` | 数据管理器视图、列、动作、过滤、批量操作 | `/api/dm/*`, `/projects/<pk>/data/*` |
| `io_storages` | S3 / GCS / Azure / Redis / LocalFiles 存储 CRUD + sync + URL proxy/presign | `/api/storages/*`, `/tasks/<id>/resolve/`, `/projects/<id>/resolve/`, `/data/local-files/` |
| `ml` | ML Backend 注册、训练、预测、交互式标注、版本拉取（与外部 ML 服务通信） | `/api/ml/`, `/api/ml/<pk>/train`, `/predict/test`, `/interactive-annotating`, `/versions` |
| `ml_models` | 第三方 LLM 模型接入（Enterprise 主用，OSS 保留 model 与 model_run 数据结构） | 见 `ml_models/README.md` |
| `ml_model_providers` | LLM provider 配置（OpenAI 等） | — |
| `labels_manager` | 标签库（跨项目标签集合） | `/api/labels/`, `/api/label-links/` |
| `webhooks` | Webhook 注册与触发 | `/api/webhooks/` |
| `fsm` | 高性能有限状态机框架（UUID7、声明式 transitions），用于 task/annotation/project 状态流转，参见 `label_studio/fsm/README.md` | `/api/fsm/...` |
| `annotation_templates` | 内置标签模板（XML 配置） | 作为静态资源 |

### 3.3 后端核心模块详解（重点文件）

- **ML 协议层**：`label_studio/ml/api_connector.py`
  - `MLApi` 封装 `predict / health / validate / setup / duplicate_model / delete / job_status / versions / train / webhook`
  - 超时通过 `ML_TIMEOUT_*` 环境变量配置
  - 这是 LS 后端去调用任意外部 ML Backend（如本仓库的 `sam3_local_backend`）的客户端
- **ML Backend 数据库模型**：`label_studio/ml/models.py`、`label_studio/ml/api.py`
- **任务/标注模型**：`label_studio/tasks/models.py`（~68k 行 ORM 定义，含 Task / Annotation / AnnotationDraft / Prediction）
- **项目模型**：`label_studio/projects/models.py` 含 `Project`、采样模式、`label_config` 解析、ML Backend 关联
- **存储基类**：`label_studio/io_storages/base_models.py`（`Storage` / `ImportStorage` / `ExportStorage` / `ImportStorageLink`，新存储提供者请遵循 `.cursor/rules/storage-provider.mdc`）
- **存储代理**：`label_studio/io_storages/proxy_api.py` + `label_studio/core/utils/static_serve.py` 决定走预签名 URL 还是 LS Proxy
- **标签配置解析**：`label_studio/core/label_config.py`
- **FSM 状态机**：`label_studio/fsm/state_manager.py` 是主要扩展点；`registry.py` 注册状态/转换
- **Feature Flags**：`label_studio/feature_flags.json` + `label_studio/core/feature_flags/`（LaunchDarkly SDK 兜底 JSON）
- **OpenAPI Schema**：drf-spectacular，访问 `/docs/api/schema/swagger-ui/` 或 `/docs/api/schema/redoc/`

### 3.4 常用接口速查

| 用途 | Method + Path |
| --- | --- |
| 健康检查 | `GET /health/` |
| 全部 URL JSON | `GET /api/version/` + 见 `label_studio/core/all_urls.json` |
| 列出/创建项目 | `GET POST /api/projects/` |
| 取下一个待标任务 | `GET /api/projects/<pk>/next/` |
| 校验 label_config | `POST /api/projects/validate/` |
| 导入任务 | `POST /api/projects/<pk>/import` |
| 分块上传 | `POST /api/projects/<pk>/import/chunked/{init,upload,complete}` |
| 导出 | `GET /api/projects/<pk>/export?exportType=JSON` |
| 列出 ML Backend | `GET POST /api/ml/?project=<id>` |
| 触发训练 | `POST /api/ml/<pk>/train` |
| 交互式标注 | `POST /api/ml/<pk>/interactive-annotating` |
| 数据管理列表 | `GET /api/dm/views/`、`GET /api/dm/columns/?project=<id>` |
| 获取 JWT | `POST /api/token/` |

---

## 4. 前端 (`web/`)：NX Monorepo

### 4.1 顶层

- `web/package.json` 定义 yarn workspaces 与 NX 命令（`ls:*` / `lsf:*` / `dm:*` / `ui:serve` / `build` / `lint` 等）
- `web/nx.json` / `web/webpack.config.js` — NX & webpack 配置
- `web/biome.json` — Biome 用作 ESLint+Prettier 替代

### 4.2 主前端 `web/apps/labelstudio/`

- `src/main.tsx` 入口
- `src/pages/` — 页面集（每个目录是 page set，详见 `web/apps/labelstudio/README.md` 的页面注册约定）
  - `Home/`、`Projects/`、`CreateProject/`、`DataManager/`、`ExportPage/`、`Organization/`、`AdminUsers/`、`Settings/`、`WebhookPage/`
  - 本仓库对 `pages/CreateProject/CreateProject.jsx`、`pages/CreateProject/Import/Import.jsx` 有定制（见 `git status`）
- `src/services/` — 与后端 API 的 fetch 封装
- `src/providers/` — React Context Providers（auth / config / current user）
- `src/components/` — 主 app 公共组件
- `src/config/` — 路由、菜单、feature flag key
- `src/routes/` — 路由 wrapper
- `src/utils/feature-flags.ts` — feature flag 工具
- 产出 → `web/dist/apps/labelstudio/` → 由 `manage.py collectstatic` 收集到 Django

### 4.3 关键 Lib

- `web/libs/editor/` — Label Studio Frontend（标注器内核）。基于 React + mobx-state-tree，独立可嵌入。文档：`web/libs/editor/README.md`、`web/libs/editor/LSF.init.md`
- `web/libs/datamanager/` — 数据浏览/批操作组件。可独立 build：`yarn dm:watch`
- `web/libs/app-common/` — 主 app 跨页面通用模块（含 `pages.AccountSettingsPage`）
- `web/libs/core/` — 通用工具，**lodash 替代统一从 `@humansignal/core/lib/utils/*` 导入**（详见 `.cursor/rules/no-lodash.mdc`）
- `web/libs/ui/` — 设计系统，含 Storybook（`yarn ui:serve`）
- `web/libs/frontend-test/` — 前端集成测试基础设施

### 4.4 常用前端命令（在 `web/` 目录下）

```bash
yarn install --frozen-lockfile
yarn dev               # 启动 HMR 开发服务器（需要 .env 中 FRONTEND_HMR=true）
yarn build             # 全量构建
yarn ls:watch          # 持续构建主 app
yarn lsf:watch         # 持续构建 LSF
yarn dm:watch          # 持续构建 DataManager
yarn ls:e2e            # 主 app E2E
yarn ls:unit           # 主 app 单测
yarn lint              # Biome lint+autofix
yarn ui:serve          # Storybook
```

构建产物会被打包进 pip wheel（`pyproject.toml` 的 `[tool.poetry] include` 字段控制）。

---

## 5. ML Backend：`ml_backends/sam3_local_backend/`

### 5.1 角色

实现 Label Studio ML Backend 协议（详见 `label_studio/ml/api_connector.py`），用于把本地部署的 Meta SAM3 模型暴露成 LS 可识别的 HTTP 服务。

### 5.2 实现

- 包入口：`sam3_local_backend/server.py`（标准 `BaseHTTPRequestHandler / ThreadingHTTPServer`，无 FastAPI 依赖）
- CLI 入口：`pyproject.toml [project.scripts]` 注册 `sam3-local-backend = sam3_local_backend.server:main`
- 默认监听 `http://127.0.0.1:9090`
- 模型加载位置由环境变量控制：
  - `SAM3_REPO_DIR` — SAM3 源代码路径（默认 `C:\Users\Administrator\Developer\sam3`），会被 `sys.path.insert` 注入
  - `SAM3_CHECKPOINT_PATH` — checkpoint 路径（默认 `…\facebook\sam3___1\sam3.1_multiplex.pt`）
  - `LABEL_STUDIO_BASE_DATA_DIR` — 用于解析 `/data/upload/...` 形式的本地任务图像
  - `SAM3_ML_PORT` / `SAM3_SCORE_THRESHOLD` / `SAM3_MAX_RESULTS_PER_LABEL` / `SAM3_LOG_DIR`

### 5.3 暴露接口（被 LS `MLApi` 调用）

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查（返回 `{status: UP, model_version: ...}`） |
| POST | `/setup` | 加载 label_config，加载/缓存模型，返回 from_name/to_name/labels |
| POST | `/predict` | 接收 `tasks + label_config + params.context`，返回预测结果（支持 RectangleLabels / PolygonLabels / BrushLabels） |
| GET | `/versions` | 返回当前模型版本 |
| POST | `/train` / `/webhook` | 占位（SAM3 本地后端不做训练，仅吞掉请求） |

### 5.4 标签配置支持

`Sam3Backend._parse_label_config()` 必须能在 `View` 中找到 `Image` + 以下之一：
`RectangleLabels` / `PolygonLabels` / `BrushLabels`。

可选 `KeyPoint` / `KeyPointLabels` 用于交互式 point prompt（正/负点）。

### 5.5 预测结果生成

`_build_prediction_result()` 按 `result_type` 分派到：

- `_build_rectangle_prediction` — 输出 `rectanglelabels` + 归一化 `x/y/width/height`
- `_build_polygon_prediction` — 把 mask → contour → 多边形点列
- `_build_brush_prediction` — 把 mask 编码成 Label Studio 私有 RLE（`_encode_ls_rle` 自实现的位流编码，遵循 LSF brush 格式）

### 5.6 启动

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start_sam3_ml_backend.ps1
```

该脚本会：
1. 用 `C:\Users\Administrator\Developer\sam3\.venv\Scripts\python.exe` 启动 `server.py`
2. 日志写到 `ml_backends/sam3_local_backend/sam3_ml_backend.{stdout,stderr,log}.log`
3. 轮询 `/health` 直到 UP
4. 发一次 warmup `/setup`（避免首次从 UI 加 backend 时超时）

---

## 6. 本地开发工作流（Windows，PowerShell）

### 6.1 一键拉起（推荐）

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_local_stack.ps1
# 改了前端再启动
powershell -ExecutionPolicy Bypass -File .\scripts\start_local_stack.ps1 -BuildFrontend
# 跳过 SAM3
powershell -ExecutionPolicy Bypass -File .\scripts\start_local_stack.ps1 -SkipMlBackend
```

流程：
1. （可选）调 `scripts/build_frontend_and_collectstatic.ps1`：`yarn build` + `manage.py collectstatic`
2. 检测 9090 端口；未占用则调 `scripts/start_sam3_ml_backend.ps1` 起 SAM3 并 warmup
3. 调 `scripts/start_label_studio_fixed_db.ps1` 起 LS

### 6.2 单独脚本

| 脚本 | 作用 |
| --- | --- |
| `scripts/start_label_studio_fixed_db.ps1` | 加载 `scripts/local.env`（固定 BASE_DATA_DIR / DATABASE_NAME / 默认管理员凭据），调用 `reset_default_admin.ps1`，然后 `python server.py start --no-browser` |
| `scripts/reset_default_admin.ps1` | 内嵌 Python 脚本：迁移 DB，把 `admin@admin.com / Admin / Admin123!` 复位为唯一超管，清理重名/孤儿账号 |
| `scripts/start_sam3_ml_backend.ps1` | 启动 SAM3，等 `/health`，warmup |
| `scripts/build_frontend_and_collectstatic.ps1` | `yarn build` + `python manage.py collectstatic --noinput` |
| `scripts/load_local_env.ps1` | 导入 `local.env` 为进程环境变量 |
| `scripts/local.env` | DB 路径、默认管理员凭据（**不要提交真实密码到远端公共仓库**） |

### 6.3 Django 直跑（绕过 PS 脚本）

```bash
# 在 label_studio/ 目录
DJANGO_DB=sqlite DJANGO_SETTINGS_MODULE=core.settings.label_studio python manage.py migrate
DJANGO_DB=sqlite DJANGO_SETTINGS_MODULE=core.settings.label_studio python manage.py runserver
```

或 `make run-dev` / `make migrate-dev` / `make makemigrations-dev`（需要 POSIX shell，Makefile 用 `DJANGO_DB=sqlite ... poetry run` 前缀）。

### 6.4 测试

```bash
# 后端
cd label_studio
DJANGO_DB=sqlite DJANGO_SETTINGS_MODULE=core.settings.label_studio pytest -vv

# 前端
cd web
yarn test:unit
yarn test:integration
yarn test:e2e
```

### 6.5 代码风格

- Python：`ruff`（line-length 119，single quote，配置在 `pyproject.toml`），pre-commit 通过 `.pre-commit-config.yaml`
- JS/TS：`biome`（`web/biome.json`），`yarn lint`
- 安装 git pre-push：`make configure-hooks`

---

## 7. 离线部署（`scripts/offline/`）

完整说明见 `scripts/offline/OFFLINE_RUNBOOK.md` 与 `scripts/offline/README_DEPLOY.md`。

核心流程：

```powershell
# 1) 联网机器：打包
powershell -ExecutionPolicy Bypass -File scripts/offline/build_offline_bundle.ps1 `
  -BundleOutputDir C:\offline_bundle `
  -PythonInstallerPath C:\path\python-3.12-amd64.exe `
  -VCRedistInstallerPath C:\path\VC_redist.x64.exe `
  -Sam3SourceDir C:\path\sam3 `
  -Sam3CheckpointPath C:\path\sam3.1_multiplex.pt `
  -Sam3GpuTorchPlatform cu126 -Force

# 2) 离线机器：安装
powershell -ExecutionPolicy Bypass -File D:\offline_bundle\scripts\install_offline_bundle.ps1 `
  -InstallRoot D:\LSOffline -Sam3RuntimeVariant gpu

# 3) 启动
powershell -ExecutionPolicy Bypass -File D:\LSOffline\scripts\start_all.ps1
powershell -ExecutionPolicy Bypass -File D:\LSOffline\scripts\healthcheck.ps1
```

打包脚本会：

- 构建 `label-studio` 与 `sam3-local-backend` 两个 wheel
- 下载所有 Python 依赖到 `wheelhouse/`（含 CPU 与 GPU torch/torchvision，含 Windows `triton-windows`，含 SAM3 运行时依赖 `timm/iopath/ftfy/huggingface_hub`）
- 复制 `sam3` 源码 + checkpoint 到 bundle
- 生成 `installers/`、`scripts/install_offline_bundle.ps1`、`scripts/start_all.ps1`、`scripts/start_local_stack.ps1`、`scripts/healthcheck.ps1`、`config/app.env.example`、`config/sam3.env.example`、`manifest.json`

安装脚本会在目标机器：

- 安装 Python 到 `D:\LSOffline\runtime\python`
- 建两个 venv：`venvs\app`（装 LS）和 `venvs\sam3`（装 SAM3 backend）
- 全部 `pip install --no-index --find-links wheelhouse/...`
- 把 sam3 源代码与 checkpoint 拷到固定路径
- 生成 `D:\LSOffline\config\app.env` 与 `D:\LSOffline\config\sam3.env`

`Sam3RuntimeVariant` 可选 `cpu` / `gpu`（实际选择 `cu126` 或 `cu128`，由 build 阶段 `-Sam3GpuTorchPlatform` 决定）。

---

## 8. 配置与环境变量速查

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `DJANGO_SETTINGS_MODULE` | `core.settings.label_studio` | Django 设置入口 |
| `DJANGO_DB` | `default` | `sqlite` 用 SQLite，`default` 用 Postgres（见 `core/settings/base.py`） |
| `DATABASE_NAME` | — | SQLite 文件路径 |
| `LABEL_STUDIO_BASE_DATA_DIR` | `%LocalAppData%\label-studio\label-studio` | LS 数据目录（媒体、导出、SQLite） |
| `LABEL_STUDIO_USERNAME` / `LABEL_STUDIO_PASSWORD` | — | 启动时自动创建超管 |
| `HOST` / `PORT` / `INTERNAL_PORT` | — / 8080 / 8080 | LS 监听 |
| `ML_TIMEOUT_*` | 见 `ml/api_connector.py` | ML 调用超时 |
| `SAM3_REPO_DIR` / `SAM3_CHECKPOINT_PATH` | 见 §5 | SAM3 模型 / 源码 |
| `SAM3_ML_PORT` | 9090 | SAM3 后端端口 |
| `SAM3_SCORE_THRESHOLD` | 0.25 | 过滤阈值 |
| `SAM3_MAX_RESULTS_PER_LABEL` | 10 | 单标签返回上限 |
| `FRONTEND_HMR` | false | 前端开发 HMR 开关 |

`scripts/local.env` 与 `scripts/offline/{app,sam3}.env.example` 是开箱配置模板。

---

## 9. 给 AI Agent 的开发建议

1. **不要修改上游 Django app 的整体架构**，只在必要时按已有约定（`api.py / serializers.py / urls.py / models.py / migrations/`）扩展。
2. **新加云存储**：严格按 `.cursor/rules/storage-provider.mdc` 走，参考 `io_storages/s3/` 与 `io_storages/gcs/`。注意 `app_label = 'io_storages'` 这一坑点。
3. **新加 ML Backend**：参考 `ml_backends/sam3_local_backend/sam3_local_backend/server.py`，至少实现 `/health`、`/setup`、`/predict`；如果不打算训练，`train/webhook` 也要 200，否则 LS 会因 503/异常无法添加。
4. **前端避免 lodash**：用 `@humansignal/core/lib/utils/*`（`.cursor/rules/no-lodash.mdc`）。
5. **新增前端页面**：见 `web/apps/labelstudio/README.md` 的 page set 约定（每个目录暴露组件、`.title` 与 `.path`，最后在 `src/pages/index.js` 注册）。
6. **新增后端 URL**：在对应 app 的 `urls.py` 加 path，主 router 在 `core/urls.py`，新增 app 时记得 `include('myapp.urls')`，并生成迁移 `python manage.py makemigrations`。
7. **运行迁移**：在本仓库 Windows 上用 `scripts/start_label_studio_fixed_db.ps1` 自动跑（`server.py` 会 `_apply_database_migrations()`），或手动 `make migrate-dev`。
8. **Feature Flags**：JSON 兜底在 `label_studio/feature_flags.json`，运行时如果配了 LaunchDarkly key 则走云端。
9. **API 文档**：新增 endpoint 时用 `@extend_schema`（drf-spectacular）写好 tags + summary + request/response，否则不会出现在 `/docs/api/schema/swagger-ui/`。
10. **测试**：后端 pytest 用 `DJANGO_DB=sqlite`；前端 NX 命令 `yarn ls:unit` / `yarn ls:e2e`。
11. **打包/发布**：`pyproject.toml [tool.poetry] include` 决定 wheel 内含哪些前端产物与静态资源。改前端后必须 `yarn build` 再 build wheel。
12. **离线包变更**：修改 `scripts/offline/sam3.requirements.txt` 加依赖后，需在联网机器重跑 `build_offline_bundle.ps1`。
13. **管理员复位**：默认管理员账号 `admin@admin.com / Admin123!` 由 `scripts/reset_default_admin.ps1` 维持，**生产环境务必改密码 / 删脚本**。
14. **不要把** `software_reg/`、`*.docx`、`*.log`、`scripts/local.env`、`ml_backends/sam3_local_backend/sam3_ml_backend.*.log` 当成代码追踪；它们是生成物或本地配置。

---

## 10. 快速命令清单

```powershell
# 一键开发环境
powershell -ExecutionPolicy Bypass -File .\scripts\start_local_stack.ps1

# 仅前端构建并 collectstatic
powershell -ExecutionPolicy Bypass -File .\scripts\build_frontend_and_collectstatic.ps1

# 仅 SAM3
powershell -ExecutionPolicy Bypass -File .\scripts\start_sam3_ml_backend.ps1

# 仅 LS
powershell -ExecutionPolicy Bypass -File .\scripts\start_label_studio_fixed_db.ps1

# 复位默认管理员
powershell -ExecutionPolicy Bypass -File .\scripts\reset_default_admin.ps1
```

```bash
# Poetry 安装（含 test 组）
pip install poetry
poetry install --with test

# 后端测试
cd label_studio && DJANGO_DB=sqlite DJANGO_SETTINGS_MODULE=core.settings.label_studio pytest -vv

# 前端
cd web && yarn install --frozen-lockfile && yarn build
```

---

## 11. 参考文档

- `README.md` — 上游 README + Windows 启动段落
- `DESIGN.md` — 上游架构设计
- `CONTRIBUTING.md` — 贡献指南
- `web/README.md`、`web/apps/labelstudio/README.md`、`web/libs/editor/README.md`、`web/libs/datamanager/README.md`
- `label_studio/io_storages/README.md`、`label_studio/fsm/README.md`、`label_studio/ml_models/README.md`、`label_studio/ml/README.md`、`label_studio/data_import/README.md`、`label_studio/projects/README.md`
- `scripts/offline/OFFLINE_RUNBOOK.md`、`scripts/offline/README_DEPLOY.md`
- `.cursor/rules/storage-provider.mdc`、`.cursor/rules/cypress_tests.mdc`、`.cursor/rules/no-lodash.mdc`
- API 文档：启动后访问 `http://localhost:8080/docs/api/schema/swagger-ui/`
