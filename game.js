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

        const workerCode = `
// 判定是否可以捕食
function canEat(animal, foe, trap) {
    if (trap === animal.color) return true; // 陷阱中的棋子等级为0，任何棋子皆可捕食
    if (animal.rank === 1 && foe.rank === 8) return true; // 鼠吃象
    if (animal.rank === 8 && foe.rank === 1) return false; // 象不吃鼠
    return animal.rank >= foe.rank; // 正常等级判定
}

// 狮虎跨河机动性评分
function ai_lionTigerMobility(animal) {
    let minDistance = 1000;
    [[3, 3], [3, 4], [3, 5]].forEach(point => {
        let tempDist = Math.abs(animal.point.x - point[0]) + Math.abs(animal.point.y - point[1]);
        minDistance = Math.min(minDistance, tempDist);
    });
    return 0.05 - 0.01 * minDistance;
}

// 静态局面评估函数 (SBE)
function ai_sbe(map, ply, aiturn) {
    const neg = 1; 
    const cost = ply * 0.1 * neg;
    if (map[3][0].animal) return -2000 * neg + cost; // 蓝方兽穴被占
    if (map[3][8].animal) return 2000 * neg + cost;  // 红方兽穴被占

    let a = 0, b = 0;
    let mouseA = null, mouseB = null, elephantA = null, elephantB = null;
    let tigerA = null, tigerB = null, lionA = null, lionB = null;

    // 遍历棋盘统计分值
    for (let x = 0; x < 7; x++) {
        for (let y = 0; y < 9; y++) {
            const cell = map[x][y];
            if (!cell.animal) continue;
            const anim = cell.animal;
            const score = (anim.rank === 1 ? 6 : 0) + anim.rank;
            if (anim.color === 0) {
                a += score;
                if (anim.rank === 1) mouseA = anim;
                else if (anim.rank === 6) tigerA = anim;
                else if (anim.rank === 7) lionA = anim;
                else if (anim.rank === 8) elephantA = anim;
            } else {
                b += score;
                if (anim.rank === 1) mouseB = anim;
                else if (anim.rank === 6) tigerB = anim;
                else if (anim.rank === 7) lionB = anim;
                else if (anim.rank === 8) elephantB = anim;
            }
        }
    }

    let returnValue = a - b;
    // 鼠吃象追踪逻辑
    if (mouseA && elephantB && map[mouseA.point.x][mouseA.point.y].terrain !== "water") {
        const dist = Math.abs(mouseA.point.x - elephantB.point.x) + Math.abs(mouseA.point.y - elephantB.point.y);
        if (dist <= 1 || (dist <= 2 && aiturn)) returnValue += (dist === 1 && aiturn ? 7.5 : 3.5);
    }
    if (mouseB && elephantA && map[mouseB.point.x][mouseB.point.y].terrain !== "water") {
        const dist = Math.abs(mouseB.point.x - elephantA.point.x) + Math.abs(mouseB.point.y - elephantA.point.y);
        if (dist <= 1 || (dist <= 2 && !aiturn)) returnValue -= (dist === 1 && !aiturn ? 7.5 : 3.5);
    }

    // 象向对方底线推进倾向
    if (elephantA) returnValue -= (0.01 * Math.abs(0 - elephantA.point.y));
    if (elephantB) returnValue += (0.01 * Math.abs(8 - elephantB.point.y));

    // 狮虎机动性加成
    if (lionA) returnValue += ai_lionTigerMobility(lionA);
    if (lionB) returnValue -= ai_lionTigerMobility(lionB);
    if (tigerA) returnValue += ai_lionTigerMobility(tigerA);
    if (tigerB) returnValue -= ai_lionTigerMobility(tigerB);

    return returnValue + cost;
}

// 快速终结状态判定
function ai_exitSbe(map, ply, aiturn) {
    const neg = 1;
    const blueTurn = aiturn;
    ply++;

    if (map[3][0].animal) return -2000 * ply * neg;
    if (map[3][8].animal) return 2000 * ply * neg;

    let blueCount = 0, redCount = 0;
    let blueAnims = [], redAnims = [];
    for (let x = 0; x < 7; x++) {
        for (let y = 0; y < 9; y++) {
            if (map[x][y].animal) {
                if (map[x][y].animal.color === 0) { blueCount++; blueAnims.push(map[x][y].animal); }
                else { redCount++; redAnims.push(map[x][y].animal); }
            }
        }
    }

    if (blueCount === 0) return 5000 * ply * neg;
    if (redCount === 0) return -5000 * ply * neg;

    // 陷阱防御判定
    for (const blue of blueAnims) {
        if (map[blue.point.x][blue.point.y].trap === 1) {
            let safe = true;
            for (const red of redAnims) {
                if (Math.abs(blue.point.x - red.point.x) + Math.abs(blue.point.y - red.point.y) <= 1) { safe = false; break; }
            }
            if (!safe && !blueTurn) return -1000 * ply * neg;
        }
    }
    return null;
}

// 获取启发式排序后的移动列表
function getOrderedMoves(map, animal) {
    let possibleMoves = [];
    const moves = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    let x1 = animal.point.x;
    let y1 = animal.point.y;
    
    for (const val of moves) {
        let x2 = x1 + val[0];
        let y2 = y1 + val[1];
        let possible = false;
        let score = 0;

        if (x2 >= 0 && x2 <= 6 && y2 >= 0 && y2 <= 8) {
            const foe = map[x2][y2].animal;
            if (!foe) {
                if (map[x2][y2].base !== -1) {
                    if (map[x2][y2].base !== animal.color) {
                        possible = true;
                        score = 1000; // 进洞优先级最高
                    }
                } else if (map[x2][y2].terrain === 'land' || animal.rank === 1) {
                    possible = true;
                    if (y2 >= 3 && y2 <= 5) score += 5; // 抢占中心区域
                } else if (animal.rank === 6 || animal.rank === 7) {
                    // 狮虎跳河逻辑
                    let valid = true;
                    let tx = x2, ty = y2;
                    while (map[tx][ty].terrain !== 'land') {
                        if (map[tx][ty].animal) { valid = false; break; }
                        tx += val[0]; ty += val[1];
                        if (tx < 0 || tx > 6 || ty < 0 || ty > 8) { valid = false; break; }
                    }
                    if (valid) {
                        const finalFoe = map[tx][ty].animal;
                        if (!finalFoe || (canEat(animal, finalFoe, map[tx][ty].trap) && finalFoe.color !== animal.color)) {
                            possible = true;
                            x2 = tx; y2 = ty;
                            if (finalFoe) score = 100 + finalFoe.rank * 10;
                        }
                    }
                }
            } else if (foe.color !== animal.color) {
                // 捕食逻辑
                if (canEat(animal, foe, map[x2][y2].trap) && (map[x1][y1].terrain === map[x2][y2].terrain)) {
                    possible = true;
                    score = 100 + foe.rank * 10;
                }
            }
        }
        if (possible) possibleMoves.push({ x1, y1, x2, y2, score });
    }
    possibleMoves.sort((a, b) => b.score - a.score);
    return possibleMoves;
}

let isTimeUp = false;
let bestDecisionGlobal = null;

// Alpha-Beta 剪枝深度搜索
function alphaBetaPruning(map, ply, alpha, beta, aiturn, maxPly, startTime, maxTime) {
    if (Date.now() - startTime >= maxTime) {
        isTimeUp = true;
        return 0;
    }

    const isExit = ai_exitSbe(map, ply, aiturn);
    if (isExit !== null) return isExit;

    if (ply === 0) return ai_sbe(map, ply, aiturn);

    let bestVal = aiturn ? -100000 : 100000;
    
    let allMoves = [];
    for (let x1 = 0; x1 < 7; x1++) {
        for (let y1 = 0; y1 < 9; y1++) {
            const cell = map[x1][y1];
            if (!cell.animal) continue;
            if ((aiturn && cell.animal.color === 0) || (!aiturn && cell.animal.color !== 0)) {
                allMoves.push(...getOrderedMoves(map, cell.animal));
            }
        }
    }
    
    allMoves.sort((a, b) => b.score - a.score);

    for (const move of allMoves) {
        const { x1, y1, x2, y2 } = move;
        const movingAnimal = map[x1][y1].animal;
        const targetAnimal = map[x2][y2].animal;
        
        // 模拟移动
        map[x1][y1].animal = null;
        map[x2][y2].animal = movingAnimal;
        movingAnimal.point.x = x2;
        movingAnimal.point.y = y2;

        const res = alphaBetaPruning(map, ply - 1, alpha, beta, !aiturn, maxPly, startTime, maxTime);

        // 回溯还原
        map[x1][y1].animal = movingAnimal;
        map[x2][y2].animal = targetAnimal;
        movingAnimal.point.x = x1;
        movingAnimal.point.y = y1;

        if (isTimeUp) return 0;

        if (aiturn) {
            if (res > bestVal) {
                bestVal = res;
                if (ply === maxPly) bestDecisionGlobal = { x1, y1, x2, y2 };
            }
            alpha = Math.max(alpha, bestVal);
        } else {
            bestVal = Math.min(bestVal, res);
            beta = Math.min(beta, bestVal);
        }

        if (beta <= alpha) break; // 剪枝触发
    }

    return bestVal;
}

// 接收 Worker 消息
onmessage = function(e) {
    const { map, personality, maxTime = 1500 } = e.data;
    
    isTimeUp = false;
    let finalDecision = null;
    let maxDepth = personality === 'aggressive' ? 7 : 4; 
    let startTime = Date.now();

    // 迭代加深搜索
    for (let depth = 1; depth <= maxDepth; depth++) {
        bestDecisionGlobal = null;
        alphaBetaPruning(map, depth, -Infinity, Infinity, true, depth, startTime, maxTime);
        
        if (isTimeUp && depth > 1) {
            break; 
        }
        
        if (bestDecisionGlobal) {
            finalDecision = bestDecisionGlobal;
        }
        
        if (Date.now() - startTime >= maxTime * 0.8) {
            break;
        }
    }

    postMessage({ point: finalDecision });
}
`;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.aiWorker = new Worker(URL.createObjectURL(blob));
        
        this.aiWorker.onmessage = (e) => {
            const decision = e.data.point;
            if (decision) {
                const { x1, y1, x2, y2 } = decision;
                const p = this.board[y1][x1];
                if (p) {
                    this.executeMove(p, y2, x2);
                }
            } else {
                this.isThinking = false;
                this.updateUI();
            }
        };

        this.mode = 'pve';
        this.personality = 'aggressive';
        this.turn = 'red';
        this.board = [];
        this.selected = null;
        this.gameOver = false;
        this.isThinking = false;
        this.pulse = 0;
        this.startTime = Date.now();
        this.needsRedraw = true;
        this.turnCount = 1;
        this.particles = [];

        this.init();
        this.applyStaticText();
        this.bindEvents();
        this.updateStats();
        this.startTimer();
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
        this.board = Array(CONFIG.rows).fill().map(() => Array(CONFIG.cols).fill(null));
        this.turn = 'red';
        this.gameOver = false;
        this.selected = null;
        this.startTime = Date.now();
        this.turnCount = 1;
        this.particles = [];

        const bPos = [[0, 0, 8], [0, 6, 7], [0, 4, 6], [2, 4, 5], [2, 2, 4], [2, 6, 3], [1, 5, 2], [2, 0, 1]];
        bPos.forEach(p => this.addPiece(p[0], p[1], p[2], 'blue'));
        const rPos = [[8, 6, 8], [8, 0, 7], [8, 2, 6], [6, 2, 5], [6, 4, 4], [6, 0, 3], [7, 1, 2], [6, 6, 1]];
        rPos.forEach(p => this.addPiece(p[0], p[1], p[2], 'red'));

        document.getElementById('log-container').innerHTML = '';
        document.getElementById('victory-overlay').classList.add('hidden');
        document.querySelectorAll('.confetti').forEach(el => el.remove());

        // 读取界面设置
        const pSelect = document.getElementById('ai-personality');
        if (pSelect) this.personality = pSelect.value;

        const pName = this.personality === 'aggressive' ? CONFIG.UI_TEXT.aggressive : CONFIG.UI_TEXT.conservative;
        this.log(CONFIG.UI_TEXT.enterMode(pName, CONFIG.VERSION), "system");
        this.updateUI();
        this.updateStats();
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

    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            if (!this.gameOver) this.updateStats();
        }, 1000);
    }

    updateStats() {
        // 统计棋子数
        let redCount = 0, blueCount = 0;
        for (let r = 0; r < CONFIG.rows; r++) {
            for (let c = 0; c < CONFIG.cols; c++) {
                const p = this.board[r][c];
                if (p) {
                    if (p.color === 'red') redCount++;
                    else blueCount++;
                }
            }
        }

        // 计算时间
        const totalSec = Math.floor((Date.now() - this.startTime) / 1000);
        const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
        const s = (totalSec % 60).toString().padStart(2, '0');

        // 渲染 DOM
        const stats = document.getElementById('stats-panel');
        if (stats) {
            stats.innerHTML = `
                <div class="stat-row">
                    <div class="stat-item red-stat">
                        <div class="stat-dot" style="background:var(--neon-red);box-shadow:0 0 8px var(--neon-red)"></div>
                        <span class="stat-label">红方</span>
                        <span class="stat-value">${redCount}/8</span>
                    </div>
                    <div class="stat-item blue-stat">
                        <div class="stat-dot" style="background:var(--neon-blue);box-shadow:0 0 8px var(--neon-blue)"></div>
                        <span class="stat-label">蓝方</span>
                        <span class="stat-value">${blueCount}/8</span>
                    </div>
                </div>
                <div class="stat-row">
                    <div class="stat-item">
                        <span class="stat-mini">回合</span>
                        <span class="stat-num">${this.turnCount}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-mini">用时</span>
                        <span class="stat-num">${m}:${s}</span>
                    </div>
                </div>
            `;
        }
    }

    getValidMoves(p) {
        const moves = [];
        // 尝试四周 (狮虎跳河由 canMove 处理)
        for (let tr = 0; tr < CONFIG.rows; tr++) {
            for (let tc = 0; tc < CONFIG.cols; tc++) {
                if (this.canMove(p, tr, tc)) moves.push({ r: tr, c: tc });
            }
        }
        return moves;
    }

    spawnEatParticles(r, c, color) {
        const cx = c * CONFIG.cell + CONFIG.cell / 2;
        const cy = r * CONFIG.cell + CONFIG.cell / 2;
        const pColor = color === 'red' ? '#ff4d4d' : '#00f2fe';
        for (let i = 0; i < 20; i++) {
            const angle = (Math.PI * 2 * i) / 20 + Math.random() * 0.3;
            const speed = 2 + Math.random() * 4;
            this.particles.push({
                x: cx,
                y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: 0.02 + Math.random() * 0.02,
                size: 3 + Math.random() * 5,
                color: pColor
            });
        }
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08; // 轻微重力
            p.life -= p.decay;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    drawParticles(ctx) {
        this.particles.forEach(p => {
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 8;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        });
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }

    triggerRedraw() { this.needsRedraw = true; }

    isRiver(r, c) { return CONFIG.rivers.some(rv => rv[0] === r && rv[1] === c); }

    canMove(p, tr, tc, board = this.board) {
        if (tr < 0 || tr >= CONFIG.rows || tc < 0 || tc >= CONFIG.cols) return false;
        const dr = tr - p.r, dc = tc - p.c, dist = Math.abs(dr) + Math.abs(dc);
        const target = board[tr][tc];

        if (target && target.color === p.color) return false;
        const myDen = CONFIG.dens.find(d => d.side === p.color);
        if (tr === myDen.r && tc === myDen.c) return false;

        const targetInRiver = this.isRiver(tr, tc);

        if ((p.rank === 7 || p.rank === 6) && !targetInRiver && dist > 1) {
            if ((dr !== 0 && dc === 0) || (dc !== 0 && dr === 0)) {
                const sr = Math.sign(dr), sc = Math.sign(dc);
                let mr = p.r + sr, mc = p.c + sc;
                let riverCount = 0;
                while (mr !== tr || mc !== tc) {
                    if (!this.isRiver(mr, mc)) return false;
                    if (board[mr][mc]) return false;
                    riverCount++;
                    mr += sr; mc += sc;
                }
                return riverCount >= 1 && this.checkEat(p, target, tr, tc, board);
            }
        }

        if (dist !== 1) return false;
        if (targetInRiver && p.rank !== 1) return false;
        return this.checkEat(p, target, tr, tc, board);
    }

    checkEat(p, target, tr, tc, board) {
        if (!target) return true;
        const inOwnTrap = CONFIG.traps.some(t => t.r === tr && t.c === tc && t.side === p.color);
        if (inOwnTrap) return true;

        const pInRiver = this.isRiver(p.r, p.c);
        const targetInRiver = this.isRiver(tr, tc);

        // 其他情况在水中不能攻击陆地
        if (pInRiver && !targetInRiver) return false;

        if (p.rank === 1 && target.rank === 8) return true;
        if (p.rank === 8 && target.rank === 1) return false;
        return p.rank >= target.rank;
    }

    // --- 冠军 AI 引擎系统 (Worker 异步重构版) ---

    aiAction() {
        this.isThinking = true;
        this.updateUI();

        const aiMap = this.getAiCompatibleMap();
        this.aiWorker.postMessage({
            map: aiMap,
            personality: this.personality,
            maxTime: this.personality === 'aggressive' ? 1500 : 500
        });
    }

    getAiCompatibleMap() {
        const aiMap = [];
        for (let x = 0; x < CONFIG.cols; x++) {
            aiMap[x] = [];
            for (let y = 0; y < CONFIG.rows; y++) {
                const p = this.board[y][x];
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

    getAllValidMoves(color, board = this.board) {
        let moves = [];
        board.flat().forEach(p => {
            if (p && p.color === color) {
                const targets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                if (p.rank === 7 || p.rank === 6) targets.push([3, 0], [-3, 0], [0, 4], [0, -4]);
                targets.forEach(([dr, dc]) => {
                    const tr = p.r + dr, tc = p.c + dc;
                    if (this.canMove(p, tr, tc, board)) moves.push({ p, tr, tc });
                });
            }
        });
        return moves;
    }

    // --- 渲染系统 ---

    draw() {
        const { ctx, canvas } = this;
        this.pulse = (this.pulse + 0.05) % (Math.PI * 2);
        const hasParticles = this.particles.length > 0;
        if (!this.needsRedraw && !this.isStateAnimating() && !hasParticles) return;

        this.updateParticles();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // === 1. 发光网格线 ===
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.06)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= CONFIG.cols; i++) {
            ctx.beginPath(); ctx.moveTo(i * CONFIG.cell, 0); ctx.lineTo(i * CONFIG.cell, canvas.height); ctx.stroke();
        }
        for (let i = 0; i <= CONFIG.rows; i++) {
            ctx.beginPath(); ctx.moveTo(0, i * CONFIG.cell); ctx.lineTo(canvas.width, i * CONFIG.cell); ctx.stroke();
        }
        // 交叉点发光
        ctx.fillStyle = 'rgba(0, 242, 254, 0.1)';
        for (let i = 0; i <= CONFIG.cols; i++) {
            for (let j = 0; j <= CONFIG.rows; j++) {
                ctx.beginPath();
                ctx.arc(i * CONFIG.cell, j * CONFIG.cell, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // === 2. 河道 - 波纹动画 ===
        CONFIG.rivers.forEach(([r, c]) => {
            const x = c * CONFIG.cell, y = r * CONFIG.cell;
            // 水色渐变填充
            const waterGrad = ctx.createRadialGradient(
                x + CONFIG.cell / 2, y + CONFIG.cell / 2, 0,
                x + CONFIG.cell / 2, y + CONFIG.cell / 2, CONFIG.cell / 1.5
            );
            waterGrad.addColorStop(0, 'rgba(0, 200, 255, 0.2)');
            waterGrad.addColorStop(1, 'rgba(0, 120, 200, 0.05)');
            ctx.fillStyle = waterGrad;
            ctx.fillRect(x + 2, y + 2, CONFIG.cell - 4, CONFIG.cell - 4);

            // 动态波纹
            ctx.strokeStyle = `rgba(0, 242, 254, ${0.25 + Math.sin(this.pulse + r + c) * 0.1})`;
            ctx.lineWidth = 1;
            for (let w = 0; w < 2; w++) {
                const wy = y + CONFIG.cell * 0.35 + w * 18 + Math.sin(this.pulse * 2 + r + c + w) * 3;
                ctx.beginPath();
                ctx.moveTo(x + 10, wy);
                ctx.bezierCurveTo(
                    x + CONFIG.cell * 0.3, wy - 3,
                    x + CONFIG.cell * 0.5, wy + 3,
                    x + CONFIG.cell - 10, wy
                );
                ctx.stroke();
            }
        });

        // === 3. 陷阱 - X 锯齿图案 ===
        CONFIG.traps.forEach(t => {
            const x = t.c * CONFIG.cell, y = t.r * CONFIG.cell;
            const trapColor = t.side === 'red' ? '#ff4d4d' : '#00f2fe';
            const alpha = 0.35 + Math.sin(this.pulse + t.r) * 0.1;

            // 危险底色
            ctx.fillStyle = `rgba(${t.side === 'red' ? '255,77,77' : '0,242,254'}, 0.05)`;
            ctx.fillRect(x + 5, y + 5, CONFIG.cell - 10, CONFIG.cell - 10);

            // X 标记
            ctx.strokeStyle = `rgba(${t.side === 'red' ? '255,77,77' : '0,242,254'}, ${alpha})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            // 对角线 X
            ctx.beginPath();
            ctx.moveTo(x + 14, y + 14);
            ctx.lineTo(x + CONFIG.cell - 14, y + CONFIG.cell - 14);
            ctx.moveTo(x + CONFIG.cell - 14, y + 14);
            ctx.lineTo(x + 14, y + CONFIG.cell - 14);
            ctx.stroke();
            // 外边框虚线
            ctx.strokeRect(x + 8, y + 8, CONFIG.cell - 16, CONFIG.cell - 16);
            ctx.setLineDash([]);
        });

        // === 4. 兽穴 - 传送门发光效果 ===
        CONFIG.dens.forEach(d => {
            const cx = d.c * CONFIG.cell + CONFIG.cell / 2;
            const cy = d.r * CONFIG.cell + CONFIG.cell / 2;
            const color = d.side === 'red' ? '#ff4d4d' : '#00f2fe';

            // 多层脉冲光圈
            for (let i = 3; i >= 0; i--) {
                const radius = 30 + i * 6 + Math.sin(this.pulse + i) * 3;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(${d.side === 'red' ? '255,77,77' : '0,242,254'}, ${0.08 - i * 0.015})`;
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // 内圈发光
            ctx.shadowColor = color;
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.arc(cx, cy, 20 + Math.sin(this.pulse) * 3, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // 中心实心
            const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
            coreGrad.addColorStop(0, '#fff');
            coreGrad.addColorStop(0.3, color);
            coreGrad.addColorStop(1, `rgba(${d.side === 'red' ? '255,77,77' : '0,242,254'}, 0.1)`);
            ctx.beginPath();
            ctx.arc(cx, cy, 14, 0, Math.PI * 2);
            ctx.fillStyle = coreGrad;
            ctx.fill();
        });

        // === 5. 可走点提示 ===
        if (this.selected && this.selected.color === this.turn) {
            const moves = this.getValidMoves(this.selected);
            moves.forEach(m => {
                const mx = m.c * CONFIG.cell + CONFIG.cell / 2;
                const my = m.r * CONFIG.cell + CONFIG.cell / 2;
                const target = this.board[m.r][m.c];
                if (target) {
                    // 可捕食目标 - 红色方框警告
                    ctx.strokeStyle = `rgba(255, 80, 80, ${0.7 + Math.sin(this.pulse * 3) * 0.2})`;
                    ctx.lineWidth = 2.5;
                    ctx.setLineDash([]);
                    ctx.beginPath();
                    ctx.roundRect(m.c * CONFIG.cell + 6, m.r * CONFIG.cell + 6, CONFIG.cell - 12, CONFIG.cell - 12, 10);
                    ctx.stroke();
                } else {
                    // 普通可走点 - 发光圆点
                    const glow = 0.5 + Math.sin(this.pulse * 2 + m.r + m.c) * 0.25;
                    ctx.shadowColor = this.turn === 'red' ? '#ff4d4d' : '#00f2fe';
                    ctx.shadowBlur = 10;
                    ctx.fillStyle = `rgba(${this.turn === 'red' ? '255,77,77' : '0,242,254'}, ${glow})`;
                    ctx.beginPath();
                    ctx.arc(mx, my, 8, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;

                    // 内圈更亮
                    ctx.fillStyle = `rgba(255,255,255,${glow * 0.7})`;
                    ctx.beginPath();
                    ctx.arc(mx, my, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
        }

        // === 6. 棋子 ===
        this.board.flat().forEach(p => {
            if (!p) return;
            p.x += (p.targetX - p.x) * 0.25;
            p.y += (p.targetY - p.y) * 0.25;
            const color = p.color === 'red' ? '#ff4d4d' : '#00f2fe';
            const centerX = p.x + CONFIG.cell / 2, centerY = p.y + CONFIG.cell / 2;

            // 选中态：脉冲发光环
            if (this.selected === p) {
                const pulseR = CONFIG.cell / 2 - 4 + Math.sin(this.pulse * 2) * 2;
                ctx.shadowColor = color;
                ctx.shadowBlur = 20;
                ctx.beginPath();
                ctx.roundRect(p.x + 8, p.y + 8, CONFIG.cell - 16, CONFIG.cell - 16, 16);
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2.5;
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            // 棋子发光光晕
            ctx.shadowColor = color;
            ctx.shadowBlur = 15;

            // 棋子底色（深色玻璃质感）
            const grad = ctx.createLinearGradient(p.x + 10, p.y + 10, p.x + 10, p.y + CONFIG.cell - 10);
            grad.addColorStop(0, 'rgba(30, 33, 55, 0.9)');
            grad.addColorStop(0.5, 'rgba(17, 19, 34, 0.95)');
            grad.addColorStop(1, 'rgba(10, 12, 22, 1)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(p.x + 10, p.y + 10, CONFIG.cell - 20, CONFIG.cell - 20, 15);
            ctx.fill();

            ctx.shadowBlur = 0;

            // 棋子边框（霓虹发光）
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();

            // 顶部高光（模拟玻璃反光）
            ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.beginPath();
            ctx.roundRect(p.x + 12, p.y + 12, CONFIG.cell - 24, (CONFIG.cell - 24) * 0.4, [15, 15, 0, 0]);
            ctx.fill();

            // 棋子文字
            ctx.fillStyle = color;
            ctx.font = "bold 20px sans-serif";
            ctx.textAlign = "center";
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;
            ctx.fillText(p.name, centerX, centerY + 7);
            ctx.shadowBlur = 0;
        });

        // === 7. 粒子特效 (吃子) ===
        this.drawParticles(ctx);

        if (!this.isStateAnimating() && !hasParticles) this.needsRedraw = false;
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
            this.spawnEatParticles(tr, tc, target.color);
        }

        this.board[p.r][p.c] = null;
        p.r = tr; p.c = tc;
        p.targetX = tc * CONFIG.cell;
        p.targetY = tr * CONFIG.cell;
        this.board[tr][tc] = p;

        if (this.isDenOccupied(this.board, p.color)) return this.win(p.color);

        this.turn = this.turn === 'red' ? 'blue' : 'red';
        // 红方走后回合数+1
        if (this.turn === 'red') this.turnCount++;
        this.selected = null;
        this.isThinking = false;
        this.updateUI();
        this.updateStats();
        this.triggerRedraw();

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

    win(side) {
        this.gameOver = true;
        const totalTime = Math.floor((Date.now() - this.startTime) / 1000);
        const mins = Math.floor(totalTime / 60).toString().padStart(2, '0');
        const secs = (totalTime % 60).toString().padStart(2, '0');

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
        time.innerText = CONFIG.UI_TEXT.timeTaken(mins, secs);

        overlay.classList.remove('hidden');
        this.spawnConfetti(side === 'red' ? '#ff4d4d' : '#00f2fe');
        this.log(CONFIG.UI_TEXT.gameEnd(sideText), 'system');
        this.triggerRedraw();
    }

    spawnConfetti(mainColor) {
        const colors = [mainColor, '#00f2fe', '#ff4d4d', '#f9ca24', '#39ff14', '#a855f7', '#ffffff'];
        for (let i = 0; i < 60; i++) {
            const el = document.createElement('div');
            el.className = 'confetti';
            el.style.left = Math.random() * 100 + '%';
            el.style.background = colors[Math.floor(Math.random() * colors.length)];
            el.style.width = (6 + Math.random() * 8) + 'px';
            el.style.height = (6 + Math.random() * 8) + 'px';
            el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
            el.style.animationDuration = (2 + Math.random() * 3) + 's';
            el.style.animationDelay = Math.random() * 0.5 + 's';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 6000);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});