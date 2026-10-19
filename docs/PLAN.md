# DeepSearch 实施计划与共享契约

## 1. 目标

构建一个纯前端搜索站，部署在 Cloudflare Pages 等静态托管平台。技术栈为 Vue 3 + Vite + TypeScript，构建产物为单个 `dist/index.html`。站点通过 DeepSeek Search API 搜索，通过 Chat Completions API 生成 AI 摘要与追问，通过 Fetch API 读取网页正文。

核心约束：

- 没有服务端，所有请求从浏览器直接发往 `https://api.deepseek.com`。
- 搜索请求完全省略 `localization` 字段。
- API Key 只保存在浏览器 localStorage；开发模式可从 `.env` 注入初始值。
- 任何 API 操作前若没有 Key，先弹出 Key 输入弹窗；保存后继续原操作。
- API 失败弹出错误弹窗，必须显示 HTTP 状态码、错误码和 message。
- 构建产物不得包含 `.env` 中的真实 Key。

## 2. 已核实事实

| 项目 | 结论 |
| --- | --- |
| Search | `POST https://api.deepseek.com/v1/tools/search`；`results[]` 含 `rerank_score`、`title`、`url`、`snippet`、`summary`、`content`、`site_name`、`site_icon`、`date`、`authority`；无 usage |
| Chat | `POST https://api.deepseek.com/chat/completions`；模型 `deepseek-flash`、`deepseek-v4-pro`；支持 `thinking` 与 `reasoning_effort` |
| Chat usage | `prompt_cache_hit_tokens`、`prompt_cache_miss_tokens`、`completion_tokens`、`completion_tokens_details.reasoning_tokens`、`total_tokens` |
| Fetch | `POST https://api.deepseek.com/v1/tools/fetch`，请求 `{ url }`，返回 `{ title, content }` |
| 测试连接 | `GET https://api.deepseek.com/models`，不产生 token 费用；401 可能返回纯文本 |
| CORS | Search、Fetch、Chat 的 OPTIONS 均反射任意 Origin，允许 `authorization,content-type`；纯前端可直接调用 |
| 价格 | Flash：命中输入 0.04/0.02 元、未命中 2/1 元、输出 8/4 元每百万 tokens（高峰/空闲）；Pro：0.30/0.15、9/4.5、27/13.5；Search/Fetch 每 1000 次成功请求 5 元 |
| 高峰 | 北京时间周一至周五（不含法定节假日）9:00–12:00、14:00–18:00；前端按工作日近似 |
| 模型名 | 请求使用 `deepseek-flash`、`deepseek-v4-pro`；`deepseek-v4-flash` 作为价格别名归一化为 Flash |
| Logo | 官方蓝色字标中的虎鲸路径，填充 `#3964FE`，来源 `https://fe-static.deepseek.com/chat/static/web-logo.svg`；不使用 api-doc 黑灰版本 |
| Git 远端 | `https://github.com/ZgblKylin/DeepSearch` |
| 工具链 | Node 24.19、npm 11.8；Vite 7.3.7、Vue 3.5.44、TypeScript 5.9.3、vite-plugin-singlefile 2.3.4、Vitest 5.0.5、marked 18.1.1、DOMPurify 3.4.17 |
| npm 缓存 | 默认缓存目录在 workspace 外会 EPERM；安装使用 `npm install --cache .npm-cache` |
| 开发 Key | `.env` 中 `DEEPSEEK_API_KEY` 仅在开发模式注入；当前文件未被 Git 跟踪 |

## 3. 页面与交互

### 3.1 路由

- 首页：当前 pathname，无查询串。
- 结果页：当前 pathname + `?q=<encoded>`。
- 不引入 Vue Router；使用 `history.pushState`、`popstate`、`URLSearchParams`。
- 空 `q` 显示首页；非空 `q` 显示结果页并自动搜索。
- 新搜索与筛选使用 `pushState`；主题、AI 模式等偏好不写 URL。
- 前进/后退恢复对应 `q`；同一 `q` 不重复请求。
- 首页进入结果页时，搜索框用 View Transitions API 从 hero 移动到顶栏居中；不支持或 reduced-motion 时降级为淡入/位移动画。

### 3.2 顶栏与首页

- 固定顶栏，桌面约 64px；移动端两行。
- 左侧：蓝色虎鲸标 + `DeepSearch`，点击回首页。
- 右侧：主题菜单（浅色/深色/系统）、GitHub 链接、设置按钮。
- 结果页中部为紧凑搜索框；首页 hero 居中，宽度上限约 720px。
- 搜索框结构：搜索图标 + 输入框 + AI 模式胶囊开关（默认开启） + 搜索按钮；搜索按钮右侧依次为外部搜索引擎按钮（只显示 logo）和帮助图标（线条圆圈问号）。
- 外部引擎默认 Bing，可配置 Google、百度、DuckDuckGo；使用 `<a target="_blank" rel="noopener noreferrer">`，空查询禁用。
- 帮助图标 hover 延迟打开，点击固定，点击外部或 Esc 关闭；内容列出全部搜索语法与示例，链接官方文档。
- 首页有简短标语；不展示历史、推荐或广告。

### 3.3 结果页

- 最大宽度约 1280px；桌面“结果列 + 右侧 AI 侧边栏”，侧边栏约 380px 且 sticky；移动端单列，AI 面板为可折叠卡片。
- 结果顶部显示条数、耗时、当前排序；下方是筛选项栏。
- 加载时显示骨架卡片和“正在搜索 ···”三点动画；旧结果立即清空。
- 结果卡片：标题、域名、站点名、日期、snippet、相关度分数（两位小数）、优质/权威徽标；标题和 URL 新标签页打开。
- 站点图标优先使用 Search API 返回的 `site_icon`；字段缺失、协议非法或加载失败时回退为本地首字母/哈希色头像。CSP 允许 HTTPS 图片。
- 空结果有空状态；失败有错误状态与重试，同时弹全局错误弹窗。
- 默认按 `rerank_score` 降序；最新按 `date` 降序、空日期最后、同日按 `rerank_score` 降序。
- 不分页。

### 3.4 筛选项与搜索语法

筛选栏是搜索语法的可视化编辑器。`q` 是唯一事实来源：筛选项从 `q` 解析，应用筛选写回 `q` 并立即搜索；用户直接输入语法后提交，筛选项同步更新。解析器保留无法识别的文本与 malformed token。

| 语法 | 筛选项 | 序列化 |
| --- | --- | --- |
| `site:a.com` / `site:a OR site:b` | 包含站点 | 多站点 `site:a OR site:b` |
| `-site:a.com` | 排除站点 | `-site:a -site:b` |
| `"精确短语"` | 精确短语 | 加引号 |
| `-word` / `-"短语"` | 排除关键词 | 单词加 `-`，含空格加引号 |
| `lang:zh,en` | 语言 | 逗号分隔 |
| `after:YYYY-MM-DD` | 起始日期 | 仅年份归一化为 `YYYY-01-01` |
| `before:YYYY-MM-DD` | 结束日期 | 仅年份归一化为 `YYYY-12-31` |

- 筛选项以分组 chip 呈现；每组可清除；提供“清除筛选”。
- 站点输入去掉协议、路径、查询串，只保留 host。
- 日期冲突在弹层内提示，不请求。
- 应用筛选后若 `q` 为空，回首页。
- 每次搜索发送 `ori_question`（去掉语法 token 的纯文本，非空且不超过 128 字符时），不发送 `localization`。
- 查询超过 128 个 Unicode 字符时行内提示，不请求。

### 3.5 AI 模式

- 默认开启，持久化。
- 搜索成功后，若开启且结果非空，自动生成侧边栏摘要。
- 摘要上下文取按 `rerank_score` 排序的前 8 条，单条截断 1200 字符，总量上限 16000 字符；不请求 `need_content`。
- 使用配置模型与思考挡位；默认 `deepseek-flash`、`high`；非流式，`max_tokens: 4096`，超时 120 秒。
- 系统提示：只依据结果、不编造、使用查询主要语言、先结论后要点、用 `[n]` 引用、不要输出思考过程、约 600 字。
- Markdown 经 DOMPurify 清洗；禁止 `img`、`iframe`、`object`、`style`、表单；链接加 `noopener noreferrer`；`[n]` 转为来源 URL 上标链接。
- 摘要底部一行：左侧“优质 N”（`rerank_score >= 1.5`）与“权威 N”（`authority >= 3`），右侧“AI 追问”按钮。
- 点击“AI 追问”：重置会话，用 Fetch API 读取按 `rerank_score` 排序的前 3 条唯一 URL，每条截断 6000 字符，总量上限 18000 字符；显示“正在读取网页 2/3”。
- Fetch 部分失败用搜索摘要补位并提示；全部失败弹一次错误弹窗并回退，不阻塞追问。
- 读取完成后调用 Chat API 生成新的追问背景摘要，作为新会话第一条 assistant 消息；之后支持多轮对话，历史只保留 `content`，不回传 `reasoning_content`。
- 追问模式头部显示来源数量与“重新开始”；原摘要标签行不再显示。
- 关闭 AI 模式时中止摘要请求并隐藏面板；同一次搜索结果再次开启复用已有摘要；新搜索重置 AI 会话。
- 自动摘要失败时结果保留，侧边栏错误 + 重试；Key/余额等错误同时弹全局错误弹窗。
- 面板显示“AI 生成，仅供参考”。

### 3.6 设置面板

右侧悬浮面板 + 半透明遮罩，宽约 460px；点击外部、Esc、关闭按钮关闭；移动端全屏。所有修改即时写入 localStorage（Key 输入失焦/防抖写入）。

- 连接配置：API Key（密码框、显示/隐藏）、测试连接、AI 模型（`DeepSeek Flash` / `DeepSeek V4 Pro`）、思考挡位（关闭/低/高/最高，默认高）。
- 搜索偏好：每次返回条数（1–50，默认 10）、排序（相关度/最新，默认相关度）。
- 外部搜索引擎：Bing、Google、百度、DuckDuckGo 卡片单选，默认 Bing。
- 本机数据统计：搜索次数、抓取次数、Token 总消耗、预估 API 花费；模型维度输入命中/未命中/输出/高峰/空闲费用；Search/Fetch 计费；价格说明。
- 清零用量：二次确认，仅清统计。
- 清空数据：危险色 + 二次确认，清空 Key、设置、统计；主题回系统；回首页。
- 测试连接使用当前输入框 Key 调 `GET /models`；成功显示模型数与耗时；失败弹错误弹窗并在区块内保留红色状态。
- 模型/挡位/条数下次生效；排序立即重排已有结果；引擎立即生效。
- 费用按请求完成时的北京时间判定峰谷；Search/Fetch 仅成功且非空计费。
- 价格硬编码并标注“按 2026-10 官方价格硬编码，实际以平台账单为准”；节假日按工作日近似。

### 3.7 弹窗与错误

- Key 弹窗：标题“配置 DeepSeek API Key”，密码输入、显示/隐藏、保存、获取 Key 外链；保存或点击外部关闭；Esc 关闭；空值不可保存；保存后执行触发操作。
- 错误弹窗：标题按操作显示；字段 HTTP 状态码、错误码、message、可选请求 ID；401/402/429/5xx 给建议；关闭/复制详情；点击外部或 Esc 关闭；同一时刻只显示一个，新错误覆盖。
- 网络错误状态码“—”、code `network_error`。
- 用户中止/新请求取消旧请求不弹错误。
- 保存/复制/清零使用轻量 toast。

### 3.8 主题、页脚、响应式

- 主题三态，持久化；`index.html` 内联脚本在首屏前设置 `data-theme`；系统模式监听 `prefers-color-scheme`。
- 主色 `#3964FE`；深色主题可提亮 UI 强调色。
- 页脚在正常文档流，不固定；文案“无广告 · 无追踪 · 非 DeepSeek 官方 · API Key 仅保存在浏览器本地”，补充“搜索与 AI 内容由 DeepSeek API 提供，仅供参考”。
- 断点约 1024px、768px、480px。
- 无障碍：搜索表单 role/aria-label；加载与结果数 aria-live；弹窗焦点陷阱、Esc、焦点归还；focus-visible；reduced-motion；移动端不自动聚焦。

## 4. API 契约

```json
POST https://api.deepseek.com/v1/tools/search
{
  "query": "DeepSeek site:github.com lang:zh",
  "count": 10,
  "need_content": false,
  "ori_question": "DeepSeek"
}
```

完全省略 `localization`。

```json
POST https://api.deepseek.com/chat/completions
{
  "model": "deepseek-flash",
  "messages": [{ "role": "system", "content": "..." }, { "role": "user", "content": "..." }],
  "thinking": { "type": "enabled" },
  "reasoning_effort": "high",
  "max_tokens": 4096
}
```

挡位关闭时 `thinking: { "type": "disabled" }` 并省略 `reasoning_effort`；其余发送 `enabled` 与 `low`/`high`/`max`。不发送 `temperature`。

```json
POST https://api.deepseek.com/v1/tools/fetch
{ "url": "https://example.com/article" }
```

```http
GET https://api.deepseek.com/models
Authorization: Bearer <key>
```

- 所有请求加 Bearer 与 JSON Content-Type。
- 超时：Search 20s、Chat 120s、Fetch 30s、测试 15s；AbortController 支持取消与超时。
- 每次新搜索/追问取消上一组请求；请求序号丢弃过期响应。
- 非流式 Chat。

错误归一化：`{ error: { message, type, code } }`；code 缺失用 type，再缺失 `http_<status>`；纯文本响应作为 message；网络 `network_error`；超时 `timeout`；解析失败 `invalid_response`。

## 5. 数据与统计

localStorage：

- `deepsearch.settings.v1`
- `deepsearch.usage.v1`

默认设置：

```json
{
  "apiKey": "",
  "aiModel": "deepseek-flash",
  "reasoningEffort": "high",
  "resultCount": 10,
  "sortMode": "relevance",
  "engine": "bing",
  "aiMode": true,
  "theme": "system"
}
```

统计字段：`searches`、`searchBillable`、`searchCost`、`fetches`、`fetchBillable`、`fetchCost`、按模型的 `promptHitTokens`、`promptMissTokens`、`completionTokens`、`reasoningTokens`、`requests`、`peakCost`、`offPeakCost`、`updatedAt`。

开发 Key：Vite `loadEnv` 读取 `.env` 的 `DEEPSEEK_API_KEY`，仅 development 注入 `__DEV_API_KEY__`；应用启动时若没有 Key 则写入并提示；生产构建注入空字符串。

价格（元/百万 tokens）：

| 模型 | 命中输入 高峰/空闲 | 未命中输入 高峰/空闲 | 输出 高峰/空闲 |
| --- | --- | --- | --- |
| `deepseek-flash` | 0.04 / 0.02 | 2 / 1 | 8 / 4 |
| `deepseek-v4-pro` | 0.30 / 0.15 | 9 / 4.5 | 27 / 13.5 |
| `deepseek-v4-flash` | 同 Flash | 同 Flash | 同 Flash |

Search/Fetch 每次成功 0.005 元。高峰按 `Asia/Shanghai` 周一至周五 `[9,12)`、`[14,18)`；忽略法定节假日。

## 6. 工程契约

目录与职责：

```text
src/
  App.vue, main.ts, env.d.ts, types.ts
  styles/{tokens.css, base.css}
  lib/{api.ts, errors.ts, storage.ts, format.ts, query.ts, sort.ts,
       engines.ts, pricing.ts, usage.ts, aiContext.ts, markdown.ts}
  stores/{settings.ts, usage.ts, ui.ts}
  composables/{useQueryRoute.ts, useSearch.ts, useAi.ts, useTheme.ts,
               useViewTransition.ts, useOutsideClick.ts, useFocusTrap.ts}
  components/
    layout/{TopBar.vue, FooterDisclaimer.vue}
    ui/{Icon.vue, WhaleLogo.vue, LetterAvatar.vue, Popover.vue, BaseModal.vue,
        LoadingDots.vue, ToggleSwitch.vue, ToastHost.vue}
    search/{SearchBar.vue, EngineButton.vue, AiModeToggle.vue, HelpPopover.vue}
    results/{ResultsHeader.vue, FilterBar.vue, ResultsList.vue, ResultCard.vue,
             ResultsSkeleton.vue, EmptyState.vue, ErrorState.vue}
    ai/{AiSidebar.vue, AiSummary.vue, AiTags.vue, AiChat.vue, ChatMessage.vue,
        MarkdownView.vue}
    settings/{SettingsPanel.vue, ConnectionSection.vue, PreferencesSection.vue,
              EngineSection.vue, UsageSection.vue, DangerSection.vue,
              ApiKeyModal.vue, ErrorModal.vue}
  views/{HomeView.vue, ResultsView.vue}
tests/{setup.ts, unit/*, integration/*}
scripts/verify-singlefile.mjs
docs/{PLAN.md, PROGRESS.md, SUMMARY.md, qa/*}
```

共享单例接口：

- `useSettings()`：`settings` 响应式对象、`update(patch)`、`resetAll()`、`seedDevKey()`。
- `useUi()`：`apiKeyModal`、`errorModal`、`settingsOpen`、`toast` 状态；`requireApiKey(action)`、`showError(error, context)`、`openSettings()`、`showToast(message)`。
- `useQueryRoute()`：`query`、`navigate(q)`、`goHome()`、`syncFromLocation()`。
- `useSearch()`：`query`、`results`、`loading`、`error`、`elapsedMs`、`run(q)`、`cancel()`、`retry()`。
- `useAi()`：`phase`（`idle`/`summarizing`/`ready`/`followup-loading`/`followup-ready`/`error`）、`messages`、`sources`、`error`、`summarize()`、`startFollowup()`、`ask(text)`、`reset()`、`abort()`。
- `useUsage()`：`usage`、`recordSearch(resultCount)`、`recordFetch(success)`、`recordChat(model, usage)`、`resetUsage()`、`clearAll()`。

API 客户端（`src/lib/api.ts`）：

```ts
class ApiError extends Error { status; code; type; requestId?; context? }
searchWeb(key, { query, count, oriQuestion?, signal }): Promise<SearchResult[]>
chatCompletion(key, { model, messages, effort, maxTokens, signal }): Promise<ChatResult>
fetchPage(key, url, signal): Promise<{ title: string; content: string }>
testApiKey(key): Promise<{ models: string[]; elapsedMs: number }>
```

构建脚本：

```json
{
  "dev": "vite --port 5173 --strictPort",
  "build": "vue-tsc --noEmit && vite build",
  "preview": "vite preview --port 4173 --strictPort",
  "typecheck": "vue-tsc --noEmit",
  "test": "vitest",
  "test:run": "vitest run",
  "verify:singlefile": "node scripts/verify-singlefile.mjs",
  "check": "npm run typecheck && npm run test:run && npm run build && npm run verify:singlefile"
}
```

- 安装：`npm install --cache .npm-cache`。
- Vite：`base: './'`、`viteSingleFile()`、内联资源、`cssCodeSplit: false`、`sourcemap: false`。
- 单文件校验：dist 只有 index.html；无外链脚本/样式；含 `api.deepseek.com`；不含 `.env` Key；体积预算小于 2 MB。
- CSP：self、内联样式/脚本、`https://api.deepseek.com`、开发 HMR localhost WebSocket；不允许外部图片/字体。
- 全站中文，文档中文；遵循 `E:\Git\dsh-gui-home\.dsh\.agents\docs\行文规范.md`。

## 7. 团队与任务

| 任务 | 负责人 | 写作用域 | 依赖 |
| --- | --- | --- | --- |
| T1 脚手架与共享契约 | fe-core | 根配置、index.html、src/main.ts、App.vue、types.ts、styles/、lib/{api,errors,storage,format}.ts、stores/{settings,ui}.ts、composables/{useQueryRoute,useTheme,useViewTransition,useOutsideClick,useFocusTrap}.ts、components/{layout,ui}/、views/、功能组件 stub | — |
| T2 搜索体验 | fe-search | components/{search,results}/、composables/useSearch.ts、lib/{query,sort,engines}.ts、对应测试 | T1 |
| T3 AI 模式 | fe-ai | components/ai/、composables/useAi.ts、lib/{aiContext,markdown}.ts、对应测试 | T1 |
| T4 设置与统计 | fe-settings | components/settings/、lib/{pricing,usage}.ts、stores/usage.ts、对应测试 | T1 |
| T5 集成与构建 | fe-core | 共享/集成文件；功能问题通知负责人 | T2、T3、T4 |
| T6 独立验收 | qa-review | scripts/、tests/integration/、docs/qa/、dist/（验证时） | T5 |
| T7 修复 | 对应负责人 | 各自作用域 | T6 |
| T8 复验 | qa-review | 同 T6 | T7 |
| T9 最终验收与暂存 | Lead | README.md、docs/、Git 暂存区 | T8 |

规则：

- 功能团队不得修改共享文件；需要改契约时先通知 Lead，由 Lead 决定并让 `fe-core` 修改。
- 只有 Lead 或 `fe-core` 执行依赖安装与构建；功能团队只跑 typecheck 与自己的测试，避免并发写 `node_modules`/`dist`。
- 不执行 `git commit`；最终由 Lead `git add` 并提醒用户手动提交。
- 不提交 `.env`、`node_modules/`、`dist/`、`.npm-cache/`、coverage。
- 中间进度由 Lead 记录到 `docs/PROGRESS.md`；任务完成后询问用户是否清理过程文档。

## 8. 验收

- `npm run check` 全通过。
- dist 单文件且无 Key。
- 真实 API E2E：Key 弹窗、搜索、排序、筛选、AI 摘要、AI 追问、设置、统计、主题、帮助、移动端。
- 控制台无报错；除 `api.deepseek.com` 外无第三方请求；无 Key 泄漏。
- QA 按 review skill 审查，P0/P1 清零。

## 9. 实现备注（T1 交接说明）

> 本节只记录 T1 已落地的实现细节，不改变第 1–8 节的契约；若与后续任务冲突，以 Lead 决策为准。

### 9.1 共享类型与存储

- `src/types.ts` 导出 `ThemeMode`、`ResolvedTheme`、`AiModel`（`deepseek-flash` / `deepseek-v4-pro`）、`ReasoningEffort`（`off` | `low` | `high` | `max`；UI 文案为“关闭/低/高/最高”，API 层在 `off` 时发送 `thinking: { type: 'disabled' }` 并省略 `reasoning_effort`，不存在 `none` 值）、`SortMode`、`EngineId`、`Settings`、`DEFAULT_SETTINGS`、`SearchResult`、`ChatMessage`、`ChatUsage`、`ChatResult`、`UsageStats`、`ModelUsage`、`AiPhase`、`AiSource`、`ApiErrorView`、toast/modal 状态类型与各枚举常量。
- 两个存储键在 `src/lib/storage.ts` 导出 `STORAGE_KEYS`；settings/usage 直接以 JSON 对象存储（无包装层）。`readJson`/`writeJson`/`removeStorage` 在 localStorage 不可用时静默降级。
- `Settings` 校验规则（`normalizeSettings`，已导出供测试）：未知键丢弃；非法值回退默认；`resultCount` 取整并收敛到 1–50；`apiKey` 去首尾空白；`aiModel` 别名 `deepseek-v4-flash` → `deepseek-flash`。
- `UsageStats`：`searches`/`fetches` 为成功请求次数（失败不计入），`searchBillable`/`fetchBillable` 为成功且非空（计费）次数；`models` 按模型名聚合；`updatedAt` 为 epoch 毫秒。

### 9.2 API 客户端（`src/lib/api.ts`）

- 导出 `API_BASE_URL`、`API_TIMEOUTS`（search 20s / chat 120s / fetch 30s / test 15s）、`ApiError`（re-export `src/lib/errors.ts`）、`isApiError`。
- `searchWeb(key, { query, count, oriQuestion?, signal? })`：请求体仅 `query`/`count`/`need_content:false`（`oriQuestion` 非空时加 `ori_question`），永远不发送 `localization`；返回归一化 `SearchResult[]`（缺失字段补空，`authority` 缺失为 null，无 url 的条目丢弃）。
- `chatCompletion(key, { model, messages, effort, maxTokens?, signal? })`：`maxTokens` 默认 4096；`effort === 'off'` 时 `thinking:{type:'disabled'}` 且无 `reasoning_effort`，否则 `enabled` + `low|high|max`；不发送 `temperature`。返回 `{ content, reasoningContent, usage, model, finishReason }`，usage 已转为 camelCase。
- `fetchPage(key, url, signal?)`、`testApiKey(key)`（GET /models，返回 `{ models, elapsedMs }`）。
- `ApiError` 字段 `status: number | null`、`code`、`type?`、`requestId?`、`context?`；code 归一化顺序 `error.code → error.type → http_<status>`；纯文本响应整体作为 message；网络 `network_error`、超时 `timeout`、解析失败 `invalid_response`；调用方 AbortController 取消时抛原生 `AbortError`（UI 层静默忽略）。`errors.ts` 另导出 `statusSuggestion(status)`、`errorContextTitle(context)`、`formatErrorDetails(error)` 供错误弹窗使用。

### 9.3 单例接口

- `useSettings()`：`{ settings, update(patch), resetAll(), seedDevKey() }`；`update` 立即持久化。
- `useUi()`：`{ ui, apiKeyModal, errorModal, toast, settingsOpen, requireApiKey(action), showError(error, context), closeErrorModal(), openSettings(), closeSettings(), openApiKeyModal(action?), closeApiKeyModal(), saveApiKey(key), showToast(message, kind?), dismissToast() }`。`ui` 是响应式根对象；`settingsOpen` 为可写 computed；`apiKeyModal.open` / `errorModal.{open,title,error}` / `toast.{message,kind,visible}` 可直接绑定。`requireApiKey` 在已有 Key 时同步执行并返回 true，否则缓存动作、打开 Key 弹窗并返回 false；`saveApiKey` 保存后自动执行缓存动作。`showError` 忽略 AbortError，标题由 context 映射。
- `useQueryRoute()`：`{ query, navigate(q), goHome(), syncFromLocation() }`；`navigate` 只写 `pathname + ?q=` 并 pushState，空 q 回到 pathname；`App.vue` 监听 `popstate` 调 `syncFromLocation`。
- `useTheme()`：单例，返回 `{ theme, resolvedTheme, setTheme }`；监听系统主题变化并同步 `<html data-theme>` 与 `theme-color`。`index.html` 内联脚本负责首屏前设置主题。
- `useViewTransition()`：`{ run(update), supported }`；原生 View Transitions 不可用或 reduced-motion 时给 `<html>` 加 `vt-fallback` 类（base.css 中的淡入/位移降级）。
- `useOutsideClick(targets, handler, { enabled? })` 与同文件 `useEscapeKey(handler, { enabled? })`；目标支持单个 Ref/普通元素/数组及 computed。
- `useFocusTrap(container, active, { onEscape?, initialFocus?, restoreFocus? })`：Tab 循环、Esc、关闭归还焦点；BaseModal 已内置。
- `lib/format.ts`：`formatNumber`、`formatScore`、`formatElapsed`、`formatCny`、`formatDate`（YYYY-MM-DD，非法返回 ''）、`formatDateTime`。

### 9.4 组件接口（stub 交接）

以下组件由 T1 创建最小 stub，相应负责人直接替换整个文件，不要修改其他共享文件：

| 组件 | 归属 | T1 stub 行为 | 建议保留的对外接口 |
| --- | --- | --- | --- |
| `search/SearchBar.vue` | T2 | 输入 + 搜索按钮，提交写 q 路由 | props `compact?: boolean`（结果页紧凑样式）、`autofocus?: boolean` |
| `results/ResultsHeader.vue` | T2 | 占位 | 无 props（读取 `useSearch()` 单例） |
| `results/FilterBar.vue` | T2 | 占位 | 无 props |
| `results/ResultsList.vue` | T2 | 占位 | 无 props |
| `ai/AiSidebar.vue` | T3 | 占位 | 无 props（读取 `useAi()` 单例） |
| `settings/SettingsPanel.vue` | T4 | 右侧占位面板，点遮罩/X 关闭 | 无 props（读取 `useUi()` 单例） |
| `settings/ApiKeyModal.vue` | T4 | BaseModal 占位 | 无 props（读取 `useUi()` 单例） |
| `settings/ErrorModal.vue` | T4 | BaseModal 展示 status/code/message | 无 props（读取 `useUi()` 单例） |

- 结果页的自动搜索触发不在 T1：`ResultsView` 只负责布局。T2 的 `useSearch()` 可在单例内部监听 `useQueryRoute().query` 变化自动 `run(q)`，由 T5 在集成阶段补齐。
- 搜索框样式/结构可自由重写；`ResultsView` 仅依赖组件存在与上述 props。
- `SettingsPanel`/`ApiKeyModal`/`ErrorModal` 由 T4 整体替换；T1 stub 不实现焦点陷阱与 Esc，BaseModal 已内置可直接复用。

### 9.5 共享 UI

- `Icon`：`name` 为字符串，内置约 50 个线性图标（search/close/settings/github/sun/moon/monitor/chevron-*/arrow-*/external-link/help-circle/sparkles/copy/check/trash/refresh-cw/rotate-ccw/alert-*/loader/plus/minus/eye/eye-off/filter/calendar/globe/shield/star/message-circle/send/info/link/clock/zap/key/database/sliders/menu 等）；未知名称回退 help-circle。新增图标在 T5 集成时修改 `Icon.vue`。
- `WhaleLogo`：props `size`（高度 px，默认 28）、`title`；官方蓝色虎鲸路径 `#3964FE`。
- `LetterAvatar`：props `name`、`url`、`size`；本地首字母 + 哈希色，作为 `site_icon` 缺失或加载失败时的兜底。
- `Popover`：`v-model:open`、`align`（`start`/`end`）、`offset`、`panelClass`、`dismissOnOutsideClick`、`dismissOnEscape`、`role`；trigger 插槽参数 `{ open, toggle }`，默认插槽参数 `{ close }`。
- `BaseModal`：props `open`、`title`、`subtitle`、`size`（`sm`/`md`/`lg`）、`closeOnOverlay`、`showClose`、`ariaLabel`；emit `close`；插槽 header/default/footer；内置焦点陷阱、Esc、滚动锁定。
- `LoadingDots`：`label`、`size`（`sm`/`md`）。`ToggleSwitch`：`v-model`、`label`、`disabled`。`ToastHost`：读取 `useUi().toast`。
- `layout/TopBar.vue` 与 `layout/FooterDisclaimer.vue` 为最终实现（T5 可微调）。

### 9.6 主题、样式与构建

- 设计令牌在 `styles/tokens.css`（品牌色、明暗主题、间距、字体、圆角、阴影、层级 `--z-*`）；基础重置、通用按钮/输入/chip、`.visually-hidden` 在 `styles/base.css`。
- `vite.config.ts`：`base: './'`、`viteSingleFile()`、`cssCodeSplit: false`、`sourcemap: false`；`mode === 'development'` 时 `loadEnv` 注入 `__DEV_API_KEY__`，其它模式（含生产构建）注入空字符串。
- `index.html` 内联主题脚本 + CSP（self、内联样式/脚本、`https://api.deepseek.com`、开发 HMR ws、`worker-src 'self' blob:`）；不加载外链字体/图片。
- 开发 Key：`App.vue` 挂载后调用 `seedDevKey()`，仅当 settings.apiKey 为空时写入 .env Key 并 toast 提示；生产构建中该常量为空，不会写入。

### 9.7 测试

- `tests/setup.ts`：jsdom `matchMedia` 桩 + 每个用例前清空 localStorage。
- `tests/unit/settings.spec.ts`：设置归一化、范围收敛、模型别名冒烟测试。T2/T3/T4 各自在 `tests/unit/` 增加测试，避免修改 setup 的全局行为。

### 9.8 环境注意（本机 DSH 沙箱）

- 本机沙箱禁止以管道 stdio 启动子进程，标准 `npm run dev` 依赖的 esbuild 服务会 `spawn EPERM`。T1 的首页渲染检查使用进程内转译的等价临时配置完成并已删除，交付配置保持标准 Vite 实现；正常终端与 Cloudflare Pages 不受影响。T5 在本沙箱内执行构建前需由 Lead 确认运行方式。

## 10. 集成备注（T5）

- 搜索编排集中在 `App.vue`：`watch(useQueryRoute().query, immediate)` → 非空时 `ai.reset()` + `search.run(q)`，空 q 时 `search.cancel()` + `search.run('')` + `ai.reset()`；同 q 去重、Key 弹窗与长度校验仍由 `useSearch.run` 内部负责。
- AI 编排集中在 `App.vue`：`watch([search.loading, search.results, settings.aiMode])`，仅在“非加载中 + 已搜索 + 有结果 + AI 开启 + 当前结果对应地址栏 q”时调用 `ai.summarize()`；AI 从开启切到关闭时调用 `ai.abort()`；`summarize` 内部按 query + results 指纹复用摘要。
- 结果页紧凑搜索框移入 `TopBar` 中央（桌面三列、移动端第二行），`ResultsView` 不再渲染搜索框，保证每页只有一个 `view-transition-name: site-search`；首页 hero 搜索框保留并由 `SearchBar` 自己发起 View Transition。`useViewTransition` 在过渡回调内 `await nextTick()`，确保浏览器抓取到 Vue 更新后的新快照。
- 顶栏保持 `position: sticky; top: 0`（滚动时固定在视口顶部且保留文档流占位，内容无需额外 padding）；页脚仍在正常文档流。
- T5 验证（沙箱内使用临时进程内转译配置，验证后删除）：`npm run typecheck` 通过；155 项单元测试全部通过；补充构建产物为单文件 `dist/index.html`（无外链脚本/样式、含 `api.deepseek.com`、`__DEV_API_KEY__` 已替换为空），生产构建首页渲染与无 Key 时 Key 弹窗正常、控制台 0 报错；桌面/移动端布局、顶栏固定、主题、帮助、设置、排序、AI 摘要与开关复用均检查通过。最终标准 `npm run build` 由 Lead 执行。
