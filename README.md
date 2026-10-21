# DeepSearch

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

DeepSearch 是一个纯前端搜索站：浏览器直接调用 DeepSeek Search API 获取网页结果，调用 Chat Completions API 生成侧边栏摘要与追问会话，调用 Fetch API 读取网页正文。项目没有后端、没有数据库、没有服务端渲染，构建产物是一个可以单独部署的 `dist/index.html`。

在 [GitHub Pages](https://zgblkylin.github.io/DeepSearch/) 试用。

项目特点：

- Vue 3 + Vite + TypeScript，构建为单 HTML，适合 Cloudflare Pages、GitHub Pages、对象存储等静态托管。
- 搜索请求完全省略 `localization` 字段，不启用本地化搜索。
- API Key 只保存在浏览器 localStorage；未配置时任何 API 操作都会先弹出 Key 输入弹窗。
- 默认按 `rerank_score` 降序排列，可切换为按发布时间排序。
- 搜索结果顶部提供站点、语言、日期、精确短语、排除词等搜索语法筛选项。
- 搜索框使用浏览器原生 datalist 记忆最近 10 条提交的搜索词，可直接选择历史输入。
- AI 模式默认开启，在结果页右侧生成摘要并直接进入可追问的对话；每条结果也可单独发起基于网页正文的 AI 追问。模型与思考挡位可配置。
- 主题支持浅色、深色与跟随系统；全站无广告、无统计脚本、无第三方字体请求。
- 本机统计搜索次数、抓取次数、Token 消耗与按峰谷价估算的 API 费用。

## 技术栈

| 层 | 选择 |
| --- | --- |
| 框架 | Vue 3.5 |
| 构建 | Vite 7 + `vite-plugin-singlefile` |
| 语言 | TypeScript 5.9 |
| Markdown | `marked` + `dompurify` |
| 测试 | Vitest 5 + jsdom + `@vue/test-utils` |

## 快速开始

要求 Node.js `>=22.12.0` 与 npm。

```bash
npm install
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY
npm run dev
```

打开 `http://localhost:5173/`。

如果 npm 在本机因缓存目录权限失败，可以把缓存放到项目内：

```bash
npm install --cache .npm-cache
```

### 本地 Key 注入

`.env` 中的 `DEEPSEEK_API_KEY` 只在 Vite 开发模式下通过 `__DEV_API_KEY__` 注入。应用启动时，如果 localStorage 里没有 Key，会把该值写入作为初始 Key，方便本地验证；如果已经保存过 Key，则不会覆盖。

生产构建不会注入 `.env` 中的 Key，`dist/index.html` 不包含真实 Key。`npm run verify:singlefile` 会检查这一点。

## 构建与部署

```bash
npm run build
```

构建完成后，入口文件是 `dist/index.html`，JavaScript、CSS、图标、favicon 全部内联。`dist/` 是被忽略的构建目录，只包含这一个文件；可以直接打开，也可以使用：

```bash
npm run preview
```

### GitHub Pages

本项目使用 GitHub Actions 自动构建并部署 Pages，不需要提交构建产物。

1. 在仓库 Settings → Pages → Build and deployment 中，把 Source 设为 **GitHub Actions**。
2. 推送到 `main` 分支，workflow（`.github/workflows/pages.yml`）会自动执行 `npm ci`、`npm run check`，并上传 `dist/`。
3. 也可以在 Actions 页面手动运行 `Deploy GitHub Pages` 的 `workflow_dispatch`。

workflow 失败时不会部署，线上保持上一次成功版本。发布地址由 `deploy` job 的 `page_url` 输出提供；项目使用相对路径与单文件内联资源，不需要配置 `base` 或重写规则。

### Cloudflare Pages

- 构建命令：`npm ci && npm run build`
- 输出目录：`dist`
- Node 版本：`22.12.0` 或更高
- 不需要任何环境变量；站点运行时由用户在浏览器里配置自己的 DeepSeek API Key
- 路由使用当前 pathname 加 `?q=`，不需要 SPA 重写规则

### 提交注意事项

`.gitignore` 管理 `.env`、`node_modules/`、`.npm-cache/`、`coverage` 与构建产物 `dist/`；`docs/` 只保存项目文档与 QA 报告，不再作为构建目录。提交前请检查 `git status`，不要加入 `.env`、依赖、缓存或 `dist/` 文件。

由于页面请求直接发往 `https://api.deepseek.com`，部署域名必须被 DeepSeek API 的 CORS 策略接受。当前 API 会反射请求 Origin；如果上游未来收紧 CORS，纯前端方案需要改为自建代理。

## 搜索与筛选

搜索框支持 DeepSeek 搜索语法，筛选项栏会把语法写回 `q` 并立即重新搜索。

| 语法 | 说明 |
| --- | --- |
| `site:example.com` | 限定站点；多个站点写为 `site:a.com OR site:b.com` |
| `-site:example.com` | 排除站点 |
| `"exact phrase"` | 精确短语 |
| `-word` / `-"exact phrase"` | 排除关键词或短语 |
| `lang:zh,en` | 限定语言 |
| `after:2025-01-01` | 限定起始日期，也接受 `after:2025` |
| `before:2025-12-31` | 限定结束日期，也接受 `before:2025` |

筛选项会从 `q` 解析；直接输入语法后提交，筛选项会同步更新。查询超过 128 个 Unicode 字符时不会发起请求。

搜索页地址形如：

```text
https://your-site.example/?q=DeepSeek+site%3Agithub.com
```

刷新、前进、后退与分享链接都会恢复 `q` 并重新搜索。

## AI 模式

AI 模式默认开启，状态保存在 localStorage。搜索成功且结果非空后，侧边栏自动生成摘要：

- 使用按 `rerank_score` 排序的前 8 条结果的标题、URL、站点、日期、摘要构造上下文，单条与总量都有截断。
- 使用配置的模型与思考挡位，默认 `deepseek-flash` 与 `high`；非流式请求，`max_tokens` 为 4096。
- 摘要中的 `[n]` 会映射到来源 URL，Markdown 经 DOMPurify 清洗，禁止图片、iframe、表单等标签。
- 摘要作为 AI 对话线程的第一条助手消息，其下方标签行显示“优质 N”（`rerank_score >= 1.5`）与“权威 N”（`authority >= 3`）；不再提供单独的“AI 追问”按钮。
- 桌面侧边栏宽度 440px，高度填满顶栏以下的可用视口；消息线程滚动，输入框固定在底部。“AI 生成，仅供参考”显示在标题栏右侧。
- 摘要生成后输入框立即可用，可基于同一批搜索结果继续多轮问答。
- 每条搜索结果的标题区域（相关度旁）提供“AI 追问”按钮。点击后会重置侧边栏对话，调用 Fetch API 读取该网页正文，生成新的第一条助手消息，之后可继续追问；网页正文读取失败时，用该结果的搜索摘要补位并提示。

模型、思考挡位与返回条数在设置面板修改；排序会立即重排已有结果，不会重新请求；修改条数后下一次搜索生效。

## API 与计费

调用端点：

| API | 端点 |
| --- | --- |
| Search | `POST https://api.deepseek.com/v1/tools/search` |
| Chat | `POST https://api.deepseek.com/chat/completions` |
| Fetch | `POST https://api.deepseek.com/v1/tools/fetch` |
| 测试连接 | `GET https://api.deepseek.com/models` |

计费规则硬编码在 `src/lib/pricing.ts`，按 2026-10 官方价格整理：

| 模型 | 缓存命中输入（高峰/空闲） | 缓存未命中输入（高峰/空闲） | 输出（高峰/空闲） |
| --- | --- | --- | --- |
| `deepseek-flash` | 0.04 / 0.02 | 2 / 1 | 8 / 4 |
| `deepseek-v4-pro` | 0.30 / 0.15 | 9 / 4.5 | 27 / 13.5 |
| `deepseek-v4-flash` | 同 `deepseek-flash` | 同 `deepseek-flash` | 同 `deepseek-flash` |

单位：元/百万 tokens。

- Search 与 Fetch 均为每 1000 次成功请求 5 元，即每次 0.005 元；失败或空结果不计费。
- 高峰时段按北京时间周一至周五 9:00–12:00、14:00–18:00 近似判断；法定节假日未单独处理。
- 本机统计的 Token 总量为命中输入、未命中输入与 completion tokens 之和；completion 中包含 reasoning tokens。
- 费用是按上述价格计算的预估值，实际以 DeepSeek 平台账单为准。

设置面板可查看模型维度的 Token 与峰谷费用明细，也可以清零用量或清空全部本机数据。

## 本机数据与隐私

localStorage 使用三个键：

| 键 | 内容 |
| --- | --- |
| `deepsearch.settings.v1` | API Key、模型、思考挡位、条数、排序、外部引擎、AI 模式、主题 |
| `deepsearch.usage.v1` | 搜索/抓取次数、按模型聚合的 Token 与费用 |
| `deepsearch.history.v1` | 最近 10 条主动提交的搜索词，用于输入框原生 datalist 建议 |

隐私设计：

- 没有服务端，没有广告，没有统计脚本，没有 Cookie。
- 搜索结果标题前的站点图标使用 Search API 返回的 `site_icon`；该字段缺失、协议非法或图片加载失败时，回退为本地字母头像。
- 除 `site_icon` 图片外，不加载第三方字体或图片；`site_icon` 通常由 DeepSeek CDN 提供，并以 `no-referrer` 请求。
- 除搜索结果图标与用户主动点击外部结果、外部搜索引擎或 GitHub 外，浏览器不会主动访问其它站点。
- API 请求只发往 `https://api.deepseek.com`；CSP 把连接来源限制在该域名，图片只允许 self、data 与 HTTPS。
- AI Markdown 经 DOMPurify 清洗；链接只允许 http/https，并带 `noopener noreferrer`。

API Key 以明文保存在 localStorage，任何能执行本页脚本的代码都可能读取它。请勿在共享浏览器中保存 Key；如怀疑泄露，请到 DeepSeek 开放平台轮换。

## 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 类型检查并构建单文件到 `dist/` |
| `npm run preview` | 预览生产构建 |
| `npm run typecheck` | Vue/TypeScript 类型检查 |
| `npm run test:run` | 运行全部单元与集成测试 |
| `npm run verify:singlefile` | 校验 `dist/index.html` 与 Key 泄漏 |
| `npm run check` | 依次执行 typecheck、测试、构建、单文件校验 |

`npm run check` 是最终验收命令。测试覆盖查询语法、排序、费用、统计、错误归一化、Markdown 清洗、设置与弹窗、筛选与帮助等；`docs/qa/REPORT.md` 记录真实 API E2E 与代码审查结论。

## 目录

```text
src/
  App.vue                 路由视图、搜索与 AI 编排
  components/             布局、共享 UI、搜索、结果、AI、设置
  composables/            路由、搜索、AI、主题、View Transition
  lib/                    API 客户端、查询解析、排序、费用、Markdown、存储
  stores/                 settings / usage / ui 单例
  types.ts                共享类型与默认值
scripts/verify-singlefile.mjs
tests/                    unit / integration
docs/                     计划、进度、总结与 QA 报告
.github/workflows/pages.yml  GitHub Pages 构建与部署
```

## 已知限制

- Chat 使用非流式请求，摘要与回答生成期间以三点加载动画呈现。
- Search API 不提供分页；结果数量由“每次返回条数”控制，范围为 1–50。
- AI 摘要、单结果追问与多轮对话会产生 Token 费用；长对话或高思考挡位会增加消耗。
- 峰谷判断未处理中国法定节假日，费用为预估值。
- 纯前端直连依赖 DeepSeek API 的 CORS；若上游调整策略，需要代理。
- `localStorage` 不可用时，设置、统计与搜索历史只在当前页面会话内有效。
- `site_icon` 由 API 返回，图片可能因网络、CSP 或第三方资源策略加载失败；失败时回退为本地字母头像。
- View Transitions 在部分浏览器不支持，搜索框会改用淡入/位移动画。
- 本项目的 AI 摘要与搜索结果仅供参考，不构成任何专业建议。

## 免责声明

DeepSearch 是非官方项目，不代表杭州深度求索人工智能基础技术研究有限公司（DeepSeek）。DeepSeek、深度求索及相关标识归其权利人所有；本项目仅使用官方蓝色虎鲸标识用于项目识别。搜索内容与 AI 生成内容由 DeepSeek API 提供，仅供参考。

本项目以 Unlicense 发布，可自由使用、修改与分发；不提供任何担保。
