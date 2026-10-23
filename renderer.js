/**
 * 斗兽棋 Pro - 棋盘渲染（P2-3 从 Game 拆出的「渲染」职责）
 *
 * 只负责把「棋盘 + 选中状态」画到 canvas 上，不碰规则、不碰 DOM 事件、不碰 AI。
 * 棋盘状态由 game-state.js 提供，动画调度由 game.js 驱动。
 *
 * 本文件必须在 config.js 之后加载。
 */
(function (root) {
    'use strict';

    class AnimalChessRenderer {
        /**
         * @param {HTMLCanvasElement} canvas
         * @param {{BOARD:object, RULES:object}} config
         */
        constructor(canvas, config) {
            if (!canvas || typeof canvas.getContext !== 'function') {
                throw new Error('AnimalChessRenderer 需要 canvas');
            }
            if (!config || !config.BOARD || !config.RULES) {
                throw new Error('AnimalChessRenderer 需要 AnimalChessConfig（config.js 未加载？）');
            }
            this.canvas = canvas;
            this.config = config;
            this.cell = config.BOARD.cell;
            this.rows = config.BOARD.rows;
            this.cols = config.BOARD.cols;
            this.ctx = canvas.getContext('2d');

            // 画布尺寸（P3-3 DPR 适配在 game.js 中调用 adjustSize()）
            this.cssWidth = this.cols * this.cell;
            this.cssHeight = this.rows * this.cell;
            this.canvas.width = this.cssWidth;
            this.canvas.height = this.cssHeight;

            this.needsRedraw = true;
        }

        /**
         * P3-3：按 devicePixelRatio 缩放画布，高分屏清晰。
         * 应在 Game 初始化后调用一次。
         */
        adjustSize() {
            const dpr = window.devicePixelRatio || 1;
            this.canvas.style.width = this.cssWidth + 'px';
            this.canvas.style.height = this.cssHeight + 'px';
            this.canvas.width = Math.round(this.cssWidth * dpr);
            this.canvas.height = Math.round(this.cssHeight * dpr);
            this.ctx.scale(dpr, dpr);
        }

        /**
         * P3-1：当无棋子插值移动且无需重绘时可暂停 rAF 循环。
         */
        isIdle(board) {
            return !this.needsRedraw && !this.isAnimating(board);
        }

        requestRedraw() {
            this.needsRedraw = true;
        }

        // 是否还有棋子在向目标格做插值移动（需要继续画）
        isAnimating(board) {
            return board.flat().some((p) => p && (
                Math.abs(p.x - p.targetX) > 0.5 || Math.abs(p.y - p.targetY) > 0.5
            ));
        }

        /**
         * 绘制一帧。
         * @param {Array<Array<object|null>>} board 行优先主棋盘
         * @param {object|null} selected 当前选中棋子
         */
        draw(board, selected) {
            const { ctx, canvas } = this;
            const rules = this.config.RULES;
            const cell = this.cell;

            // P3-1/P3-2：河道与兽穴呼吸动画改用 CSS @keyframes（#river-pulse / #den-pulse），
            // canvas 只负责绘制静态网格 + 棋子插值，不再每帧计算 pulse。
            if (!this.needsRedraw && !this.isAnimating(board)) return;

            // 清除画布（逻辑像素坐标系，已由 adjustSize 设置 scale）
            ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
            ctx.strokeStyle = 'rgba(0, 242, 254, 0.03)';
            for (let i = 0; i <= this.cols; i++) {
                ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, this.cssHeight); ctx.stroke();
            }
            for (let i = 0; i <= this.rows; i++) {
                ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(this.cssWidth, i * cell); ctx.stroke();
            }

            // 河道底色（静态填充）+ CSS #river-pulse 层叠加呼吸效果
            rules.rivers.forEach(([r, c]) => {
                const x = c * cell, y = r * cell;
                ctx.fillStyle = 'rgba(0, 242, 254, 0.15)';
                ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
                ctx.strokeStyle = 'rgba(0, 242, 254, 0.25)';
                ctx.lineWidth = 1;
                ctx.strokeRect(x + 3, y + 3, cell - 6, cell - 6);
            });

            rules.traps.forEach((t) => {
                const x = t.c * cell, y = t.r * cell;
                ctx.strokeStyle = t.side === 'red' ? 'rgba(255, 77, 77, 0.4)' : 'rgba(0, 242, 254, 0.4)';
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(x + 10, y + 10, cell - 20, cell - 20);
                ctx.setLineDash([]);
            });

            // 兽穴用 canvas 绘制（CSS 只做脉冲光晕，图形本体仍需 canvas）
            rules.dens.forEach((d) => {
                const x = d.c * cell + cell / 2, y = d.r * cell + cell / 2;
                const color = d.side === 'red' ? '#ff4d4d' : '#00f2fe';
                ctx.beginPath();
                ctx.arc(x, y, 14, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.35;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.stroke();
            });

            board.flat().forEach((p) => {
                if (!p) return;
                p.x += (p.targetX - p.x) * 0.25;
                p.y += (p.targetY - p.y) * 0.25;
                const color = p.color === 'red' ? '#ff4d4d' : '#00f2fe';
                const centerX = p.x + cell / 2, centerY = p.y + cell / 2;

                if (selected === p) {
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, cell / 2 - 5, 0, Math.PI * 2);
                    ctx.strokeStyle = "white";
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }

                // P3-6：键盘预览高亮目标格
                if (this._highlightTarget && p.r === this._highlightTarget.r && p.c === this._highlightTarget.c) {
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, cell / 2 - 2, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(57, 255, 20, 0.8)';
                    ctx.lineWidth = 3;
                    ctx.stroke();
                }

                ctx.fillStyle = '#111322';
                ctx.beginPath();
                ctx.roundRect(p.x + 10, p.y + 10, cell - 20, cell - 20, 15);
                ctx.fill();
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.fillStyle = color;
                ctx.font = "bold 20px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(p.name, centerX, centerY + 7);
            });

            this.needsRedraw = !this.isAnimating(board);
        }
    }

    root.AnimalChessRenderer = AnimalChessRenderer;
})(typeof self !== 'undefined' ? self : globalThis);
