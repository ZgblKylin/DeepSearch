# 进度记录

## 2026-10-19 / 第 1 轮：计划与启动

- 输入：用户要求实现 DeepSearch 纯前端搜索站，使用 Agent Team。
- 已完成：核实 Search/Chat/Fetch API、CORS、模型、价格、官方蓝色 Logo、Git 远端、工具链与 npm 缓存限制；完成计划并获得批准。
- 决策：Vue 3 + Vite 7 + TypeScript；单文件构建；非流式 Chat；本地字母头像，不加载第三方 favicon；峰谷按北京时间工作日近似。
- 输出：`docs/PLAN.md`。
- 下一步：创建任务板，启动 fe-core 完成 T1。

## 2026-10-19 / 第 2 轮：T1 完成

- T1 由 fe-core 完成：脚手架、共享契约、API 客户端、settings/ui store、共享 UI、布局、views、8 个功能 stub 与开发 Key 注入。
- 验证：`npm run typecheck` 通过；首页/结果页渲染正常；主题、`?q=` 路由、开发 Key 注入通过。
- 环境问题：DSH 沙箱禁止管道 stdio 子进程，标准 Vitest/Vite 启动会 `spawn EPERM`。Lead 已用一次 `danger-full-access` 运行标准测试与构建。
- 构建：`npm run build` 成功，`dist/index.html` 333 KB，单文件、无外链脚本/样式、未包含 `.env` Key。
- 决策：T2/T3/T4 并行；功能团队只跑 typecheck，最终测试/构建由 Lead 或 QA 用标准命令执行。

## 2026-10-19 / 第 3 轮：T3、T4 完成

- T3（fe-ai）：AI 上下文、Markdown 清洗、useAi 状态机、AI 侧边栏/摘要/标签/追问 UI；typecheck 通过。
- T4（fe-settings）：峰谷定价、usage reducer/store、设置面板、Key/错误弹窗、统计与清空；typecheck 通过；自查修复清空数据后 Key 回写 bug。
- 标准 Vitest 已由 Lead 执行：10 个测试文件、154 项通过（含 T2/T3/T4 测试）。
- 待完成：T2 搜索体验；随后 T5 集成；T6 QA。

## 2026-10-19 / 第 4 轮：T2、T5 完成

- T2（fe-search）：查询解析/序列化、排序、外部引擎、useSearch、搜索框/帮助、筛选栏、结果列表与状态组件；typecheck 通过。
- T5（fe-core）：App 路由→搜索→AI 摘要编排；结果页搜索框移入固定顶栏居中；ResultsView 去除重复搜索框；View Transition 等待 nextTick；开发 Key 提前注入。
- 验证：`npm run test:run` 155/155 通过；`npm run build` 成功，dist/index.html 334.87 KB，单文件、无外链、无 Key。
- 已知待 QA 验证/修复：AI 关闭时结果区仍保留右侧空列；无 Key 关闭弹窗后结果区可能长时间骨架；移动端 ≤480 搜索框辅助按钮换行；设置面板无 Tab 焦点陷阱。
- 下一步：QA T6 独立验收与审查。

## 2026-10-19 / 第 5 轮：T6 独立验收

- QA 完成真实 API E2E：Key 流程、401 字段、搜索、排序、筛选、URL/历史、AI 摘要与追问、设置、统计、清空、主题、响应式与 View Transition；新增 17 项集成测试，全套 172 项通过。
- 结论：P0/P1 = 0；4 项 P2、5 项 P3、2 项结构性建议。详情见 `docs/qa/REPORT.md`。
- 费用约 0.14 元；未发现 Key 泄漏、XSS、计费错误或第三方请求。

## 2026-10-19 / 第 6 轮：T7 修复

- fe-search：新增 `awaitingKey` 与 `KeyRequiredState`，无 Key 关闭弹窗后显示可操作状态；同 q 失败可重试。
- fe-core：BaseModal `initialFocus`；生产 CSP 移除 dev ws；AI 关闭时结果列单列占满；顶栏搜索框居中；移动端 toast 底部；`formatCny` 浮点舍入（0.065→¥0.07）。
- fe-settings：Key 输入包进 form；设置面板焦点陷阱与滚动锁定；ApiKeyModal 指定初始焦点。
- 验证：`npm run test:run` 191/191 通过；`npm run build` 成功；`verify:singlefile` 8/8 通过。

## 2026-10-19 / 第 7 轮：T8 复验与 T9 收尾

- T8 结论：P0/P1/P2 全部清零；P3 仅剩可选的跨标签页设置同步。详情见 `docs/qa/RECHECK.md`。
- Lead 已执行标准 `npm run check`：typecheck 通过、15 个测试文件 191 项通过、build 成功、单文件校验 8/8 通过。
- 最终 `dist/index.html` 338,601 字节；生产 CSP 无 dev ws；无 Key；无外链资源。
- 输出：`README.md`、`docs/SUMMARY.md`；已完成暂存，未执行 git commit。

## 2026-10-20 / 第 8 轮：结果图标改用 site_icon

- 用户反馈：结果标题前的图标应优先使用 API 返回的 `site_icon`，缺失时才使用字母头像。
- 已完成：`ResultCard` 渲染 `site_icon`（http/https，lazy、no-referrer、加载失败回退）；`LetterAvatar` 改为兜底；CSP `img-src` 允许 HTTPS 图片；README/PLAN/SUMMARY 同步隐私与限制说明。
- 验证：typecheck 通过；新增 4 项 ResultCard 测试，全套 195/195 通过；build 成功，dist 339,243 字节；真实浏览器确认结果标题前图标来自 `https://cdn.deepseek.com/site-icons/...` 且正常加载，缺失/加载失败由单元测试覆盖回退。截图：`docs/qa/screenshots/qa-site-icon-results.png`。

## 2026-10-20 / 第 9 轮：AI 摘要改为 AI 对话

- 用户反馈：侧边栏标题改为“AI 对话”，初始摘要作为对话第一条消息并直接显示输入框；取消侧边栏的单独“AI 追问”按钮；每条搜索结果显示“AI 追问”，点击后重置对话、Fetch 该网页并生成第一条回答。
- 已完成：`useAi` 增加 `startFromResult`，初始摘要写入 `messages` 并支持直接追问；`AiSidebar` 标题/加载/错误/对话线程重构；`AiChat` 移除重复头部，首条消息带标签，输入框常驻；`AiTags`/`AiSummary` 去除追问按钮；`ResultCard` 相关度旁新增“AI 追问”；初始摘要追问使用独立问答系统提示。
- 验证：typecheck 通过；新增 4 项 AiChat 测试、扩展 ResultCard 测试，全套 199/199 通过；build 成功，dist 339,437 字节；真实浏览器验证“AI 对话”标题、首条摘要 + 标签 + 输入框、直接追问、单结果 Fetch 追问、AI 关闭后点击结果按钮自动开启并生成新会话；截图：`docs/qa/screenshots/qa-ai-chat-initial.png`、`qa-ai-chat-result.png`。

## 2026-10-20 / 第 10 轮：放大 AI 面板并调整免责声明

- 用户反馈：AI 对话栏尺寸应更大，高度默认填满；免责声明不要单独占一行，放到标题栏右侧。
- 已完成：桌面侧边栏宽度 380px → 440px；卡片高度填满顶栏以下的可用视口，消息线程自适应剩余高度，输入框固定底部；移动端保持自适应高度；标题栏右侧显示“AI 生成，仅供参考”，移除正文底部单独一行。
- 验证：`npm run check` 通过（199/199，build 339,970 字节，单文件校验 8/8）；真实浏览器 1280×720 实测侧边栏 440×624、输入框可见；375×812 无横向溢出，免责声明仍在标题栏内。截图：`docs/qa/screenshots/qa-ai-panel-large.png`。

## 2026-10-20 / 第 11 轮：构建输出改为 docs，支持 GitHub Pages

- 用户要求：构建输出路径改为 `docs`，从 `.gitignore` 中移除 `dist/`，其他忽略项仍由 `.gitignore` 管理，以 GitHub Pages 的 `/docs` 作为部署目录。
- 已完成：Vite `build.outDir` 改为 `docs` 且 `emptyOutDir: false`，避免清空已有项目文档与 QA 截图；`verify-singlefile.mjs` 改为校验 `docs/index.html`、禁止独立 `assets` 目录；新增 `docs/.nojekyll`；README 更新 GitHub Pages 与 Cloudflare Pages 输出目录；`.gitignore` 保留 `.env`、`node_modules/`、缓存等规则并移除 `dist/`。
- 验证：`npm run build` 生成 `docs/index.html` 340,023 字节，项目文档与截图保留；`npm run verify:singlefile` 9/9 通过；GitHub Pages 入口为 `main` 分支 `/docs` 目录。

## 2026-10-20 / 第 12 轮：搜索输入历史

- 用户要求：搜索输入框自动记忆历史输入，并询问是否浏览器原生支持即可。
- 判断：SPA 使用 `@submit.prevent`，浏览器表单历史不会稳定保存；改用浏览器原生 `datalist` 展示本地历史，不引入自绘下拉组件。
- 已完成：新增 `src/lib/searchHistory.ts` 与 `deepsearch.history.v1` 存储键；SearchBar 提交合法查询后记录最近 10 条，输入框绑定 `list` 与 `autocomplete="on"`；清空数据时同时删除历史；README/PLAN 补充说明。
- 验证：typecheck 通过；新增 5 项搜索历史测试，全套 204/204 通过；build 成功，`docs/index.html` 340,787 字节；单文件校验 9/9；生产预览中提交查询后 localStorage 与 datalist 选项均正确写入。

## 2026-10-20 / 第 13 轮：恢复标准 dist 并使用 GitHub Actions 部署

- 用户要求：构建目录恢复为标准 `dist`，恢复 `.gitignore` 的 `dist/` 规则，改由 GitHub Actions 编译并部署 GitHub Pages。
- 已完成：Vite `build.outDir` 改回 `dist` 并恢复默认清空行为；`verify-singlefile.mjs` 改回校验 `dist/` 且只允许 `index.html`；`.gitignore` 恢复 `dist/`；新增 `.github/workflows/pages.yml`（`npm ci` → `npm run check` → 上传 `dist` → Pages 部署）；移除已跟踪的 `docs/index.html` 与 `docs/.nojekyll`；README、PLAN、SUMMARY 同步部署方式。
- Actions 运行环境：五个官方 Action 均升级到 Node 24 兼容版本（`checkout@v7`、`setup-node@v7`、`configure-pages@v6`、`upload-pages-artifact@v5`、`deploy-pages@v5`），消除 Node.js 20 弃用警告；两个 job 的 runner 固定为 `ubuntu-24.04`，避免 `ubuntu-latest` 迁移到 Ubuntu 26 的提示。
- 验证：typecheck 通过；全套 204/204 通过；build 成功，`dist/index.html` 340,787 字节；单文件校验 8/8；`docs/` 仅保留项目文档与 QA 目录；workflow 待推送后由 GitHub 首次运行验证。

## 2026-10-20 / 第 14 轮：修复 CodeQL URL 子串告警

- GitHub code scanning 告警 #1：`js/incomplete-url-substring-sanitization`，位置为 `scripts/verify-singlefile.mjs` 对 `api.deepseek.com` 的整段 HTML 子串判断。
- 已完成：新增 URL 提取与 `new URL(...).hostname === 'api.deepseek.com'` 的精确 host 校验，替换原来的 `html.includes('api.deepseek.com')`；不改变单文件校验的其他断言。
- 验证：`node --check` 通过；`npm run verify:singlefile` 8/8 通过；待下一次 CodeQL 扫描确认告警关闭。
