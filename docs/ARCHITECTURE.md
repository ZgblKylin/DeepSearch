# DeepSearch 架构说明

本文面向维护者：说明系统形态、模块职责、核心数据流与改动入口，以便在不通读源码的情况下定位改动。功能说明、部署步骤与脚本清单见 [README](../README.md)。

## 1. 系统形态

纯前端单页应用，没有服务端、数据库与构建期密钥。浏览器直接调用 DeepSeek 的 Search、Chat Completions 与 Fetch 接口，CORS 与客户端额度因此是外部依赖。

构建产物是多文件静态站点：`index.html` 内联全部样式与首屏骨架，脚本按首屏需要拆分——入口 chunk 只含 Vue 运行时、应用外壳与首页，结果页、AI 面板（含 Markdown 渲染）与设置面板在首次使用时才加载。`public/_headers` 随产物输出，供 Cloudflare 配置缓存策略。

技术栈为 Vue 3.5、TypeScript 5.9 与 Vite 7。不使用 Vue Router，查询串 `q` 即路由状态；测试使用 Vitest 与 jsdom。

## 2. 目录与职责

| 路径 | 职责 | 约束 |
| --- | --- | --- |
| `src/App.vue` | 视图切换、搜索与 AI 编排 | 唯一的跨模块编排点 |
| `src/views/` | 首页与结果页布局 | 布局本身不发起请求 |
| `src/components/layout/` | 顶栏与页脚 | 顶栏包含品牌链接与紧凑搜索框 |
| `src/components/search/` | 搜索框、AI 开关、外部引擎、帮助 | 搜索框由首页与结果页共用 |
| `src/components/results/` | 结果列表、卡片、筛选栏、状态视图 | 排序在本地完成，不重新请求 |
| `src/components/ai/` | AI 侧栏、对话、摘要、Markdown 渲染 | Markdown 渲染集中在 `MarkdownView` |
| `src/components/settings/` | 设置面板与各分区 | 读写 `useSettings` |
| `src/components/ui/` | 图标、弹窗、浮层、开关等通用件 | 不持有业务状态 |
| `src/composables/` | 路由、搜索、AI、主题、过渡、交互 | 状态为模块级单例 |
| `src/lib/` | 请求、语法、上下文、Markdown、排序、计费、存储、预取 | 以纯函数为主 |
| `src/stores/` | settings、ui、usage 单例 | 负责 localStorage 归一化读写 |
| `src/styles/` | 设计令牌、基础重置、首屏骨架样式 | 骨架样式供 `index.html` 静态副本复用 |
| `src/types.ts` | 共享类型与默认值 | 默认值的唯一来源 |
| [`index.html`](../index.html) | CSP、首屏骨架、主题脚本、搜索预取脚本 | 两个内联脚本必须保持同步执行 |
| [`public/_headers`](../public/_headers) | Cloudflare Pages 缓存策略 | HTML 短缓存，`/assets/*` 长缓存 |
| [`vite.config.ts`](../vite.config.ts) | 多文件构建、拆包、样式内联、Vue 特性开关 | |
| [`scripts/verify-artifacts.mjs`](../scripts/verify-artifacts.mjs) | 构建产物断言 | |
| `tests/` | 单元与集成测试 | |

## 3. 数据流

### 3.1 路由

`q` 是唯一事实来源，由 [`useQueryRoute`](../src/composables/useQueryRoute.ts) 的模块级 `ref` 承载。`navigate(q)` 只写 `pathname + ?q=` 并调用 `pushState`，空 `q` 回到 `pathname`；`popstate` 时 `syncFromLocation` 从地址栏回读。首页与结果页的切换由 `App.vue` 依据 `q` 是否为空决定。

### 3.2 搜索链路

1. `App.vue` 以 `immediate` 监听 `query`：非空时先 `ai.reset()` 再调用 `search.run(q)`；为空时取消在途请求、恢复初始状态并重置 AI。
2. [`useSearch`](../src/composables/useSearch.ts) 的 `run` 负责长度校验、API Key 拦截与发起请求。缺少 Key 时置 `awaitingKey` 并弹窗，保存后自动继续本次搜索。
3. `execute` 清空旧结果、递增请求序号、优先复用预取，未命中时调用 `searchWeb`。过期响应按序号丢弃，成功后记录本机统计。
4. 结果写入后，`App.vue` 的另一处监听在「非加载中 + 已搜索 + 有结果 + AI 开启 + 结果对应地址栏 `q`」时触发 `ai.summarize()`。

同一 `q` 在加载中重复触发时复用进行中的请求；在结果页再次提交同一 `q` 视为强制刷新，会重新请求并重置 AI 会话。

### 3.3 搜索预取

预取把请求起点前移，使网络耗时与页面加载、路由跳转重叠。

| 发起位置 | 时机 | 说明 |
| --- | --- | --- |
| `index.html` head 内联脚本 | HTML 解析阶段 | 读取 localStorage 与 `?q=` 后直接请求，记录挂在 `window.__DS_SEARCH_PREFETCH__` |
| `SearchBar.vue` 的 `submit` | 路由跳转与 View Transition 之前 | 直接调用 `startSearchPrefetch` |

复用由 [`searchPrefetch`](../src/lib/searchPrefetch.ts) 校验：`query`、`count`、`oriQuestion` 与 API Key 四项完全一致，且距发起不超过 30 秒；记录一次性消费，预取失败一律回退到正式请求。head 脚本不复现搜索语法解析，含语法 token 的查询不预取。

### 3.4 AI 会话

[`useAi`](../src/composables/useAi.ts) 用 `phase` 表达状态：`idle`、`summarizing`、`ready`、`followup-loading`、`followup-ready`、`error`。三条入口分别是 `summarize()`（基于搜索结果）、`startFromResult(result)`（基于单条网页正文）与 `ask(text)`（多轮追问）。

请求使用流式响应：`chatCompletion` 提供 `onDelta` 时切换为 SSE，正文增量按 60 毫秒节流写入 `messages`，思考内容单独累积且不进入正文。请求被取代或中止时保留已经流出的正文。

摘要上下文取按相关度排序的前 8 条结果，单条截断 1200 字符、总量 16000 字符；单条网页追问的单条截断 6000 字符、总量 18000 字符。

### 3.5 搜索语法

[`parseQuery`](../src/lib/query.ts) 产出结构化筛选项、`oriQuestion` 与无法识别的 token。解析不丢弃输入：无法识别的文本原样进入 `oriQuestion`。筛选栏从 `q` 解析得到状态，改动后经 `updateQueryFilters` 重新序列化写回 `q`，再触发搜索。

## 4. 关键契约

### 4.1 请求层

[`lib/api.ts`](../src/lib/api.ts) 的 `performRequest` 统一处理超时、取消与错误归一化，一次性请求与流式请求共用同一路径。

| 接口 | 约定 |
| --- | --- |
| `searchWeb(key, { query, count, oriQuestion?, signal? })` | 请求体只含 `query`、`count` 与 `need_content: false`；`oriQuestion` 非空时附加 `ori_question`；不发送 `localization` |
| `chatCompletion(key, { model, messages, effort, maxTokens?, signal?, onDelta? })` | 提供 `onDelta` 时走流式并附加 `stream` 与 `stream_options.include_usage`，省略时一次性响应 |
| `fetchPage(key, url, signal?)` | 读取单条网页正文 |
| `testApiKey(key)` | 校验 Key，不产生费用 |

错误统一为 `ApiError`，`code` 的归一化顺序是 `error.code` → `error.type` → `http_<status>`。调用方主动取消抛原生 `AbortError`，UI 层静默忽略；超时归一化为 `timeout`。

### 4.2 状态单例

`useSettings`、`useUi`、`useUsage`、`useSearch` 与 `useAi` 都是模块级单例，组件直接调用即共享同一份状态。`useSettings.update` 立即持久化；`useUi.requireApiKey(action)` 在已有 Key 时同步执行回调，否则缓存动作并打开 Key 弹窗。

### 4.3 构建与产物

构建按首屏需要拆分：入口只含外壳与首页，其余在首次使用时加载。

| 产物 | 内容 | 加载时机 |
| --- | --- | --- |
| `index.html` | 首屏骨架、内联样式、主题与预取脚本 | 首屏 |
| `assets/index-*.js` | 应用外壳、首页、顶栏、`lib` 核心 | 首屏 |
| `assets/vue-*.js` | Vue 运行时（`modulepreload` 预加载） | 首屏 |
| `assets/ResultsView-*.js` | 结果页、筛选栏、结果卡片与状态视图 | 进入结果页 |
| `assets/AiSidebar-*.js` | AI 侧栏与对话 | AI 面板出现 |
| `assets/markdown-*.js` | `marked` 与 `dompurify` | AI 面板出现 |
| `assets/SettingsPanel-*.js` | 设置面板 | 首次打开设置 |

拆包由 `manualChunks`（vue、markdown）与 `defineAsyncComponent` 共同决定；新增较大组件时优先异步加载，并保持首屏脚本在产物断言的 200 KB 预算内。样式表在构建收尾由 `finalizeHtmlPlugin` 内联进 HTML 后删除源文件。

每次构建还会输出 `.report/bundle.html`（`rollup-plugin-visualizer` 的 treemap），用于核对各依赖占比；该目录已忽略，不参与部署。体积优化以「拆分」为主：Rollup tree-shaking、`__VUE_OPTIONS_API__: false` 与 esbuild 压缩已把可自动裁剪的部分处理完，Vue 运行时与 marked/dompurify 内部没有按功能裁剪的入口。

## 5. 常见改动入口

| 需求 | 位置 | 注意 |
| --- | --- | --- |
| 修改搜索请求体 | [`lib/api.ts`](../src/lib/api.ts) 与 [`index.html`](../index.html) | 两处必须逐字节一致，否则预取永远失配 |
| 调整默认设置 | [`types.ts`](../src/types.ts) 的 `DEFAULT_SETTINGS` | head 预取脚本不得硬编码默认值 |
| 调整返回条数范围 | `types.ts` 的 `RESULT_COUNT_MIN` 与 `RESULT_COUNT_MAX` | 同步 head 脚本的收敛区间 |
| 修改首页首帧 | [`views/HomeView.vue`](../src/views/HomeView.vue) 与 [`index.html`](../index.html) 的骨架 | 结构、文案、字号需对齐，否则首帧跳动 |
| 修改 AI 提示词或上下文 | [`lib/aiContext.ts`](../src/lib/aiContext.ts) | 单条与总量截断常量也在此文件 |
| 修改 Markdown 安全策略 | [`lib/markdown.ts`](../src/lib/markdown.ts) | 清洗配置与引用转换同在此文件 |
| 新增图标 | [`components/ui/Icon.vue`](../src/components/ui/Icon.vue) | 未知名称回退 `help-circle` |
| 修改主题色或间距 | [`styles/tokens.css`](../src/styles/tokens.css) | 首屏主题脚本与骨架同步，避免深色模式闪白 |
| 调整构建断言 | [`scripts/verify-artifacts.mjs`](../scripts/verify-artifacts.mjs) | 断言语义必须与产物事实一致 |
| 新增本地存储 | [`lib/storage.ts`](../src/lib/storage.ts) 的 `STORAGE_KEYS` | 读取一律经过归一化 |

## 6. 测试与验证

`npm run check` 依次执行类型检查、单元与集成测试、生产构建与产物断言。产物断言覆盖：样式已内联、首屏骨架含真实文本、入口与预加载文件存在、`assets/` 无冗余样式、首屏脚本 200 KB 预算、API 基址、密钥不泄漏、连接预热与预取脚本存活、`_headers` 输出。

`npm run lint:deadcode` 用 `knip` 检测未使用的文件、导出与依赖。新增模块时若导出只在本文件内使用，就不要加 `export`——knip 会把多余导出报出来。该检查不在 `npm run check` 内，提交前手动运行。

首屏指标可用 Chrome DevTools 协议的 `Network.emulateNetworkConditions` 与 `Emulation.setCPUThrottlingRate` 模拟移动端 4G 与 4 倍 CPU 降速，读取 `first-contentful-paint` 与 `largest-contentful-paint` 条目复核。注意 Chrome 的 FCP/LCP 只统计文本与图片，纯色块骨架不会提前指标。

构建与测试依赖 esbuild 子进程；在禁止创建子进程的环境中会以 `spawn EPERM` 失败，此时需要完整权限执行。

## 7. 约束与陷阱

- **多文件产物**：首屏入口 chunk 与 Vue 运行时约 155 KB（gzip 61 KB），懒加载 chunk 不参与首屏。新增依赖默认进入入口 chunk，改动后先看产物断言的首屏预算。
- **首屏骨架**：`index.html` 的 `#app` 是首页的静态副本，必须包含真实文本——纯色块不参与 FCP/LCP 统计。改首页结构或文案时同步骨架，否则首帧跳动。
- **CSP 严格**：`script-src` 只允许 self 与内联脚本，`connect-src` 只允许 self 与 `https://api.deepseek.com`。新增外部请求域必须同步修改 `index.html` 与产物断言。
- **Key 边界**：`.env` 中的 Key 只在开发模式注入，生产构建注入空字符串；产物不得包含真实 Key。
- **部署路径**：资源引用是相对路径，入口 URL 必须以 `/` 结尾。`/search` 会被当作文件，把 `./assets/*` 解析到站点根并 404。这一层由反向代理承担：线上用 Cloudflare Worker 按路径分发，代理层负责 `/search` → `/search/` 重定向与 `/search/assets/*` → `/assets/*` 改写。Pages 只能整域绑定，`_redirects` 在此场景不适用。
- **预取一致性**：head 脚本与正式请求的参数必须完全一致。默认值、条数范围、请求体字段任何一侧改动都要同步另一侧。
- **View Transition**：`view-transition-name: site-search` 全页只能出现一次，因此结果页只在顶栏渲染搜索框；窄屏与「减少动效」偏好下跳过动画。
- **AI 计费**：摘要与追问都会产生 Token 费用；同一次搜索的结果指纹未变时复用已有摘要，不重复请求。
