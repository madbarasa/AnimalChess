/**
 * 斗兽棋 Pro - 全局配置（P2-4 配置分离）
 *
 * 这里只放「数据」，不放逻辑：
 *   - VERSION  ：版本号（README / package.json 需与之对齐，见 P4-2）
 *   - BOARD    ：棋盘几何参数（行列数、格子像素）
 *   - RULES    ：规则数据（河道、陷阱、兽穴、评估权重、开局摆子）
 *   - UI_TEXT  ：界面文案
 *
 * 本文件必须在 rules.js / renderer.js / game-state.js / game.js 之前加载。
 * 仍然是普通 <script>（非 ESM），保持「双击 index.html 即可游玩」。
 */
(function (root) {
    'use strict';

    const VERSION = '2.6.1';

    // 棋盘几何参数（纯展示 / 坐标换算）
    const BOARD = {
        rows: 9,
        cols: 7,
        cell: 80
    };

    // 规则数据：棋子规则所依赖的棋盘常量
    const RULES = {
        // 河道格（行, 列）
        rivers: [
            [3, 1], [3, 2], [4, 1], [4, 2], [5, 1], [5, 2],
            [3, 4], [3, 5], [4, 4], [4, 5], [5, 4], [5, 5]
        ],
        // 陷阱格，side 表示陷阱归属方（在该方陷阱内的敌子等级视为 0）
        traps: [
            { r: 0, c: 2, side: 'blue' }, { r: 0, c: 4, side: 'blue' }, { r: 1, c: 3, side: 'blue' },
            { r: 8, c: 2, side: 'red' }, { r: 8, c: 4, side: 'red' }, { r: 7, c: 3, side: 'red' }
        ],
        // 兽穴格，side 表示归属方（进入对方兽穴即获胜）
        dens: [
            { r: 0, c: 3, side: 'blue' },
            { r: 8, c: 3, side: 'red' }
        ],
        // 评估权重表（供 AI 参考的规则数据；当前 AI 引擎使用自身启发式，保留以兼容旧配置）
        pst: [
            [0, 0, 0, 0, 0, 0, 0],
            [5, 10, 15, 20, 15, 10, 5],
            [10, 20, 30, 40, 30, 20, 10],
            [15, 30, 40, 50, 40, 30, 15],
            [20, 40, 50, 70, 50, 40, 20],
            [40, 60, 70, 90, 70, 60, 40],
            [60, 80, 100, 130, 100, 80, 60],
            [100, 150, 250, 400, 250, 150, 100],
            [400, 700, 900, 5000, 900, 700, 400]
        ],
        // 棋子等级定义（1 鼠 … 8 象）
        pieces: [
            { rank: 1 }, { rank: 2 }, { rank: 3 }, { rank: 4 },
            { rank: 5 }, { rank: 6 }, { rank: 7 }, { rank: 8 }
        ],
        // 开局摆子：[行, 列, 等级]
        startPositions: {
            blue: [[0, 0, 8], [0, 6, 7], [0, 4, 6], [2, 4, 5], [2, 2, 4], [2, 6, 3], [1, 5, 2], [2, 0, 1]],
            red: [[8, 6, 8], [8, 0, 7], [8, 2, 6], [6, 2, 5], [6, 4, 4], [6, 0, 3], [7, 1, 2], [6, 6, 1]]
        }
    };

    // 界面文案（与规则数据彻底分开，方便本地化 / 改文案）
    const UI_TEXT = {
        system: '系统',
        aiThinking: 'AI 计算中...',
        redTurn: '红方回合',
        blueTurn: '蓝方回合',
        aggressive: '积极',
        conservative: '保守',
        redSide: '红方',
        blueSide: '蓝方',
        redBrief: '红',
        blueBrief: '蓝',
        victoryTitle: 'VICTORY',
        pageTitle: (ver) => `斗兽棋 Pro v${ver} - Tactical Neon`,
        pveBtn: '单人挑战',
        pvpBtn: '双人对决',
        resetBtn: '🔄 重新开始',
        restartWinBtn: '再次征战',
        aggressiveDesc: '积极型',
        conservativeDesc: '保守型',
        aiEngineLabel: (ver) => `AI 引擎: Champion ${ver}`,
        enterMode: (p, ver) => `系统: 进入 ${p} 演练模式 v${ver}...`,
        eatAction: (side, pName, tName) => `${side}${pName} 捕食 ${tName}`,
        aiSwitch: (p) => `系统: AI 已切换为 ${p} 性格`,
        victory: (side) => `${side} 统领了战场！`,
        timeTaken: (m, s) => `用时: ${m}:${s}`,
        gameEnd: (side) => `🏆 终结: ${side}获得了胜利！`,
        drawTitle: 'DRAW',
        drawTurn: '和棋',
        drawReason: (side) => `${side}无子可动，双方握手言和。`,
        drawLog: (side) => `🤝 和棋: ${side}无子可动`,
        animalNames: ['鼠', '猫', '狗', '狼', '豹', '虎', '狮', '象']
    };

    root.AnimalChessConfig = { VERSION, BOARD, RULES, UI_TEXT };
})(typeof self !== 'undefined' ? self : globalThis);
