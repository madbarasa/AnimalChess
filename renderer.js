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

            // 物理像素尺寸（P3-3 会在此基础上乘 devicePixelRatio）
            this.canvas.width = this.cols * this.cell;
            this.canvas.height = this.rows * this.cell;

            this.pulse = 0;
            this.needsRedraw = true;
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

            this.pulse = (this.pulse + 0.05) % (Math.PI * 2);
            if (!this.needsRedraw && !this.isAnimating(board)) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = 'rgba(0, 242, 254, 0.03)';
            for (let i = 0; i <= this.cols; i++) {
                ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, canvas.height); ctx.stroke();
            }
            for (let i = 0; i <= this.rows; i++) {
                ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(canvas.width, i * cell); ctx.stroke();
            }

            rules.rivers.forEach(([r, c]) => {
                const x = c * cell, y = r * cell;
                ctx.fillStyle = 'rgba(0, 242, 254, 0.08)';
                ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
                ctx.strokeStyle = `rgba(0, 242, 254, ${0.15 + Math.sin(this.pulse) * 0.05})`;
                ctx.strokeRect(x + 4, y + 4, cell - 8, cell - 8);
            });

            rules.traps.forEach((t) => {
                const x = t.c * cell, y = t.r * cell;
                ctx.strokeStyle = t.side === 'red' ? 'rgba(255, 77, 77, 0.4)' : 'rgba(0, 242, 254, 0.4)';
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(x + 10, y + 10, cell - 20, cell - 20);
                ctx.setLineDash([]);
            });

            rules.dens.forEach((d) => {
                const x = d.c * cell + cell / 2, y = d.r * cell + cell / 2;
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

            if (!this.isAnimating(board)) this.needsRedraw = false;
        }
    }

    root.AnimalChessRenderer = AnimalChessRenderer;
})(typeof self !== 'undefined' ? self : globalThis);
