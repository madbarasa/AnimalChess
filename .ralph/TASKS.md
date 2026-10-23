# AnimalChess 改进任务清单（Ralph 交接文档）

> 本文件是 Ralph 循环的**持久记忆**。每轮 worker 从这里领取任务，不依赖上一轮对话。

## 0. 必读

- [`CODE_REVIEW.md`](../CODE_REVIEW.md)：完整审查报告，每个问题的原因与位置
- [`.ralph/PROGRESS.md`](PROGRESS.md)：上一轮进度、遗留问题、下一轮起点
- 工作目录：仓库根（`D:\DeepSeek Harness\workspace\game`），git 仓库，`main` 分支

## 0.5 本机环境命令（PATH 里没有 git/node，务必用绝对路径）

```powershell
$node = "C:\Users\hohox\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$git  = "C:\Program Files\Git\cmd\git.exe"
$pnpm = "C:\Users\hohox\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs"

# 验收（等价于 & $node .ralph\verify.mjs）
.\.ralph\verify.cmd

# 提交
& $git add -A
& $git commit -m "fix(P1-1): 说明"

# 回滚
& $git reset --hard HEAD

# ESLint（仅 P4-1 需要）
& $node $pnpm install
& $node $pnpm run lint
```

> 注意：PowerShell 里调用 `git` 直接写 `git` 会报 CommandNotFound，必须用 `& $git ...`。

## 1. 铁律（违反即回滚）

1. **一轮只做 1–3 个任务项**，做完立刻验证、立刻提交。
2. 每项提交前必须运行 `node .ralph/verify.mjs`，**`MUST` 段全绿**才允许提交。
3. 提交信息格式：`fix(P1-1): 说明` / `refactor(P2-1): 说明` / `feat(P3-3): 说明`。
4. 改坏了且 30 分钟内修不好：`git reset --hard HEAD` 回滚，把原因写进 `PROGRESS.md`，换方案或跳过。
5. **不引入构建步骤、不新增运行时依赖**，保持「双击 `index.html` 就能玩」。
6. **不删除任何现有玩法/功能**。
7. 只提交与任务相关的文件；`.github/` 仅在 P4-6 时改动。
8. 每轮结束必须更新 `.ralph/PROGRESS.md`：完成项、commit hash、遗留问题、下一轮从哪开始。

## 2. 验收基线

- `node .ralph/verify.mjs` → `MUST` 全绿
- 浏览器打开 `index.html`：能开局、能走棋、AI 能应招、Console 无报错

## 3. 任务清单（按顺序；「必做」全部勾完才算完成）

### P1 规则与算法正确性

- [x] **P1-1** 陷阱变量命名：`inOwnTrap` 改为表达真实语义（目标格是否为我方陷阱），同步注释
- [x] **P1-2** `ai_exitSbe` 陷阱防御对称化：红方同类威胁同样扣分
- [x] **P1-3** 超时不再污染搜索值：引入中断标志，迭代加深在中断时回滚到上一层完整结果
- [x] **P1-4** 兽穴占用判定区分归属（`ai_sbe` 中检查兽穴上的棋子颜色）
- [x] **P1-5** 收敛全局可变状态：`isTimeUp` / `bestDecisionGlobal` 收进搜索上下文对象
- [x] **P1-6** 终局判定补全：一方棋子数为 0 判负；无合法走法判和（UI 给出提示）

### P2 架构

- [x] **P2-1** 抽出唯一规则源 `rules.js`：`canEat` / `canMove` / `getLegalMoves` 纯函数，主线程与 AI **共用同一实现**（不得保留两套）
- [x] **P2-2** AI 代码移出模板字符串，成为可独立加载的 worker 源（保持自包含，可用 `importScripts` 或内联规则）
- [ ] **P2-3** 拆分 `Game` 大类：至少分出渲染与规则职责，`game.js` 仍为入口
- [ ] **P2-4** 配置分离：规则数据（`rivers`/`traps`/`dens`/`pst`）与 UI 文案拆成独立对象/文件

### P3 性能与体验

- [ ] **P3-1** 静止时停止 rAF 空转（改为按需调度）
- [ ] **P3-2** 修复脉冲动画冻结：河道/兽穴呼吸效果在空闲时也连续
- [ ] **P3-3** canvas 适配 `devicePixelRatio`（高分屏清晰）
- [ ] **P3-4** 响应式布局：窄屏下棋盘缩放、面板换行，不裁切
- [ ] **P3-5** 日志条数上限（建议 200 条），避免长局 DOM 膨胀
- [ ] **P3-6** 键盘可操作：方向键 + 回车选子/落子，`Esc` 取消
- [ ] **P3-7** 基础无障碍：canvas 加 `aria-label`，按钮/下拉补 `aria-*`
- [ ] **P3-8（可选）** WebAudio 合成音效：走子 / 吃子 / 胜利（无外部资源）

### P4 工程卫生

- [ ] **P4-1** 补 ESLint 配置，让 `pnpm run lint` 真正可跑；CI 去掉 `|| true`
- [ ] **P4-2** 版本号三处对齐（`README.md` ↔ `package.json` ↔ `CONFIG.VERSION`）
- [ ] **P4-3** 许可证统一：新增 MIT `LICENSE`，`package.json` 改 `"MIT"`
- [ ] **P4-4** README 安装命令去掉 `your-username` 占位
- [ ] **P4-5** `index.html` 占位符替换为真实文案（`APP_TITLE` / `MODE_A` / `MODE_B`），保留 JS 覆盖逻辑
- [ ] **P4-6** Pages 部署收窄：只发布静态资源，排除 `.github` 等
- [ ] **P4-7（可选）** ESLint 升级到 9 / flat config

## 4. 完成标准

- 所有**必做**项（未标「可选」）勾选完成
- `node .ralph/verify.mjs` 全绿
- `git log` 中每个任务项有对应 commit
- `.ralph/PROGRESS.md` 记录完整、可交接

## 5. 已知风险（优先看）

- **P2-1/P2-2 是高风险重构**：先让 P1 全部完成、`verify.mjs` 稳定后再动。
- 重构时 AI 走法与玩家规则必须一致；每改一处规则，补一条 `verify.mjs` 的规则断言。
- 不要为了"看起来更专业"引入框架/打包器，这个项目的美感就在零依赖。
