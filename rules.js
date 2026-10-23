/**
 * 斗兽棋规则唯一实现来源（P2-1）
 *
 * 主线程（index.html 直接加载）与 AI Worker（game.js 注入 Worker Blob）共用这一份实现，
 * 不允许任何一侧再另写一套 canEat / canMove / getLegalMoves。
 *
 * 棋盘约定（与 AI 内部 map 相同，列优先）：
 *   board[x][y]，x = 列 0..6，y = 行 0..8
 *   cell = {
 *     animal: null | { rank: 1..8, color: 0|1, point?: {x,y} },
 *     terrain: 'land' | 'water',
 *     trap: -1 | 0 | 1,   // 该格属于哪一方的陷阱（0 蓝 / 1 红）
 *     base: -1 | 0 | 1    // 该格是哪一方的兽穴（0 蓝 / 1 红）
 *   }
 *   color: 0 = 蓝方, 1 = 红方
 *
 * 本文件是普通 <script>（非 ESM），因为项目必须保持「双击 index.html 即可游玩」：
 * 页面直接加载它；Worker 侧由 game.js 读取 AnimalChessRules.source（由同一个工厂函数
 * 序列化而来）注入 Blob，因此规则仍然只有这一处实现。
 */
(function (root) {
    'use strict';

    /**
     * 规则工厂：返回值就是规则 API。
     * 必须保持自包含（不引用外部变量），因为 Worker 侧会通过 Function#toString 复用它。
     */
    function createRulesApi(root) {
        const ROWS = 9;
        const COLS = 7;

        function inBounds(x, y) {
            return x >= 0 && x < COLS && y >= 0 && y < ROWS;
        }

        /**
         * 捕食判定（纯函数）。
         * @param {{rank:number,color:number}} animal 进攻方棋子
         * @param {{rank:number,color:number}|null} foe 防守方棋子（null 表示空格）
         * @param {number} targetTrap 目标格所属陷阱方（-1 表示不是陷阱）
         * @param {'land'|'water'} fromTerrain 进攻方所在格子地形
         * @param {'land'|'water'} toTerrain 目标格地形
         */
        function canEat(animal, foe, targetTrap, fromTerrain, toTerrain) {
            if (!foe) return true;
            // 目标格位于「我方陷阱」：陷阱中的防守棋子等级视为 0，任何棋子均可捕食
            if (targetTrap === animal.color) return true;
            // 水中棋子不能攻击岸上棋子（岸上鼠吃水中鼠仍然允许）
            if (fromTerrain === 'water' && toTerrain !== 'water') return false;
            if (animal.rank === 1 && foe.rank === 8) return true; // 鼠吃象
            if (animal.rank === 8 && foe.rank === 1) return false; // 象不吃鼠
            return animal.rank >= foe.rank; // 正常等级判定
        }

        /**
         * 单步走法判定（纯函数）。
         * 覆盖：相邻移动、捕食、进河、狮虎跨河、陷阱、兽穴。
         */
        function canMove(board, x1, y1, x2, y2) {
            if (!inBounds(x1, y1) || !inBounds(x2, y2)) return false;
            const from = board[x1][y1];
            const to = board[x2][y2];
            if (!from || !from.animal || !to) return false;

            const animal = from.animal;
            if (to.animal && to.animal.color === animal.color) return false;
            if (to.base === animal.color) return false; // 不能进入己方兽穴

            const dx = x2 - x1;
            const dy = y2 - y1;
            const dist = Math.abs(dx) + Math.abs(dy);

            // 狮(7)/虎(6) 跨河：沿直线越过连续水域，落点不是水，途中不得有棋子
            if ((animal.rank === 6 || animal.rank === 7) && to.terrain !== 'water' && dist > 1) {
                if ((dx === 0) !== (dy === 0)) {
                    const stepX = Math.sign(dx);
                    const stepY = Math.sign(dy);
                    let mx = x1 + stepX;
                    let my = y1 + stepY;
                    let riverCount = 0;
                    while (mx !== x2 || my !== y2) {
                        if (board[mx][my].terrain !== 'water') return false;
                        if (board[mx][my].animal) return false;
                        riverCount++;
                        mx += stepX;
                        my += stepY;
                    }
                    return riverCount >= 1 && canEat(animal, to.animal, to.trap, from.terrain, to.terrain);
                }
            }

            if (dist !== 1) return false;
            if (to.terrain === 'water' && animal.rank !== 1) return false; // 只有鼠能下水
            return canEat(animal, to.animal, to.trap, from.terrain, to.terrain);
        }

        /**
         * 某个棋子的全部合法走法。
         * @returns {Array<{x1:number,y1:number,x2:number,y2:number}>}
         */
        function getLegalMovesFrom(board, x, y) {
            const moves = [];
            if (!inBounds(x, y) || !board[x][y] || !board[x][y].animal) return moves;

            const animal = board[x][y].animal;
            // 相邻四方向
            for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
                if (canMove(board, x, y, x + dx, y + dy)) {
                    moves.push({ x1: x, y1: y, x2: x + dx, y2: y + dy });
                }
            }

            // 狮虎跨河：河宽决定距离只可能是 3 或 4
            if (animal.rank === 6 || animal.rank === 7) {
                for (const [dx, dy] of [[0, -3], [3, 0], [0, 3], [-3, 0], [0, -4], [4, 0], [0, 4], [-4, 0]]) {
                    if (canMove(board, x, y, x + dx, y + dy)) {
                        moves.push({ x1: x, y1: y, x2: x + dx, y2: y + dy });
                    }
                }
            }
            return moves;
        }

        /**
         * 某一方的全部合法走法。
         * @returns {Array<{x1:number,y1:number,x2:number,y2:number}>}
         */
        function getAllLegalMoves(board, color) {
            const moves = [];
            for (let x = 0; x < COLS; x++) {
                for (let y = 0; y < ROWS; y++) {
                    const cell = board[x][y];
                    if (!cell || !cell.animal || cell.animal.color !== color) continue;
                    moves.push(...getLegalMovesFrom(board, x, y));
                }
            }
            return moves;
        }

        const api = { ROWS, COLS, canEat, canMove, getLegalMovesFrom, getAllLegalMoves };
        if (root) root.AnimalChessRules = api;
        return api;
    }

    const rules = createRulesApi(root);
    // Worker 侧规则源码：序列化同一个工厂函数，确保「规则只有一个实现来源」
    rules.source = '(' + createRulesApi.toString() + ')(self);';
})(typeof self !== 'undefined' ? self : globalThis);
