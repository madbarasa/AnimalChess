# 斗兽棋 3D — Animal Chess 3D

使用 **Three.js + TypeScript + Vite** 完全重制的斗兽棋，3D 棋盘场景、玩家执红对弈蓝方 AI。

基于原项目 [AnimalChess](https://github.com/madbarasa/AnimalChess) 的规则与 AI 引擎重建，所有规则逻辑与 Alpha‑Beta 搜索均从原 JS 移植为 TypeScript 并保持一致。

## 🎮 快速开始

```bash
npm install
npm run dev      # 开发 → http://127.0.0.1:5188
npm run build    # 生产构建 → dist/
npm run preview  # 预览构建 → http://127.0.0.1:4188
```

## 🧱 项目结构

```
src/
├── config.ts              # 棋盘常量 / 开局摆子
├── main.ts                # Vite 入口
├── game/
│   ├── rules.ts           # 斗兽棋规则纯函数
│   ├── GameState.ts       # 棋局状态与走子
│   ├── AI.ts              # Alpha‑Beta 剪枝 AI
│   └── AnimalChessGame.ts # 主游戏类（Three.js 场景 + 交互）
├── renderers/
│   ├── BoardRenderer.ts   # 3D 棋盘、河道、陷阱、兽穴
│   └── PieceRenderer.ts   # 3D 棋子
├── ui/
│   └── GameUI.ts          # 回合提示、模式选择
scripts/
└── verify-game.mjs        # 浏览器自动化验证（截图 + 点击测试）
```

## 🎯 规则摘要

| 等级 | 动物 | 特殊 |
| --- | --- | --- |
| 1 | 鼠 | 下水；吃象 |
| 2‑5 | 猫/狗/狼/豹 | — |
| 6 | 虎 | 跃河 |
| 7 | 狮 | 跃河 |
| 8 | 象 | 不吃鼠 |

- 河道仅鼠可入水，狮/虎可直线跃过连续水域
- 敌方陷阱中的棋子等级视为 0
- 进入对方兽穴即获胜

## 🤖 AI

Alpha‑Beta 剪枝，深度 6，~600ms。评估因子：子力价值、鼠象追踪、狮/虎机动性、象推进倾向、陷阱防御。

## ✅ 自动化验证

```bash
node scripts/verify-game.mjs http://127.0.0.1:5188/
```

- 桌面 / 移动双视口截图与像素统计
- 真实点击走子 + AI 回手交互测试
- 控制台错误与诊断信息采集

验证报告 → `artifacts/verification/report.json`

## 📄 许可证

MIT License，见 [LICENSE](./LICENSE)。