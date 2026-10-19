# DeepSearch 项目总结

## 1. 完成情况

DeepSearch 纯前端搜索站已完成。站点使用 Vue 3 + Vite + TypeScript，构建产物为单个 `docs/index.html`；浏览器直接调用 DeepSeek Search、Chat Completions 与 Fetch API，不依赖服务端、数据库或构建时密钥。

已交付：

- 固定顶栏、品牌与官方蓝色虎鲸标识、主题三态、GitHub 与设置入口。
- 首页居中搜索框；进入结果页时通过 View Transitions 移动到顶栏居中，结果区使用骨架与三点加载动画。
- `?q=` 查询串路由，支持刷新、前进、后退与分享链接。
- 搜索语法解析与可视化筛选：站点、排除站点、精确短语、排除关键词、语言、日期；搜索框用原生 datalist 记忆最近 10 条提交词。- 默认按 `rerank_score` 降序；支持按最新日期排序。
- AI 模式默认开启：自动生成“AI 对话”首条摘要、优质/权威标签、`[n]` 引用；摘要生成后可直接多轮追问，每条结果还提供基于该网页正文的 Fetch 追问。
- Key 输入弹窗、401/402/429/5xx 错误弹窗、测试连接、模型与思考挡位、条数、排序、外部搜索引擎配置。
- 本机统计搜索/抓取次数、Token 消耗与按峰谷价估算的 API 费用；支持清零与清空全部数据。
- 帮助浮窗、README、计划/进度/QA 文档与测试套件。

## 2. 最终验证证据

2026-10-20 由 Lead 执行标准命令：

```text
npm run check
- vue-tsc --noEmit：通过
- Vitest：18 个测试文件、204 项全部通过
- vite build：成功，docs/index.html 340,787 字节
- verify:singlefile：8 项断言全部通过
```

`scripts/verify-singlefile.mjs` 确认：`docs/index.html` 存在且没有独立 `assets` 目录；无外链脚本/样式；含 `api.deepseek.com`；不含 `.env` 中的真实 Key 与 `sk-` 形式 Key；体积小于 2 MB。生产 CSP 的 `connect-src` 为 `'self' https://api.deepseek.com`，不包含开发 HMR 的 `ws://localhost`。`docs/.nojekyll` 用于 GitHub Pages 跳过 Jekyll。

QA 在 `docs/qa/REPORT.md` 与 `docs/qa/RECHECK.md` 中记录了真实 API E2E：Key 弹窗、401 错误字段、真实搜索、相关度/最新排序、筛选与 URL/历史、AI 摘要与 `[n]` 引用、Fetch 追问、设置与统计、清空数据、主题、响应式、View Transition。最终结论为 P0/P1/P2 全部清零；T6 与 T8 合计消耗约 0.16 元真实 API 费用。

## 3. 关键实现决策

- **纯前端直连**：Search、Chat、Fetch 均直接请求 `https://api.deepseek.com`；已核实该服务反射任意 Origin 的 CORS。若上游改变策略，纯前端方案需要代理。
- **单 HTML**：`vite-plugin-singlefile` 内联 JS、CSS、站点图标与 favicon；界面不加载第三方字体。搜索结果标题前的图标优先使用 API 的 `site_icon`，缺失或加载失败时回退为本地字母头像。
- **Key 注入边界**：`.env` 的 `DEEPSEEK_API_KEY` 只在开发模式注入 `__DEV_API_KEY__`，且仅当 localStorage 无 Key 时写入；生产构建注入空字符串，产物不含 Key。
- **AI 请求**：非流式 Chat，`max_tokens` 4096；首条摘要取前 8 条结果，单结果追问取该条网页正文；上下文有单条与总量截断；历史只回传 `content`。
- **计费**：价格集中在 `src/lib/pricing.ts`；峰谷按北京时间工作日近似，忽略法定节假日；Search/Fetch 仅成功且非空计费。
- **隐私**：无广告、无统计、无 Cookie、无第三方请求；AI Markdown 经 DOMPurify 清洗，禁止图片/iframe/表单，链接强制 http(s) 与 `noopener noreferrer`。

## 4. 遗留问题与技术债

- P3-6：设置未监听跨标签页 `storage` 事件；多标签页修改不同步。属于可选体验项。
- `FilterBar.vue` 约 706 行，6 组筛选编辑器存在重复模板；可改为按 editor 类型驱动渲染。
- `useSearch` / `useAi` 的请求序号、AbortController 与会话指纹为模块级可变状态；当前由测试与 E2E 覆盖，后续可收敛为显式状态机。
- 未实现流式输出与分页；单结果 AI 追问固定读取该条网页正文；峰谷费用未处理法定节假日。
- 依赖 DeepSeek API 的 CORS 与客户端额度；Key 明文存于 localStorage，共享浏览器需谨慎。

## 5. 经验

- 纯前端调用第三方 API 前应先验证 CORS、错误格式与计费口径，避免在 UI 完成后才发现不可行。
- 单文件构建应把“唯一产物、无外链、无密钥”做成可执行校验，而不是依赖人工检查。
- AI 摘要与追问应明确上下文条数、截断与 `max_tokens`，否则高思考挡位容易放大费用。
- 本机 DSH 沙箱禁止管道 stdio 子进程，Vitest/Vite 需在完整权限下运行；该限制不影响 Cloudflare Pages 等正常构建环境。
- Agent Team 并行开发时，先固定共享类型、API 契约与写作用域，再让功能团队替换 stub，可显著减少集成冲突。
