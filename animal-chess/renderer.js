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

            // 陆地底色
            ctx.fillStyle = '#171b30';
            ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

            // 陆地格交替棋盘纹，提升可读性
            ctx.fillStyle = 'rgba(255, 255, 255, 0.028)';
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if ((r + c) % 2 === 0) {
                        ctx.fillRect(c * cell, r * cell, cell, cell);
                    }
                }
            }

            // 网格线：清晰可读，外框加粗
            ctx.strokeStyle = 'rgba(122, 143, 214, 0.42)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= this.cols; i++) {
                ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, this.cssHeight); ctx.stroke();
            }
            for (let i = 0; i <= this.rows; i++) {
                ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(this.cssWidth, i * cell); ctx.stroke();
            }
            ctx.strokeStyle = 'rgba(150, 170, 240, 0.6)';
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, this.cssWidth - 2, this.cssHeight - 2);

            // 河道底色（静态，不做脉冲；脉冲效果由 CSS #river-pulse 层叠加）
            rules.rivers.forEach(([r, c]) => {
                const x = c * cell, y = r * cell;
                const g = ctx.createLinearGradient(x, y, x, y + cell);
                g.addColorStop(0, 'rgba(28, 116, 158, 0.95)');
                g.addColorStop(0.5, 'rgba(43, 158, 208, 0.95)');
                g.addColorStop(1, 'rgba(28, 116, 158, 0.95)');
                ctx.fillStyle = g;
                ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
            });

            // 河道波纹：细横线 + 高光，让水感明显
            ctx.strokeStyle = 'rgba(170, 225, 255, 0.5)';
            ctx.lineWidth = 1;
            rules.rivers.forEach(([r, c]) => {
                const x = c * cell, y = r * cell;
                [0.3, 0.5, 0.7].forEach((f) => {
                    const wy = y + cell * f;
                    ctx.beginPath();
                    ctx.moveTo(x + 10, wy);
                    ctx.lineTo(x + cell - 10, wy);
                    ctx.stroke();
                });
            });

            rules.traps.forEach((t) => {
                const x = t.c * cell, y = t.r * cell;
                const color = t.side === 'red' ? 'rgba(255, 107, 94, 0.9)' : 'rgba(53, 200, 245, 0.9)';
                ctx.fillStyle = t.side === 'red' ? 'rgba(255, 107, 94, 0.12)' : 'rgba(53, 200, 245, 0.12)';
                ctx.fillRect(x + 8, y + 8, cell - 16, cell - 16);
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(x + 10, y + 10, cell - 20, cell - 20);
                ctx.setLineDash([]);
            });

            // 兽穴用 canvas 绘制（CSS 只做脉冲光晕，图形本体仍需 canvas）
            rules.dens.forEach((d) => {
                const x = d.c * cell + cell / 2, y = d.r * cell + cell / 2;
                const color = d.side === 'red' ? '#ff6b5e' : '#35c8f5';
                ctx.beginPath();
                ctx.arc(x, y, 14, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.55;
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
                const color = p.color === 'red' ? '#ff6b5e' : '#35c8f5';
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
                    ctx.strokeStyle = 'rgba(93, 255, 106, 0.85)';
                    ctx.lineWidth = 3;
                    ctx.stroke();
                }

                const bodyGrad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + cell);
                bodyGrad.addColorStop(0, '#2a3158');
                bodyGrad.addColorStop(1, '#161a30');
                ctx.fillStyle = bodyGrad;
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
