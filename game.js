/**
 * 斗兽棋 Pro - 模块化霓虹版
 * 版本: 2.6.1 (冠军 AI 核心)
 * 特性: 完整移植竞赛级 AI 逻辑
 */

const CONFIG = {
    // 基础配置
    VERSION: "2.6.1",
    UI_TEXT: {
        system: "系统",
        aiThinking: "AI 计算中...",
        redTurn: "红方回合",
        blueTurn: "蓝方回合",
        aggressive: "积极",
        conservative: "保守",
        redSide: "红方",
        blueSide: "蓝方",
        redBrief: "红",
        blueBrief: "蓝",
        victoryTitle: "VICTORY",
        pageTitle: (ver) => `斗兽棋 Pro v${ver} - Tactical Neon`,
        pveBtn: "单人挑战",
        pvpBtn: "双人对决",
        resetBtn: "🔄 重新开始",
        restartWinBtn: "再次征战",
        aggressiveDesc: "积极型",
        conservativeDesc: "保守型",
        aiEngineLabel: (ver) => `AI 引擎: Champion ${ver}`,
        enterMode: (p, ver) => `系统: 进入 ${p} 演练模式 v${ver}...`,
        eatAction: (side, pName, tName) => `${side}${pName} 捕食 ${tName}`,
        aiSwitch: (p) => `系统: AI 已切换为 ${p} 性格`,
        victory: (side) => `${side} 统领了战场！`,
        timeTaken: (m, s) => `用时: ${m}:${s}`,
        gameEnd: (side) => `🏆 终结: ${side}获得了胜利！`,
        drawTitle: "DRAW",
        drawTurn: "和棋",
        drawReason: (side) => `${side}无子可动，双方握手言和。`,
        drawLog: (side) => `🤝 和棋: ${side}无子可动`,
        animalNames: ["鼠", "猫", "狗", "狼", "豹", "虎", "狮", "象"]
    },
    cell: 80,
    rows: 9,
    cols: 7,
    pieces: [
        { rank: 1 }, { rank: 2 }, { rank: 3 }, { rank: 4 },
        { rank: 5 }, { rank: 6 }, { rank: 7 }, { rank: 8 }
    ],
    rivers: [
        [3, 1], [3, 2], [4, 1], [4, 2], [5, 1], [5, 2],
        [3, 4], [3, 5], [4, 4], [4, 5], [5, 4], [5, 5]
    ],
    traps: [
        { r: 0, c: 2, side: 'blue' }, { r: 0, c: 4, side: 'blue' }, { r: 1, c: 3, side: 'blue' },
        { r: 8, c: 2, side: 'red' }, { r: 8, c: 4, side: 'red' }, { r: 7, c: 3, side: 'red' }
    ],
    dens: [{ r: 0, c: 3, side: 'blue' }, { r: 8, c: 3, side: 'red' }],
    // 评估权重表 (用于积极型 AI)
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
    ]
};

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = CONFIG.cols * CONFIG.cell;
        this.canvas.height = CONFIG.rows * CONFIG.cell;

        // 规则与 AI 源码都由页面脚本先加载好（rules.js / ai-worker.js，P2-1/P2-2）
        if (!window.AnimalChessRules || typeof window.AnimalChessAiEngine !== 'function') {
            throw new Error('rules.js / ai-worker.js 未加载：请在 index.html 中先于 game.js 引入');
        }
        // AI 引擎只存在于 ai-worker.js：这里把规则源码 + 引擎工厂序列化进 Blob，
        // 因此 Worker 内的规则和页面完全同源，同时不需要 fetch / 构建步骤。
        const workerSource = [
            window.AnimalChessRules.source,
            '(' + window.AnimalChessAiEngine.toString() + ')(self, self.AnimalChessRules);'
        ].join('\n');
        const blob = new Blob([workerSource], { type: 'application/javascript' });
        this.aiWorker = new Worker(URL.createObjectURL(blob));
        
        this.aiWorker.onmessage = (e) => {
            const { point: decision, requestId } = e.data;
            // 重新开始/新开一局会递增 gameId：旧棋局的迟到回包直接丢弃，避免污染新棋盘
            if (requestId !== this.gameId) return;
            if (decision) {
                const { x1, y1, x2, y2 } = decision;
                const p = this.board[y1] && this.board[y1][x1];
                if (p && p.color === 'blue' && this.turn === 'blue' && !this.gameOver) {
                    this.executeMove(p, y2, x2);
                } else {
                    this.isThinking = false;
                    this.updateUI();
                }
            } else {
                // Worker 兜底后仍无走法：AI 无子可动，判和
                this.isThinking = false;
                if (!this.gameOver) this.drawGame('blue');
            }
        };

        this.mode = 'pve';
        this.personality = 'aggressive';
        this.turn = 'red';
        this.board = [];
        this.selected = null;
        this.gameOver = false;
        this.isThinking = false;
        this.gameId = 0;
        this.pulse = 0;
        this.startTime = Date.now();
        this.needsRedraw = true;

        this.init();
        this.applyStaticText();
        this.bindEvents();
        this.animate();
    }

    applyStaticText() {
        document.title = CONFIG.UI_TEXT.pageTitle(CONFIG.VERSION);
        document.getElementById('btn-pve').innerText = CONFIG.UI_TEXT.pveBtn;
        document.getElementById('btn-pvp').innerText = CONFIG.UI_TEXT.pvpBtn;
        document.getElementById('btn-reset').innerText = CONFIG.UI_TEXT.resetBtn;
        document.getElementById('btn-restart-win').innerText = CONFIG.UI_TEXT.restartWinBtn;
        
        const aiLabel = document.querySelector('.ai-config label');
        if (aiLabel) aiLabel.innerText = CONFIG.UI_TEXT.aiEngineLabel(CONFIG.VERSION);

        const aiPersonality = document.getElementById('ai-personality');
        if (aiPersonality) {
            aiPersonality.options[0].innerText = CONFIG.UI_TEXT.aggressiveDesc;
            aiPersonality.options[1].innerText = CONFIG.UI_TEXT.conservativeDesc;
        }
    }

    init() {
        this.gameId++;          // 作废所有在途 AI 请求
        this.isThinking = false;
        this.board = Array(CONFIG.rows).fill().map(() => Array(CONFIG.cols).fill(null));
        this.turn = 'red';
        this.gameOver = false;
        this.selected = null;
        this.startTime = Date.now();

        const bPos = [[0, 0, 8], [0, 6, 7], [0, 4, 6], [2, 4, 5], [2, 2, 4], [2, 6, 3], [1, 5, 2], [2, 0, 1]];
        bPos.forEach(p => this.addPiece(p[0], p[1], p[2], 'blue'));
        const rPos = [[8, 6, 8], [8, 0, 7], [8, 2, 6], [6, 2, 5], [6, 4, 4], [6, 0, 3], [7, 1, 2], [6, 6, 1]];
        rPos.forEach(p => this.addPiece(p[0], p[1], p[2], 'red'));

        document.getElementById('log-container').innerHTML = '';
        document.getElementById('victory-overlay').classList.add('hidden');

        // 读取界面设置
        const pSelect = document.getElementById('ai-personality');
        if (pSelect) this.personality = pSelect.value;

        const pName = this.personality === 'aggressive' ? CONFIG.UI_TEXT.aggressive : CONFIG.UI_TEXT.conservative;
        this.log(CONFIG.UI_TEXT.enterMode(pName, CONFIG.VERSION), "system");
        this.updateUI();
        this.triggerRedraw();
    }

    addPiece(r, c, rank, color) {
        this.board[r][c] = {
            rank, color, r, c,
            name: CONFIG.UI_TEXT.animalNames[rank - 1],
            x: c * CONFIG.cell, y: r * CONFIG.cell,
            targetX: c * CONFIG.cell, targetY: r * CONFIG.cell
        };
    }

    log(msg, type) {
        const div = document.createElement('div');
        div.className = `log-entry log-${type}`;
        div.innerText = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${msg}`;
        const container = document.getElementById('log-container');
        container.prepend(div);
    }

    updateUI() {
        const display = document.getElementById('turn-display');
        if (this.isThinking) {
            display.innerText = CONFIG.UI_TEXT.aiThinking;
            display.style.color = "var(--neon-green)";
        } else {
            display.innerText = this.turn === 'red' ? CONFIG.UI_TEXT.redTurn : CONFIG.UI_TEXT.blueTurn;
            display.style.color = this.turn === 'red' ? "var(--neon-red)" : "var(--neon-blue)";
        }
    }

    triggerRedraw() { this.needsRedraw = true; }

    isRiver(r, c) { return CONFIG.rivers.some(rv => rv[0] === r && rv[1] === c); }

    // 主线程不保存任何规则实现：一律委托 rules.js（P2-1）
    // p 为主棋盘棋子（行列坐标），rules 使用列优先坐标（x=列, y=行）。
    canMove(p, tr, tc, board = this.board) {
        return AnimalChessRules.canMove(this.getAiCompatibleMap(board), p.c, p.r, tc, tr);
    }

    // --- 冠军 AI 引擎系统 (Worker 异步重构版) ---

    aiAction() {
        this.isThinking = true;
        this.updateUI();

        const aiMap = this.getAiCompatibleMap();
        this.aiWorker.postMessage({
            map: aiMap,
            personality: this.personality,
            maxTime: this.personality === 'aggressive' ? 1500 : 500,
            requestId: this.gameId
        });
    }

    // 把主棋盘（行优先、棋子带颜色字符串）转成规则/AI 通用的列优先棋盘。
    // 这个结构同时就是 rules.js 的输入，避免再写一套坐标换算之外的规则。
    getAiCompatibleMap(board = this.board) {
        const aiMap = [];
        for (let x = 0; x < CONFIG.cols; x++) {
            aiMap[x] = [];
            for (let y = 0; y < CONFIG.rows; y++) {
                const p = board[y][x];
                aiMap[x][y] = {
                    animal: p ? {
                        rank: p.rank,
                        color: p.color === 'blue' ? 0 : 1, // 0: 蓝色 (AI), 1: 红色
                        point: { x, y }
                    } : null,
                    terrain: this.isRiver(y, x) ? 'water' : 'land',
                    trap: this.getAiTrapSide(y, x),
                    base: this.getAiBaseSide(y, x)
                };
            }
        }
        return aiMap;
    }

    getAiTrapSide(r, c) {
        const trap = CONFIG.traps.find(t => t.r === r && t.c === c);
        return trap ? (trap.side === 'blue' ? 0 : 1) : -1;
    }

    getAiBaseSide(r, c) {
        const den = CONFIG.dens.find(d => d.r === r && d.c === c);
        return den ? (den.side === 'blue' ? 0 : 1) : -1;
    }

    isGameOver(board) { return this.isDenOccupied(board, 'red') || this.isDenOccupied(board, 'blue'); }

    isDenOccupied(board, color) {
        const enemyDen = CONFIG.dens.find(d => d.side !== color);
        const p = board[enemyDen.r][enemyDen.c];
        return p && p.color === color;
    }

    simulateMove(board, move) {
        const nextBoard = board.map(row => [...row]);
        nextBoard[move.p.r][move.p.c] = null;
        nextBoard[move.tr][move.tc] = { ...move.p, r: move.tr, c: move.tc };
        return nextBoard;
    }

    // 合法走法同样来自 rules.js；这里只把列优先坐标映射回主棋盘棋子对象
    getAllValidMoves(color, board = this.board) {
        const rulesBoard = this.getAiCompatibleMap(board);
        const colorIndex = color === 'blue' ? 0 : 1;
        return AnimalChessRules.getAllLegalMoves(rulesBoard, colorIndex).map(m => ({
            p: board[m.y1][m.x1],
            tr: m.y2,
            tc: m.x2
        }));
    }

    // 统计某一方剩余棋子数（用于「吃光判负」）
    countPieces(board, color) {
        return board.flat().filter(p => p && p.color === color).length;
    }

    // 某一方是否还有合法走法（用于「无子可动判和」）
    hasLegalMoves(color, board = this.board) {
        return this.getAllValidMoves(color, board).length > 0;
    }

    // --- 渲染系统 ---

    draw() {
        const { ctx, canvas } = this;
        this.pulse = (this.pulse + 0.05) % (Math.PI * 2);
        if (!this.needsRedraw && !this.isStateAnimating()) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.03)';
        for (let i = 0; i <= CONFIG.cols; i++) {
            ctx.beginPath(); ctx.moveTo(i * CONFIG.cell, 0); ctx.lineTo(i * CONFIG.cell, canvas.height); ctx.stroke();
        }
        for (let i = 0; i <= CONFIG.rows; i++) {
            ctx.beginPath(); ctx.moveTo(0, i * CONFIG.cell); ctx.lineTo(canvas.width, i * CONFIG.cell); ctx.stroke();
        }

        CONFIG.rivers.forEach(([r, c]) => {
            const x = c * CONFIG.cell, y = r * CONFIG.cell;
            ctx.fillStyle = 'rgba(0, 242, 254, 0.08)';
            ctx.fillRect(x + 2, y + 2, CONFIG.cell - 4, CONFIG.cell - 4);
            ctx.strokeStyle = `rgba(0, 242, 254, ${0.15 + Math.sin(this.pulse) * 0.05})`;
            ctx.strokeRect(x + 4, y + 4, CONFIG.cell - 8, CONFIG.cell - 8);
        });

        CONFIG.traps.forEach(t => {
            const x = t.c * CONFIG.cell, y = t.r * CONFIG.cell;
            ctx.strokeStyle = t.side === 'red' ? 'rgba(255, 77, 77, 0.4)' : 'rgba(0, 242, 254, 0.4)';
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(x + 10, y + 10, CONFIG.cell - 20, CONFIG.cell - 20);
            ctx.setLineDash([]);
        });

        CONFIG.dens.forEach(d => {
            const x = d.c * CONFIG.cell + CONFIG.cell / 2, y = d.r * CONFIG.cell + CONFIG.cell / 2;
            const color = d.side === 'red' ? '#ff4d4d' : '#00f2fe';
            ctx.beginPath();
            ctx.arc(x, y, 20 + Math.sin(this.pulse) * 4, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, 12, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
        });

        this.board.flat().forEach(p => {
            if (!p) return;
            p.x += (p.targetX - p.x) * 0.25;
            p.y += (p.targetY - p.y) * 0.25;
            const color = p.color === 'red' ? '#ff4d4d' : '#00f2fe';
            const centerX = p.x + CONFIG.cell / 2, centerY = p.y + CONFIG.cell / 2;

            if (this.selected === p) {
                ctx.beginPath();
                ctx.arc(centerX, centerY, CONFIG.cell / 2 - 5, 0, Math.PI * 2);
                ctx.strokeStyle = "white";
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            ctx.fillStyle = '#111322';
            ctx.beginPath();
            ctx.roundRect(p.x + 10, p.y + 10, CONFIG.cell - 20, CONFIG.cell - 20, 15);
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = color;
            ctx.font = "bold 20px sans-serif"; // 使用标准无衬线字体
            ctx.textAlign = "center";
            ctx.fillText(p.name, centerX, centerY + 7);
        });

        if (!this.isStateAnimating()) this.needsRedraw = false;
    }

    isStateAnimating() {
        return this.board.flat().some(p => p && (Math.abs(p.x - p.targetX) > 0.5 || Math.abs(p.y - p.targetY) > 0.5));
    }

    animate() {
        this.draw();
        requestAnimationFrame(() => this.animate());
    }

    executeMove(p, tr, tc) {
        const target = this.board[tr][tc];
        if (target) {
            const side = p.color === 'red' ? CONFIG.UI_TEXT.redBrief : CONFIG.UI_TEXT.blueBrief;
            this.log(CONFIG.UI_TEXT.eatAction(side, p.name, target.name), p.color);
        }

        this.board[p.r][p.c] = null;
        p.r = tr; p.c = tc;
        p.targetX = tc * CONFIG.cell;
        p.targetY = tr * CONFIG.cell;
        this.board[tr][tc] = p;

        if (this.isDenOccupied(this.board, p.color)) return this.win(p.color);

        // 吃光对方棋子：直接判负（原实现只判兽穴，极小概率会出现一方已无子却继续下）
        const foeColor = p.color === 'red' ? 'blue' : 'red';
        if (this.countPieces(this.board, foeColor) === 0) return this.win(p.color);

        this.turn = this.turn === 'red' ? 'blue' : 'red';
        this.selected = null;
        this.isThinking = false;
        this.updateUI();
        this.triggerRedraw();

        // 轮到走棋的一方无合法走法：判和，避免棋局卡死
        if (!this.hasLegalMoves(this.turn)) return this.drawGame(this.turn);

        if (this.mode === 'pve' && this.turn === 'blue' && !this.gameOver) {
            this.aiAction();
        }
    }

    bindEvents() {
        this.canvas.addEventListener('click', e => {
            if (this.gameOver || this.isThinking) return;
            const rect = this.canvas.getBoundingClientRect();
            const c = Math.floor((e.clientX - rect.left) / CONFIG.cell);
            const r = Math.floor((e.clientY - rect.top) / CONFIG.cell);

            const clicked = this.board[r][c];
            if (this.selected) {
                if (this.canMove(this.selected, r, c)) {
                    this.executeMove(this.selected, r, c);
                } else if (clicked && clicked.color === this.turn) {
                    this.selected = clicked;
                    this.triggerRedraw();
                } else {
                    this.shakeEffect();
                    this.selected = null;
                    this.triggerRedraw();
                }
            } else if (clicked && clicked.color === this.turn) {
                this.selected = clicked;
                this.triggerRedraw();
            }
        });

        document.getElementById('btn-reset').onclick = () => this.init();
        document.getElementById('btn-restart-win').onclick = () => this.init();
        document.getElementById('btn-pve').onclick = (e) => { this.mode = 'pve'; this.setActiveBtn(e.target); this.init(); };
        document.getElementById('btn-pvp').onclick = (e) => { this.mode = 'pvp'; this.setActiveBtn(e.target); this.init(); };

        // AI 性格切换
        document.getElementById('ai-personality').onchange = (e) => {
            this.personality = e.target.value;
            const pName = this.personality === 'aggressive' ? CONFIG.UI_TEXT.aggressive : CONFIG.UI_TEXT.conservative;
            this.log(CONFIG.UI_TEXT.aiSwitch(pName), "system");
        };
    }

    setActiveBtn(target) {
        document.querySelectorAll('.btn-group button').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
    }

    shakeEffect() {
        const el = document.getElementById('app');
        el.classList.add('shake');
        setTimeout(() => el.classList.remove('shake'), 400);
    }

    elapsedText() {
        const totalTime = Math.floor((Date.now() - this.startTime) / 1000);
        const mins = Math.floor(totalTime / 60).toString().padStart(2, '0');
        const secs = (totalTime % 60).toString().padStart(2, '0');
        return CONFIG.UI_TEXT.timeTaken(mins, secs);
    }

    win(side) {
        this.gameOver = true;
        this.isThinking = false;

        const overlay = document.getElementById('victory-overlay');
        const title = document.getElementById('victory-title');
        const msg = document.getElementById('victory-msg');
        const time = document.getElementById('victory-time');

        title.innerText = CONFIG.UI_TEXT.victoryTitle;
        title.style.background = side === 'red' ? "linear-gradient(to bottom, #ff4d4d, #aa0000)" : "linear-gradient(to bottom, #00f2fe, #0055ff)";
        title.style.webkitBackgroundClip = "text";

        const sideText = side === 'red' ? CONFIG.UI_TEXT.redSide : CONFIG.UI_TEXT.blueSide;
        msg.innerText = CONFIG.UI_TEXT.victory(sideText);
        msg.style.color = side === 'red' ? "var(--neon-red)" : "var(--neon-blue)";
        time.innerText = this.elapsedText();

        overlay.classList.remove('hidden');
        this.log(CONFIG.UI_TEXT.gameEnd(sideText), 'system');
        this.triggerRedraw();
    }

    // 和棋：一方无子可动（含 AI 搜索确认无合法走法）
    drawGame(side) {
        this.gameOver = true;
        this.isThinking = false;
        this.selected = null;

        const overlay = document.getElementById('victory-overlay');
        const title = document.getElementById('victory-title');
        const msg = document.getElementById('victory-msg');
        const time = document.getElementById('victory-time');
        const sideText = side === 'red' ? CONFIG.UI_TEXT.redSide : CONFIG.UI_TEXT.blueSide;

        title.innerText = CONFIG.UI_TEXT.drawTitle;
        title.style.background = "linear-gradient(to bottom, #ffd166, #f77f00)";
        title.style.webkitBackgroundClip = "text";

        msg.innerText = CONFIG.UI_TEXT.drawReason(sideText);
        msg.style.color = "var(--neon-green)";
        time.innerText = this.elapsedText();

        overlay.classList.remove('hidden');
        this.log(CONFIG.UI_TEXT.drawLog(sideText), 'system');

        const display = document.getElementById('turn-display');
        display.innerText = CONFIG.UI_TEXT.drawTurn;
        display.style.color = "var(--neon-green)";

        this.triggerRedraw();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});