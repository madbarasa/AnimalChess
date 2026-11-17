<a id="readme-top"></a>

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]
[![Powered by DSH][dsh-shield]][dsh-url]

<!-- PROJECT LOGO -->
<br />
<div align="center">

  # 🦁 斗兽棋 3D — Animal Chess 3D

  <p align="center">
    使用 <strong>Three.js + TypeScript + Vite</strong> 完全重制的 3D 斗兽棋，玩家执红对弈冠军级 Alpha-Beta 搜索 AI
    <br />
    <a href="#快速开始"><strong>快速开始 »</strong></a>
    <br />
    <br />
    <a href="#玩法与操作">查看玩法</a>
    &middot;
    <a href="https://github.com/madbarasa/AnimalChess/issues/new?labels=bug&template=bug-report---.md">报告 Bug</a>
    &middot;
    <a href="https://github.com/madbarasa/AnimalChess/issues/new?labels=enhancement&template=feature-request---.md">提议新功能</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>📋 目录</summary>
  <ol>
    <li><a href="#关于项目">关于项目</a></li>
    <li><a href="#快速开始">快速开始</a></li>
    <li><a href="#玩法与操作">玩法与操作</a></li>
    <li><a href="#ai-引擎">AI 引擎</a></li>
    <li><a href="#规则摘要">规则摘要</a></li>
    <li><a href="#项目结构">项目结构</a></li>
    <li><a href="#测试与验证">测试与验证</a></li>
    <li><a href="#路线图">路线图</a></li>
    <li><a href="#参与贡献">参与贡献</a></li>
    <li><a href="#许可证">许可证</a></li>
    <li><a href="#致谢">致谢</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->
## 关于项目

[![产品截图][product-screenshot]](#关于项目)

本项目是对经典桌游**斗兽棋**的 3D 化完全重制：真实 3D 棋盘场景、河道与陷阱立体呈现、棋子自带动画与特效，玩家执红方与蓝方 AI 对弈。

所有规则逻辑与 Alpha-Beta 搜索均从原版 [AnimalChess](https://github.com/madbarasa/AnimalChess) 的 JS 代码逐行移植为 TypeScript，并与原引擎做了**走法交叉验证**（crosscheck），确保行为完全一致。

核心亮点：

* 🎮 **完整 3D 场景** — 棋盘、河道、陷阱、兽穴全部 3D 建模，程序化纹理零外部资源
* 🧠 **冠军难度 AI** — Negamax + Alpha-Beta 剪枝 + Zobrist 置换表，3 秒思考预算内迭代加深
* ⚡ **Web Worker 异步搜索** — AI 计算不阻塞渲染线程，UI 全程流畅
* 🖥️ **双模式** — 单人挑战（PvE）/ 双人对决（本地 PvP）
* ✅ **双层自动化验证** — AI 引擎单元测试 + Playwright 浏览器端真实交互测试

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

### 技术栈

* [![Three.js][Three.js]][Three-url]
* [![TypeScript][TypeScript]][TypeScript-url]
* [![Vite][Vite]][Vite-url]
* [![Playwright][Playwright]][Playwright-url]

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

<!-- GETTING STARTED -->
## 快速开始

### 环境要求

* Node.js ≥ 20.19（Vite 8 要求）
* npm

### 安装

1. 克隆仓库
   ```sh
   git clone https://github.com/madbarasa/AnimalChess.git
   cd AnimalChess
   ```
2. 安装依赖
   ```sh
   npm install
   ```
3. 启动开发服务器
   ```sh
   npm run dev      # → http://127.0.0.1:5188
   ```
4. 生产构建与预览（可选）
   ```sh
   npm run build    # 产物输出到 dist/
   npm run preview  # → http://127.0.0.1:4188
   ```

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

<!-- USAGE -->
## 玩法与操作

右侧面板切换 **单人挑战**（执红对 AI）或 **双人对决**（本地轮流走子）。

支持鼠标与键盘两套操作：

| 操作 | 鼠标 | 键盘 |
| --- | --- | --- |
| 选中棋子 | 左键点击棋子 | 自动 |
| 选择走法方向 | — | <kbd>W</kbd>/<kbd>A</kbd>/<kbd>S</kbd>/<kbd>D</kbd> 或方向键 |
| 确认走子 | 点击目标格 | <kbd>Enter</kbd> |
| 取消选中 | 再点一次棋子 | <kbd>Esc</kbd> |

AI 思考期间棋盘锁定，右上角实时显示 **AI 计算中...** 状态与思考进度：

[![AI 计算中][ai-screenshot]](#ai-引擎)

走子后右侧战报面板记录每回合日志——AI 搜索深度、展开节点数、耗时一目了然：

[![对局画面][battle-screenshot]](#ai-引擎)

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

<!-- AI ENGINE -->
## AI 引擎

单档冠军难度，默认即最强，无难度分级与解锁流程。

* **Web Worker 异步搜索**：3 秒思考预算内迭代加深，不阻塞渲染
* **Negamax + Alpha-Beta 剪枝** + **Zobrist 置换表** + 杀手走法 / 历史启发式排序
* **超时安全**：只采用完整搜索层的结果，一层未完成时回退到启发式最优合法走法
* **静态评估**（红方视角）：子力与位置价值、兽穴推进、河道威慑、受威胁与保护、陷阱压制、鼠象牵制、残局子力差
* **终局判定**：兽穴被占、一方被吃光、无子可动判和；胜负分带 ply 惩罚，优先速胜、推迟失败

典型搜索日志（冠军难度，开局阶段）：

```
AI: 搜索深度 7 · 242688 节点 · 3001ms
```

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

<!-- RULES -->
## 规则摘要

| 等级 | 动物 | 特殊 |
| --- | --- | --- |
| 1 | 鼠 | 可入水；可吃象 |
| 2-5 | 猫 / 狗 / 狼 / 豹 | — |
| 6 | 虎 | 可跃河 |
| 7 | 狮 | 可跃河 |
| 8 | 象 | 不吃鼠 |

* 河道仅鼠可入水，狮 / 虎可直线跃过连续水域（落点为敌子且可捕食时即可吃）
* 敌方陷阱中的棋子等级视为 0，任意己方棋子可吃
* 进入对方兽穴即获胜
* 一方无子可动判和

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

<!-- STRUCTURE -->
## 项目结构

```
src/
├── config.ts              # 棋盘常量 / 开局摆子
├── main.ts                # Vite 入口
├── game/
│   ├── rules.ts           # 斗兽棋规则纯函数
│   ├── GameState.ts       # 棋局状态与走子
│   ├── aiEngine.ts        # Alpha-Beta 搜索核心（纯函数，可单测）
│   ├── ai.worker.ts       # Web Worker 入口
│   ├── AI.ts              # 异步搜索调度 + 超时兜底
│   └── AnimalChessGame.ts # 主游戏类（Three.js 场景 + 交互）
├── renderers/
│   ├── BoardRenderer.ts   # 3D 棋盘、河道、陷阱、兽穴
│   └── PieceRenderer.ts   # 3D 棋子与动画
├── systems/
│   └── VfxSystem.ts       # 选中光柱、粒子等特效
├── ui/
│   └── GameUI.ts          # 回合提示、模式选择、战报日志
scripts/
└── verify-game.mjs        # 浏览器自动化验证（截图 + 点击测试）
tests/
└── ai/                    # AI 引擎单元测试 + 与原版交叉验证
```

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

<!-- TESTING -->
## 测试与验证

```sh
npm run test:ai                                    # AI 引擎单元测试
node scripts/verify-game.mjs http://127.0.0.1:5188/ # 浏览器端端到端验证
```

* **AI 单元测试**：立即取胜、捕食决策、受威胁回避、超时安全兜底、无子可动、走法生成与规则逐子比对
* **交叉验证**：TS 引擎与原版 JS 引擎对同一局面批量对拍，走法完全一致
* **浏览器验证**：桌面 / 移动双视口截图与像素统计、真实点击走子 + AI 回手交互测试、控制台错误采集

验证报告 → `artifacts/verification/report.json`

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

<!-- ROADMAP -->
## 路线图

- [x] 3D 棋盘场景与棋子动画
- [x] 冠军难度 Alpha-Beta AI（Web Worker）
- [x] 单人挑战 / 双人对决双模式
- [x] AI 引擎单元测试与原版交叉验证
- [ ] 在线对战
- [ ] 难度分级
- [ ] 移动端 PWA

在 [Issues](https://github.com/madbarasa/AnimalChess/issues) 中提出新功能建议。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

<!-- CONTRIBUTING -->
## 参与贡献

贡献让开源社区成为学习和启发的绝佳场所。非常感谢您的任何贡献！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交修改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送分支 (`git push origin feature/AmazingFeature`)
5. 发起 Pull Request

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

<!-- LICENSE -->
## 许可证

基于 MIT License 发布，见 [LICENSE](./LICENSE)。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

<!-- ACKNOWLEDGMENTS -->
## 致谢

* [othneildrew/Best-README-Template](https://github.com/othneildrew/Best-README-Template) — 本 README 模板
* [Three.js](https://threejs.org/) — 3D 渲染
* [AnimalChess 原版](https://github.com/madbarasa/AnimalChess) — 规则与 AI 引擎的移植来源
* 图标与徽章来自 [Shields.io](https://shields.io/)

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

[contributors-shield]: https://img.shields.io/github/contributors/madbarasa/AnimalChess.svg?style=for-the-badge
[contributors-url]: https://github.com/madbarasa/AnimalChess/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/madbarasa/AnimalChess.svg?style=for-the-badge
[forks-url]: https://github.com/madbarasa/AnimalChess/network/members
[stars-shield]: https://img.shields.io/github/stars/madbarasa/AnimalChess.svg?style=for-the-badge
[stars-url]: https://github.com/madbarasa/AnimalChess/stargazers
[issues-shield]: https://img.shields.io/github/issues/madbarasa/AnimalChess.svg?style=for-the-badge
[issues-url]: https://github.com/madbarasa/AnimalChess/issues
[license-shield]: https://img.shields.io/github/license/madbarasa/AnimalChess.svg?style=for-the-badge
[license-url]: ./LICENSE
[dsh-shield]: https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=for-the-badge&logo=deepseek&logoColor=white
[dsh-url]: https://github.com/deepseek-ai/deepseek-harness

[product-screenshot]: images/screenshot-start.png
[ai-screenshot]: images/screenshot-ai-thinking.png
[battle-screenshot]: images/screenshot-battle.png

[TypeScript]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Three.js]: https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=threedotjs&logoColor=white
[Three-url]: https://threejs.org/
[Vite]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vite.dev/
[Playwright]: https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white
[Playwright-url]: https://playwright.dev/
