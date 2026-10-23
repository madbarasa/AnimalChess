# AnimalChess Code Review 报告

| 项目 | 内容 |
|---|---|
| 仓库 | `madbarasa/AnimalChess` |
| 审查对象 | 工作区 `workspace/game`，commit `2fc2e45`（main） |
| 版本 | v2.6.1（`package.json` / `CONFIG.VERSION`） |
| 审查日期 | 2026-10-23 |
| 审查方式 | 全量源码通读 + `node --check` 语法校验 + 抽取 Worker AI 引擎独立实测 |
| 文件规模 | `game.js` 761 行 / `style.css` 223 行 / `index.html` 52 行 |

---

## 一、执行摘要

这是一份**骨架相当扎实**的 vibe coding 产物：AI 部分采用了 Worker 隔离 + 迭代加深 + Alpha-Beta 剪枝 + 启发式走法排序 + PST 位置权重，双性格 AI 的设计也在线；渲染侧有按需重绘和脏检测的意图。对非科班出身的项目来说，这个完成度超出预期。

但存在 **3 个 P0 级问题**，其中两个会直接导致游戏“卡死”，一个是架构级隐患（规则双实现已经开始漂移）。此外工程卫生（lint 失效、版本/许可证不一致）和移动端适配也有明显缺口。

**一句话结论：能玩、有想法、但“规则单一来源”没做，P0 的判负与竞态必须先修。**

---

## 二、实测数据

将 `game.js` 中内嵌的 Worker 引擎（`workerCode` 模板字符串）抽取为独立脚本，在 Node 24 下运行：

| 场景 | 性格 | 耗时 | 返回 |
|---|---|---|---|
| 标准开局 | aggressive | **1501ms**（撞满 1500ms 上限） | 虎 `(c4,r0) → (c4,r1)` |
| 标准开局 | conservative | 59ms | 同一步 |
| 残局（蓝方仅鼠+象） | aggressive | 25ms | 鼠进兽穴 |
| **蓝方无子** | aggressive | 0ms | **`{ point: null }`** ⚠️ |
| 标准开局 | aggressive，`maxTime=1` | 1ms | 仍返回有效走法 |

结论：

1. AI 引擎本身能正常产出合法走法，时间上限控制有效；
2. **aggressive 每步固定吃掉约 1.5 秒**，且 7 层深度实际搜不完（受时间限制），有效深度约 4 层；
3. **一方无子时返回 `null`，而主线程没有对应的终止逻辑** —— 死锁根因（见 P0-1）。

复现脚本见文末附录。

---

## 三、🔴 P0：会导致游戏卡死的问题

### P0-1 一方被吃光 → 永久死锁

实测蓝方无子时 worker 返回 `null`。主线程收到后只做了 `this.isThinking = false`（[game.js:353-356](game.js#L353-L356)），但：

- 胜负判定只看兽穴（[game.js:542](game.js#L542)、[game.js:671](game.js#L671)），**不判“全灭”**；
- 玩家点击被 `clicked.color === this.turn` 拦住（[game.js:703](game.js#L703)），红方无子时同样点不动。

链路：轮到蓝方 → AI 返回 `null` → 回合不切换 → 双方都无法行动 → 永久死锁。

**建议**：`executeMove()` 之后统计对方棋子数，为 0 直接判胜；给 `win()` 增加“吃光”分支；`aiWorker.onmessage` 里 `decision === null` 时要兜底（判负或重新请求）。

### P0-2 重置 / 切换模式时，在途 AI 决策会污染新棋局（竞态）

`init()`（[game.js:393-416](game.js#L393-L416)）**没有重置 `isThinking`**，也**没有终止或丢弃正在计算的 Worker**。

用户按下 RESET 或切换 PVE/PVP 时，若 AI 刚好在算旧局面，结果回来会执行：

```js
const p = this.board[y1][x1];    // 新棋盘上同坐标的棋子
this.executeMove(p, y2, x2);     // 用旧走法操作新棋子
```

后果：走出莫名其妙的棋；或 `p` 为 `null` 静默丢弃；或 `isThinking` 永远停在 `true`，玩家再也点不动（[game.js:686](game.js#L686)）。

**建议**：`init()` 中加 `this.isThinking = false`；给每局分配 `gameId`，Worker 回包携带 `gameId`，不匹配则丢弃。

### P0-3 两套规则实现，已经开始漂移

主线程一套规则（[`canMove` / `checkEat`，game.js:450-495](game.js#L450-L495)），Worker 里另一套（[`getOrderedMoves` / `canEat` / `ai_sbe`，game.js:76-242](game.js#L76-L242)）。

| 规则点 | 主线程 | Worker |
|---|---|---|
| 岸上鼠吃水中鼠 | 允许（只拦“水中→岸上”） | **禁止**（[game.js:232](game.js#L232) 要求 `terrain` 相同） |
| 狮虎跳河落点 | 校验不能进己方兽穴（[game.js:456-457](game.js#L456-L457)） | **未校验**（[game.js:212-229](game.js#L212-L229)） |
| 全灭判负 | 不判 | 判（[game.js:172-173](game.js#L172-L173)） |

即：**AI 眼中的规则和玩家能走的规则不是同一套**。这类问题的可怕之处在于“偶发、难复现、改一处漏一处”。

**建议**：抽出纯函数模块 `rules.js`（`canEat` / `canMove` / `getLegalMoves`），主线程直接 import，Worker 构造时把规则源码一起注入 Blob。规则只能有一个来源。

---

## 四、🟠 P1：规则与算法正确性

| # | 问题 | 位置 | 说明 |
|---|---|---|---|
| 1 | 变量名语义相反 | [game.js:483-484](game.js#L483-L484) | `inOwnTrap` 实际判断“目标格是否为我方陷阱”，逻辑对但名字会误导后续维护 |
| 2 | 终局评估不对称 | [game.js:176-184](game.js#L176-L184) | `ai_exitSbe` 的陷阱防御只检查蓝方，红方同类威胁不扣分 |
| 3 | 超时污染搜索值 | [game.js:249-252](game.js#L249-L252)、[game.js:293](game.js#L293) | 超时 `return 0`，上层把 0 当真实评估参与比较，可能选到劣着。应抛中断信号并整体回滚到上一层结果 |
| 4 | 兽穴判断不分敌我 | [game.js:98-99](game.js#L98-L99) | 只要兽穴格有棋子就判 ±2000，未校验棋子归属（配合跳河不校验落点，理论可达） |
| 5 | 全局可变状态 | [game.js:244-245](game.js#L244-L245) | `isTimeUp`、`bestDecisionGlobal` 挂在 Worker 顶层，不可并行、不可单测 |
| 6 | 缺少和棋 / 无子可动判定 | — | 斗兽棋通常有“困毙/和棋”规则，当前未实现 |

---

## 五、🟡 P2：可维护性（早期 vibe coding 的典型痕迹）

1. **267 行 AI 代码内嵌在模板字符串里**（[game.js:75-341](game.js#L75-L341)）：无语法高亮、无 lint、无法 import 复用、无单测可能。**建议第一个拆**：独立 `ai-worker.js` + `new Worker('ai-worker.js')`。
2. **死代码**：`getAllValidMoves`、`simulateMove`、`isGameOver` 定义了但从未被调用（[game.js:542-570](game.js#L542-L570)），疑似上一版 AI 遗留。
3. **单类 761 行**：状态、渲染、DOM、事件、AI 全在 `Game` 里。拆成 `Rules` / `Renderer` / `AI` / `Game` 四个文件即可显著降复杂度。
4. **配置与文案混杂**：`CONFIG` 中 `UI_TEXT`（文案）与 `rivers / traps / dens / pst`（规则数据）混排（[game.js:7-66](game.js#L7-L66)），换棋盘等于改代码。

---

## 六、🔵 P3：性能与体验

| # | 问题 | 位置 | 说明 |
|---|---|---|---|
| 1 | “7 层深度”是虚设 | [game.js:318](game.js#L318) | 实测撞满 1500ms，第 5~7 层基本在超时边缘；无置换表时有效深度约 4 层 |
| 2 | 每帧空转 | [game.js:653-656](game.js#L653-L656) | `requestAnimationFrame` 无条件递归，静止时也持续消耗 CPU |
| 3 | 脉冲动画实际会冻结 | [game.js:576-577](game.js#L576-L577) | `needsRedraw=false` 提前 return，而 `pulse` 只在此处递增 → 河道/兽穴呼吸效果只在状态变化的那一帧跳一下，与 README“动态脉冲特效”不符 |
| 4 | 高分屏模糊 | [game.js:72-73](game.js#L72-L73) | canvas 未按 `devicePixelRatio` 缩放 |
| 5 | 小屏裁切 | [style.css:22-23](style.css#L22-L23) | `overflow:hidden` + 固定 560×720 canvas，768p 笔记本上下会被切 |
| 6 | 日志无上限 | [game.js:427-433](game.js#L427-L433) | `prepend` 无上限，长局 DOM 膨胀 |
| 7 | 无音效 / 无键盘操作 / 无 ARIA / 无触屏优化 | — | 可访问性与移动端体验缺口 |

---

## 七、⚪ P4：工程卫生

1. **lint 从未真正生效**：CI 中 `pnpm run lint || true`（[ci.yml:29](.github/workflows/ci.yml#L29)），且仓库**没有 eslint 配置文件**——ESLint 8 在无配置时会直接报错退出。
2. **版本三处不一致**：`package.json` 与 `CONFIG.VERSION` 为 2.6.1，[README.md:3](README.md#L3) 仍写 2.4.0。
3. **许可证矛盾**：README 声称 MIT，`package.json` 为 ISC，仓库无 `LICENSE` 文件。
4. **README 安装命令仍是占位符**：`your-username`（[README.md:38](README.md#L38)）。
5. **ESLint 8 已 EOL**（2024-10 停止维护），`test` 脚本是空壳（[package.json:8](package.json#L8)）。
6. **Pages 部署范围过宽**：`deploy.yml` 把整个仓库发布上线（[deploy.yml:34](.github/workflows/deploy.yml#L34)），建议收窄为静态资源。
7. **HTML 占位符**：`APP_TITLE` / `MODE_A` / `MODE_B`（[index.html:6](index.html#L6)、[index.html:26-27](index.html#L26-L27)）虽有 JS 覆盖，但 JS 失败时会露馅，建议直接写真实文案。

---

## 八、值得肯定的设计

- **Worker 隔离 AI 计算**：方向完全正确，动画不被搜索阻塞；
- **按需重绘 + 脏检测**：思路正确（尽管实现让脉冲动画冻结）；
- **Alpha-Beta + 走法排序 + PST + 双性格**：对个人项目而言组合完整；
- **`UI_TEXT` 集中管理文案**：天然为 i18n 留了口子；
- **注释密度与结构意识**：能看出作者在认真思考，不是随手堆砌。

---

## 九、修复优先级建议

| 顺序 | 事项 | 预估改动量 | 收益 |
|---|---|---|---|
| 1 | 补“吃光判负” + `null` 决策兜底 | ~20 行 | 消灭唯一能硬卡死的 bug |
| 2 | `init()` 重置 `isThinking` + `gameId` 丢弃旧回包 | ~15 行 | 消灭重置竞态 |
| 3 | 抽出 `rules.js` 作为唯一规则来源 | 中等 | 根治规则漂移，为后续扩展铺路 |
| 4 | 拆出 `ai-worker.js` 独立文件 | 中等 | 可 lint / 可单测 / 可读 |
| 5 | 移动端响应式 + DPR 适配 | 中等 | 可玩性明显提升 |
| 6 | 工程卫生（lint 配置、版本对齐、LICENSE、CI） | 小 | 长线可维护性 |

---

## 附录：AI 引擎实测脚本

将下列脚本保存为 `aitest.js`，用 Node 运行即可复现第二节数据（从 `game.js` 中自动抽取 Worker 代码，构造棋盘并调用 `onmessage`）：

```js
const fs = require('fs');
const src = fs.readFileSync('game.js', 'utf8');
const code = src.match(/const workerCode = `([\s\S]*?)`;/)[1];

const rows = 9, cols = 7;
const rivers = [[3,1],[3,2],[4,1],[4,2],[5,1],[5,2],[3,4],[3,5],[4,4],[4,5],[5,4],[5,5]];
const traps = [{r:0,c:2,side:'blue'},{r:0,c:4,side:'blue'},{r:1,c:3,side:'blue'},
               {r:8,c:2,side:'red'},{r:8,c:4,side:'red'},{r:7,c:3,side:'red'}];
const dens = [{r:0,c:3,side:'blue'},{r:8,c:3,side:'red'}];

function buildBoard(bPos, rPos) {
  const board = Array(rows).fill().map(() => Array(cols).fill(null));
  bPos.forEach(([r,c,rank]) => board[r][c] = {rank, color:'blue'});
  rPos.forEach(([r,c,rank]) => board[r][c] = {rank, color:'red'});
  return board;
}

function toAiMap(board) {
  const aiMap = [];
  for (let x = 0; x < cols; x++) {
    aiMap[x] = [];
    for (let y = 0; y < rows; y++) {
      const p = board[y][x];
      const t = traps.find(t => t.r === y && t.c === x);
      const d = dens.find(d => d.r === y && d.c === x);
      aiMap[x][y] = {
        animal: p ? { rank: p.rank, color: p.color === 'blue' ? 0 : 1, point: { x, y } } : null,
        terrain: rivers.some(([rr,cc]) => rr === y && cc === x) ? 'water' : 'land',
        trap: t ? (t.side === 'blue' ? 0 : 1) : -1,
        base: d ? (d.side === 'blue' ? 0 : 1) : -1
      };
    }
  }
  return aiMap;
}

function run(label, board, personality, maxTime) {
  const fn = new Function('postMessage', 'let onmessage;' + code + '; return onmessage;');
  let out = null;
  const handler = fn((msg) => { out = msg; });
  const t0 = Date.now();
  handler({ data: { map: toAiMap(board), personality, maxTime } });
  console.log(`[${label}] ${personality} maxTime=${maxTime} elapsed=${Date.now()-t0}ms decision=${JSON.stringify(out)}`);
}

const bPos = [[0,0,8],[0,6,7],[0,4,6],[2,4,5],[2,2,4],[2,6,3],[1,5,2],[2,0,1]];
const rPos = [[8,6,8],[8,0,7],[8,2,6],[6,2,5],[6,4,4],[6,0,3],[7,1,2],[6,6,1]];

run('open', buildBoard(bPos, rPos), 'aggressive', 1500);
run('open', buildBoard(bPos, rPos), 'conservative', 500);
run('endgame', buildBoard([[0,0,8],[2,0,1]], [[8,6,8],[6,2,5],[6,4,4]]), 'aggressive', 1500);
run('empty', buildBoard([], [[8,6,8],[6,2,5]]), 'aggressive', 1500);
run('timeout', buildBoard(bPos, rPos), 'aggressive', 1);
```

---

*本报告由 DSH Agent 生成，基于静态通读与运行时实测；未覆盖浏览器端交互与真实对局体验。*
