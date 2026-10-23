/**
 * 斗兽棋 Pro - 游戏编排入口（P2-3 拆分后）
 * 版本: 2.6.1 (冠军 AI 核心)
 *
 * 职责只剩「编排」：DOM 事件、UI 文案、日志、AI Worker 通信、动画循环。
 *   - 配置数据：config.js（AnimalChessConfig）
 *   - 棋盘状态与规则委托：game-state.js（AnimalChessGameState → rules.js）
 *   - 渲染：renderer.js（AnimalChessRenderer）
 *   - AI：ai-worker.js（AnimalChessAiEngine，运行在 Worker Blob 中）
 *
 * game.js 仍是页面入口：index.html 最后加载它并在 DOMContentLoaded 时 new Game()。
 */
const CONFIG = AnimalChessConfig;

class Game {
    constructor() {
        if (!AnimalChessConfig || !AnimalChessRules || !AnimalChessRenderer || !AnimalChessGameState) {
            throw new Error('config.js / rules.js / renderer.js / game-state.js 未按顺序加载');
        }

        this.canvas = document.getElementById('gameCanvas');
        this.state = new AnimalChessGameState(AnimalChessConfig);
        this.renderer = new AnimalChessRenderer(this.canvas, AnimalChessConfig);

        // AI 引擎只存在于 ai-worker.js：这里把规则源码 + 引擎工厂序列化进 Blob，
        // 因此 Worker 内的规则和页面完全同源，同时不需要 fetch / 构建步骤。
        const workerSource = [
            AnimalChessRules.source,
            '(' + AnimalChessAiEngine.toString() + ')(self, self.AnimalChessRules);'
        ].join('\n');
        const blob = new Blob([workerSource], { type: 'application/javascript' });
        this.aiWorker = new Worker(URL.createObjectURL(blob));

        this.aiWorker.onmessage = (e) => {
            const { point: decision, requestId } = e.data;
            // 重新开始/新开一局会递增 gameId：旧棋局的迟到回包直接丢弃，避免污染新棋盘
            if (requestId !== this.gameId) return;
            if (decision) {
                const { x1, y1, x2, y2 } = decision;
                const p = this.state.board[y1] && this.state.board[y1][x1];
                if (p && p.color === 'blue' && this.state.turn === 'blue' && !this.state.gameOver) {
                    this.executeMove(p, y2, x2);
                } else {
                    this.isThinking = false;
                    this.updateUI();
                }
            } else {
                // Worker 兜底后仍无走法：AI 无子可动，判和
                this.isThinking = false;
                if (!this.state.gameOver) this.drawGame('blue');
            }
        };

        this.mode = 'pve';
        this.personality = 'aggressive';
        this.isThinking = false;
        this.gameId = 0;

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
        this.state.reset();

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
            display.innerText = this.state.turn === 'red' ? CONFIG.UI_TEXT.redTurn : CONFIG.UI_TEXT.blueTurn;
            display.style.color = this.state.turn === 'red' ? "var(--neon-red)" : "var(--neon-blue)";
        }
    }

    triggerRedraw() { this.renderer.requestRedraw(); }

    // --- 状态/规则委托（实现见 game-state.js → rules.js） ---

    canMove(p, tr, tc, board = this.state.board) {
        return this.state.canMove(p, tr, tc, board);
    }

    getAllValidMoves(color, board = this.state.board) {
        return this.state.getAllValidMoves(color, board);
    }

    hasLegalMoves(color, board = this.state.board) {
        return this.state.hasLegalMoves(color, board);
    }

    countPieces(board, color) {
        return this.state.countPieces(board, color);
    }

    getAiCompatibleMap(board = this.state.board) {
        return this.state.getAiCompatibleMap(board);
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

    // --- 渲染驱动 ---

    draw() {
        this.renderer.draw(this.state.board, this.state.selected);
    }

    animate() {
        this.draw();
        requestAnimationFrame(() => this.animate());
    }

    executeMove(p, tr, tc) {
        const result = this.state.applyMove(p, tr, tc);

        if (result.captured) {
            const side = p.color === 'red' ? CONFIG.UI_TEXT.redBrief : CONFIG.UI_TEXT.blueBrief;
            this.log(CONFIG.UI_TEXT.eatAction(side, p.name, result.captured.name), p.color);
        }

        if (result.winner) return this.win(result.winner);

        this.isThinking = false;
        this.updateUI();
        this.triggerRedraw();

        if (result.draw) return this.drawGame(result.draw);

        if (this.mode === 'pve' && this.state.turn === 'blue' && !this.state.gameOver) {
            this.aiAction();
        }
    }

    bindEvents() {
        this.canvas.addEventListener('click', e => {
            if (this.state.gameOver || this.isThinking) return;
            const rect = this.canvas.getBoundingClientRect();
            const c = Math.floor((e.clientX - rect.left) / CONFIG.BOARD.cell);
            const r = Math.floor((e.clientY - rect.top) / CONFIG.BOARD.cell);

            const clicked = this.state.board[r][c];
            if (this.state.selected) {
                if (this.canMove(this.state.selected, r, c)) {
                    this.executeMove(this.state.selected, r, c);
                } else if (clicked && clicked.color === this.state.turn) {
                    this.state.selected = clicked;
                    this.triggerRedraw();
                } else {
                    this.shakeEffect();
                    this.state.selected = null;
                    this.triggerRedraw();
                }
            } else if (clicked && clicked.color === this.state.turn) {
                this.state.selected = clicked;
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
        const totalTime = Math.floor((Date.now() - this.state.startTime) / 1000);
        const mins = Math.floor(totalTime / 60).toString().padStart(2, '0');
        const secs = (totalTime % 60).toString().padStart(2, '0');
        return CONFIG.UI_TEXT.timeTaken(mins, secs);
    }

    win(side) {
        this.state.gameOver = true;
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
        this.state.gameOver = true;
        this.isThinking = false;
        this.state.selected = null;

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
