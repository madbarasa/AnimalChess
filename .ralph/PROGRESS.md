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

## 交接摘要（当前状态）

- HEAD 应为 P2-2 之后；P1、P2-1、P2-2 全绿，P2-3/P2-4 未开始。
- 当前文件：`index.html`（入口，依次加载 `rules.js` → `ai-worker.js` → `game.js`）、`rules.js`（唯一规则源）、`ai-worker.js`（AI 引擎工厂）、`game.js`（Game 类 + Worker 组装）、`style.css`。
- 每轮必须先读本文件与 `TASKS.md`，再跑一次 `.\.ralph\verify.cmd` 确认基线。
- 可用任务：P2-3 / P2-4 / P3-1…P3-7 / P4-1…P4-6。
