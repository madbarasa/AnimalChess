# Ralph 进度日志

> 每轮 worker **结束前必须**在这里追加一节。下一轮靠它知道从哪继续。

## 基线（准备阶段）

- 2026-10-23：完成 `CODE_REVIEW.md`（全项目审查报告）。
- 2026-10-23：建立 `.ralph/TASKS.md`（任务清单 + 铁律）与 `.ralph/verify.mjs`（验收门槛）。
- 基线 commit：见 `git log --oneline -3`，起点为 `docs: add code review report`。
- **下一轮从 P1-1 开始。**

## 轮次记录

<!-- 模板：
### 第 N 轮 — YYYY-MM-DD HH:mm
- 完成：P1-1（commit abc1234）、P1-2（commit def5678）
- 验证：`node .ralph/verify.mjs` MUST 全绿
- 遗留：P1-3 因 XXX 未完成，原因……
- 下一轮从：P1-3 开始
-->

### 第 1 轮 — 2026-10-23 10:20
- 完成：
  - P1-1（commit `e762be2`）`inOwnTrap` → `targetInOwnTrap`，补语义注释
  - P1-2（commit `1cbf737`）`ai_exitSbe` 陷阱防御红蓝对称（红子陷蓝方陷阱且蓝方走棋 → +1000）
  - P1-4（commit `2ef2548`）`ai_sbe` / `ai_exitSbe` 兽穴占用判定区分归属（只认敌子占穴）
- 验证：每项提交前 `.\.ralph\verify.cmd` MUST 全绿（AI 开局 1.5s 返回合法走法）
- 注意：
  - `verify.cmd` 结束时 stderr 会有一行 GBK 乱码（`'��机' is not recognized`），退出码仍为 0，属脚本中文注释在 cmd 下的编码噪音，不影响验收；如后续嫌吵可把注释改英文。
  - 规则细节确认：`checkEat` 中「目标格是我方陷阱」按现有实现语义成立（陷阱属于进攻方 → 防守方等级视为 0），P1-1 仅改名未改逻辑。
  - CODE_REVIEW 的 P0-2（RESET 时在途 AI 回包污染新棋局）不在 TASKS 清单内，尚未修；建议在 P1-6 改终局判定时一并加 `gameId` 丢弃旧回包 + `init()` 重置 `isThinking`。
- 下一轮从：**P1-3**（超时不再污染搜索值：中断标志 + 迭代加深回滚到上一层完整结果）开始；同轮可继续 P1-5、P1-6。

### 第 2 轮 — 2026-10-23 10:06
- 完成：
  - P1-3（commit `1a8e63c`）超时中断改为返回 `null` 冒泡：父节点整条分支作废、迭代加深丢弃不完整层、一层都没跑完时用 `pickFallbackDecision` 给合法兜底走法；`verify.mjs` 新增 3 条 MUST 回归（maxTime=0 仍返回合法走法）
  - P1-5（commit `2c9a661`）`isTimeUp` / `bestDecisionGlobal` 全部收进 `createSearchContext(maxTime)`，`alphaBetaPruning(ctx, ...)` 不再读写 Worker 顶层全局
  - P1-6（commit `affb507`）终局补全：吃光对方棋子判负、轮走方无合法走法判和（复用胜利遮罩，标题 DRAW + 日志 + 回合显示「和棋」）；同时修 CODE_REVIEW P0-2 重置竞态（`gameId` 递增 + AI 回包带 `requestId`，旧回包丢弃；`init()` 重置 `isThinking`）
- 验证：每项提交前 `.\.ralph\verify.cmd` MUST 全绿；本轮新增 MUST 段：`P1-3` 3 条、`P1-6` 4 条（vm 无头加载 `game.js` 测 `Game.prototype` 纯逻辑，不碰真实 DOM）
- 注意：
  - `TASKS.md` 的 P1 六项已全部勾选（含第 1 轮完成项）。
  - P1-6 的和棋规则：按 TASKS 要求「无合法走法判和」，没有按某些地区规则判负。
  - `drawGame()` 复用 `#victory-overlay`，标题文案 `DRAW`、颜色金色；若后续要独立和棋遮罩再拆。
  - P1-5 后 Worker 顶层只剩函数与 `onmessage`，无跨次搜索共享状态。
- 下一轮从：**P2-1**（抽 `rules.js` 唯一规则源）开始。高风险项，必须先给 `verify.mjs` 补规则断言再动；注意保持「双击 index.html 可玩」（普通 `<script>` + Worker `importScripts` 或内联注入，禁止构建步骤）。

### 第 3 轮 — 2026-10-23 10:06
- 完成：
  - P2-1（commit `78a854c`）唯一规则源 `rules.js`：`canEat` / `canMove` / `getLegalMovesFrom` / `getAllLegalMoves` 纯函数，棋盘约定为列优先 `board[x][y]`、颜色 `0=蓝 / 1=红`；主线程 `Game.canMove` / `getAllValidMoves` 全部委托，删除 `checkEat`；Worker Blob 前缀注入 `AnimalChessRules.source`（同一工厂函数 `Function#toString` 序列化），Worker 内不再有第二套规则。
    - 顺带修复一个潜伏 bug：旧 `getAllValidMoves` 的狮虎跳河候选只有 `[3,0]/[0,4]`（行 3、列 4），方向/距离写反；规则化后按 3/4 双向覆盖，`hasLegalMoves` 的「无子可动判和」更准确。
  - P2-2（commit `96263ea`）AI 引擎移出模板字符串，独立为 `ai-worker.js`：页面只加载工厂，`game.js` 用 `AnimalChessAiEngine.toString()` + 规则源码拼 Worker Blob；不引入 fetch / 构建步骤，双击 `index.html` 仍可玩。`ai-worker.js` 在 `importScripts` 环境（先加载 `rules.js`）也会自动启动。
- 验证：每项提交前 `.\.ralph\verify.cmd` MUST 全绿。新增 MUST：
  - 规则断言 18 条（鼠象、陷阱、水陆限制、进河、狮虎跨河/阻挡/落水、兽穴、开局 22/22 步）
  - `game.js` 无 `canEat` / `checkEat`、`index.html` 先 rules.js 后 game.js
  - 主线程 `canMove` 与 `rules.canMove` 开局全坐标逐一比对一致
  - AI 返回走法必须通过 `rules.canMove`
  - P2-2：`ai-worker.js` 存在、`game.js` 无 `workerCode` 模板、页面/Worker 两种加载方式均可启动
- 注意：
  - `verify.mjs` 现在按真实加载顺序在 vm 沙箱中模拟页面（rules.js → ai-worker.js）与 Worker（规则源码 + 引擎工厂），与 `game.js` 的 Blob 拼装一致。
  - 规则坐标是列优先；主线程用 `getAiCompatibleMap(board)` 转换，AI 直接使用同一结构。
  - 工作树出现两个**非本任务**未跟踪文件（`asar-list.cjs`、`pi-ai-README.zh.md`，疑似环境/其他进程产生），未提交、勿删。
- 下一轮从：**P2-3**（拆分 `Game`：至少分出渲染与规则职责，`game.js` 仍为入口）开始；随后 P2-4 配置分离。

### 第 4 轮 — 2026-10-23 10:32
- 完成：
  - P2-3 + P2-4（同一 commit `fd2549c`，两项改动互相依赖，合在一次提交）：
    - 新增 `renderer.js`：`AnimalChessRenderer` 类只负责 canvas 绘制（网格/河道/陷阱/兽穴/棋子/选中圈），持有 pulse/needsRedraw/画布尺寸；`Game` 只调用 `renderer.draw(board, selected)`。
    - 新增 `game-state.js`：`AnimalChessGameState` 持有 board/turn/selected/gameOver/startTime，负责开局摆子、`getAiCompatibleMap`、`canMove`/`getAllValidMoves`（全部委托 `rules.js`）、`applyMove`（返回 `{captured,winner?,draw?}`）与终局判定；不碰 DOM/canvas。
    - `game.js` 从 527 行缩到约 330 行，只剩编排：DOM 事件、UI 文案、日志、AI Worker、动画循环，仍是页面入口（`DOMContentLoaded → new Game()`）。
    - 新增 `config.js`：`AnimalChessConfig = { VERSION, BOARD, RULES, UI_TEXT }`，`RULES` 收纳 rivers/traps/dens/pst/pieces/startPositions，`UI_TEXT` 独立文案对象；删除 `game.js` 内联 CONFIG。
    - `index.html` 加载顺序：`config.js → rules.js → ai-worker.js → renderer.js → game-state.js → game.js`，仍是普通 `<script>`，双击可玩、零构建。
  - `verify.mjs` 新增 MUST：
    - P2-3 共 9 条：文件存在、脚本顺序、`game.js` 无 canvas 绘制、仍是入口、类暴露、GameState 开局 16 子/红先、Renderer 用假 ctx 无 DOM 绘制冒烟（fillRect/strokeRect/arc/fillText 均有调用）、画布尺寸、GameState.canMove 全坐标与 rules 一致。
    - P2-4 共 8 条：config.js 位置、VERSION/BOARD/RULES/UI_TEXT 结构、规则数据独立、UI 文案独立、迁移后 rivers/traps/dens 数据与基线逐一相等、开局摆子各 8、game.js 无规则字面量、game.js 消费 AnimalChessConfig。
    - 原 P1-6/P2-1 无头测试改为加载 `config.js + rules.js + game-state.js + game.js`，`makeHeadlessGame` 显式清空默认棋盘。
- 验证：`.\.ralph\verify.cmd` MUST 全绿、退出码 0（含 AI 开局走法 1.5s 与规则基线 22/22）。
- 注意：
  - 提交信息同时含 P2-3 与 P2-4；`PROGRESS`/`TASKS` 在随后 docs commit 中更新。
  - 两个非本任务未跟踪文件 `asar-list.cjs`、`pi-ai-README.zh.md` 仍未提交、勿删。
  - P3-3 的 TARGET 判定已改为匹配 `window.devicePixelRatio` 代码，避免被注释里的字样误判。
- 下一轮从：**P3-1**（静止时停止 rAF 空转，改为按需调度）开始；注意 P3-2 脉冲动画与 P3-1 同源，建议同一轮内先拆调度再修脉冲。
  - 设计提示：若只用 rAF 无限循环做呼吸动画，P3-1 与 P3-2 会互相抵消。推荐把河道/兽穴呼吸效果改为 CSS `@keyframes` 叠层（`#fx-layer`）+ canvas 按需重绘：JS 无脏状态/无棋子插值时不再申请帧，脉冲由 CSS 持续动画，两个任务同时满足；或退而求其次用 visibilitychange + prefers-reduced-motion + 时间驱动的节流帧，并在 PROGRESS 说明取舍。

## 交接摘要（当前状态）

- HEAD 应为第 4 轮代码提交 `fd2549c`（P2-3/P2-4）之后；P1 全部、P2 全部完成，P3/P4 未开始。
- 当前文件：`index.html`（入口，依次加载 `config.js` → `rules.js` → `ai-worker.js` → `renderer.js` → `game-state.js` → `game.js`）、`config.js`（数据：BOARD/RULES/UI_TEXT）、`rules.js`（唯一规则源）、`ai-worker.js`（AI 引擎工厂）、`renderer.js`（绘制）、`game-state.js`（状态与走子）、`game.js`（编排入口）、`style.css`。
- 每轮必须先读本文件与 `TASKS.md`，再跑一次 `.\.ralph\verify.cmd` 确认基线。
- 可用任务：P3-1…P3-7 / P4-1…P4-6。

### 第 5 轮 — 2026-10-23 10:38（手动接管）
- 完成：
  - P3-1（commit `f0d7e29`）静止时停止 rAF 空转：`renderer.isIdle(board)` + `animate()` 按需调度
  - P3-2（同上）河道/兽穴呼吸改为 CSS `@keyframes`（`#river-pulse`），canvas 静态底色
  - P3-3（同上）`renderer.adjustSize()` 适配 `devicePixelRatio`，高分屏清晰
  - P3-4（同上）`style.css` 新增 `@media ≤960px` / `≤600px` 响应式断点
  - P3-5（同上）日志上限 200（`Game.MAX_LOGS`，超出时移除最旧条目）
  - P3-6（同上）键盘操作：方向键/WASD 预览 + Enter 确认 + Esc 取消
  - P3-7（同上）无障碍：canvas `aria-label`、turn-display `aria-live`、按钮 `aria-pressed`、对话框 `role=dialog`
  - P4-1（同上）新增 `.eslintrc.json`（browser + IIFE globals），CI 去掉 `|| true`
  - P4-2（同上）版本号三处对齐：`README.md` / `package.json` / `config.js` → `2.6.1`
  - P4-3（同上）新增 MIT `LICENSE`，`package.json` 改 `"MIT"`
  - P4-4（同上）README 安装命令去掉 `your-username` 占位，改用 `madbarasa`
  - P4-5（同上）`index.html` 占位符全部替换为真实中文文案
  - P4-6（同上）Pages 部署 `exclusion_patterns` 排除 `.github/.ralph/*.md` 等元数据
- 验证：`.\.ralph\verify.cmd` MUST 全绿；ESLint 0 错误 1 warning（`canvas` unused，可忽略）
- 注意：
  - P3-2 的河道脉冲改用 CSS 后，verify.mjs 要求 canvas 中仍有 `fillRect`（静态底色），已保留
  - `asar-list.cjs` 和 `pi-ai-README.zh.md` 是非本任务文件，未提交、未删除
- 下一轮：所有必做任务已完成，无需继续。

## 任务完成总结

- P1 全部 6 项 ✅（commit e762be2…affb507）
- P2 全部 4 项 ✅（commit 78a854c…fd2549c）
- P3 必做 7 项 ✅（commit f0d7e29）
- P4 必做 6 项 ✅（同上）
- **全部 23 项必做任务完成**，`node .ralph/verify.mjs` MUST 全绿，ESLint 无错误。

