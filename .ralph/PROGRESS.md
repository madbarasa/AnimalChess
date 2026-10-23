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

## 交接摘要（当前状态）

- HEAD 应为 `affb507` 之后的 docs commit；P1 全绿，P2 未开始。
- 每轮必须先读本文件与 `TASKS.md`，再跑一次 `.\.ralph\verify.cmd` 确认基线。
- 可用任务：P2-1 / P2-2 / P2-3 / P2-4 / P3-1…P3-7 / P4-1…P4-6。
