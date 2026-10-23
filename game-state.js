/**
 * 斗兽棋 Pro - 棋局状态（P2-3 从 Game 拆出的「规则/状态」职责）
 *
 * 这一层只负责：棋盘数据、走子合法性（委托 rules.js）、走子应用、终局判定。
 * 不碰 DOM、不碰 canvas、不碰 Worker —— 渲染见 renderer.js，编排见 game.js。
 *
 * 坐标约定：
 *   - 主棋盘 board[y][x]（行优先），棋子 { rank, color: 'red'|'blue', r, c, ... }
 *   - 交给 rules.js / AI 时用 getAiCompatibleMap() 转成列优先 board[x][y]
 *
 * 本文件必须在 rules.js、config.js 之后加载。
 */
(function (root) {
    'use strict';

    class AnimalChessGameState {
        /**
         * @param {{BOARD:{rows:number,cols:number,cell:number}, RULES:object, UI_TEXT:object}} config
         */
        constructor(config) {
            if (!config || !config.BOARD || !config.RULES) {
                throw new Error('AnimalChessGameState 需要 AnimalChessConfig（config.js 未加载？）');
            }
            this.config = config;
            this.rows = config.BOARD.rows;
            this.cols = config.BOARD.cols;
            this.cell = config.BOARD.cell;
            this.reset();
        }

        // rules.js 是唯一规则实现来源；这里按需取全局，避免复制一份规则
        get rules() {
            return root.AnimalChessRules;
        }

        reset() {
            this.board = Array(this.rows).fill().map(() => Array(this.cols).fill(null));
            this.turn = 'red';
            this.gameOver = false;
            this.selected = null;
            this.startTime = Date.now();
            this.setupPieces();
        }

        setupPieces() {
            const starts = this.config.RULES.startPositions;
            starts.blue.forEach(([r, c, rank]) => this.addPiece(r, c, rank, 'blue'));
            starts.red.forEach(([r, c, rank]) => this.addPiece(r, c, rank, 'red'));
        }

        addPiece(r, c, rank, color) {
            this.board[r][c] = {
                rank,
                color,
                r,
                c,
                name: this.config.UI_TEXT.animalNames[rank - 1],
                x: c * this.cell,
                y: r * this.cell,
                targetX: c * this.cell,
                targetY: r * this.cell
            };
            return this.board[r][c];
        }

        isRiver(r, c) {
            return this.config.RULES.rivers.some((rv) => rv[0] === r && rv[1] === c);
        }

        getAiTrapSide(r, c) {
            const trap = this.config.RULES.traps.find((t) => t.r === r && t.c === c);
            return trap ? (trap.side === 'blue' ? 0 : 1) : -1;
        }

        getAiBaseSide(r, c) {
            const den = this.config.RULES.dens.find((d) => d.r === r && d.c === c);
            return den ? (den.side === 'blue' ? 0 : 1) : -1;
        }

        // 把主棋盘（行优先、棋子带颜色字符串）转成规则/AI 通用的列优先棋盘。
        // 这个结构同时就是 rules.js 的输入，规则本身不在这里实现。
        getAiCompatibleMap(board = this.board) {
            const aiMap = [];
            for (let x = 0; x < this.cols; x++) {
                aiMap[x] = [];
                for (let y = 0; y < this.rows; y++) {
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

        // p 为主棋盘棋子（行列坐标），rules 使用列优先坐标（x=列, y=行）
        canMove(p, tr, tc, board = this.board) {
            return this.rules.canMove(this.getAiCompatibleMap(board), p.c, p.r, tc, tr);
        }

        // 合法走法同样来自 rules.js；这里只把列优先坐标映射回主棋盘棋子对象
        getAllValidMoves(color, board = this.board) {
            const rulesBoard = this.getAiCompatibleMap(board);
            const colorIndex = color === 'blue' ? 0 : 1;
            return this.rules.getAllLegalMoves(rulesBoard, colorIndex).map((m) => ({
                p: board[m.y1][m.x1],
                tr: m.y2,
                tc: m.x2
            }));
        }

        // 统计某一方剩余棋子数（用于「吃光判负」）
        countPieces(board, color) {
            return board.flat().filter((p) => p && p.color === color).length;
        }

        // 某一方是否还有合法走法（用于「无子可动判和」）
        hasLegalMoves(color, board = this.board) {
            return this.getAllValidMoves(color, board).length > 0;
        }

        isDenOccupied(board, color) {
            const enemyDen = this.config.RULES.dens.find((d) => d.side !== color);
            const p = board[enemyDen.r][enemyDen.c];
            return !!(p && p.color === color);
        }

        isGameOver(board) {
            return this.isDenOccupied(board, 'red') || this.isDenOccupied(board, 'blue');
        }

        simulateMove(board, move) {
            const nextBoard = board.map((row) => [...row]);
            nextBoard[move.p.r][move.p.c] = null;
            nextBoard[move.tr][move.tc] = { ...move.p, r: move.tr, c: move.tc };
            return nextBoard;
        }

        /**
         * 应用一步合法走法（调用前应已用 canMove 校验）。
         * 返回 { captured, winner?, draw? }：
         *   captured 被吃掉的棋子（可能为 null）
         *   winner   获胜方（进入对方兽穴 / 吃光对方棋子）
         *   draw     无子可动的一方（判和）
         * @returns {{captured: object|null, winner?: string, draw?: string}}
         */
        applyMove(p, tr, tc) {
            const captured = this.board[tr][tc] || null;
            this.board[p.r][p.c] = null;
            p.r = tr;
            p.c = tc;
            p.targetX = tc * this.cell;
            p.targetY = tr * this.cell;
            this.board[tr][tc] = p;
            this.selected = null;

            if (this.isDenOccupied(this.board, p.color)) {
                this.gameOver = true;
                return { captured, winner: p.color };
            }

            // 吃光对方棋子：直接判负（原实现只判兽穴，极小概率会出现一方已无子却继续下）
            const foeColor = p.color === 'red' ? 'blue' : 'red';
            if (this.countPieces(this.board, foeColor) === 0) {
                this.gameOver = true;
                return { captured, winner: p.color };
            }

            this.turn = this.turn === 'red' ? 'blue' : 'red';

            // 轮到走棋的一方无合法走法：判和，避免棋局卡死
            if (!this.hasLegalMoves(this.turn)) {
                this.gameOver = true;
                return { captured, draw: this.turn };
            }

            return { captured };
        }
    }

    root.AnimalChessGameState = AnimalChessGameState;
})(typeof self !== 'undefined' ? self : globalThis);
