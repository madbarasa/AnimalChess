/**
 * 斗兽棋 AI 引擎源码（P2-2）
 *
 * 从 game.js 的模板字符串中独立出来，好处：
 *   - 有独立文件，可被 lint / 语法检查 / 直接阅读；
 *   - 引擎工厂可以通过 Function#toString 注入 Worker Blob（game.js 就是这么做的），
 *     因此仍然「双击 index.html 即可游玩」，不需要构建步骤或 fetch；
 *   - 直接以 importScripts 方式独立加载本文件（先加载 rules.js）也能启动。
 *
 * 规则来源：全部走 rules.js（参数 rules），本文件不再定义任何走法/捕食规则。
 */
(function (root) {
    'use strict';

    /**
     * AI 引擎工厂。
     * @param {object} rootGlobal Worker 全局对象（页面里不会调用本工厂，只在 Worker/测试沙箱里调用）
     * @param {object} rules rules.js 暴露的规则 API
     */
    function createAiEngine(rootGlobal, rules) {
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
            // 兽穴占用判定：只认「被对方棋子占据」才算胜负，己方棋子误入己方兽穴不参与评分
            const blueDenAnimal = map[3][0].animal;
            if (blueDenAnimal && blueDenAnimal.color === 1) return -2000 * neg + cost; // 红子占据蓝方兽穴
            const redDenAnimal = map[3][8].animal;
            if (redDenAnimal && redDenAnimal.color === 0) return 2000 * neg + cost; // 蓝子占据红方兽穴

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

            // 兽穴占用判定同样区分归属（与 ai_sbe 保持一致）
            const exitBlueDen = map[3][0].animal;
            if (exitBlueDen && exitBlueDen.color === 1) return -2000 * ply * neg;
            const exitRedDen = map[3][8].animal;
            if (exitRedDen && exitRedDen.color === 0) return 2000 * ply * neg;

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

            // 陷阱防御判定（红蓝对称）
            // 己方棋子站在「对方陷阱」里且相邻敌子、又轮到对方走棋时，下一步必被吃，直接判为劣势。
            for (const blue of blueAnims) {
                if (map[blue.point.x][blue.point.y].trap === 1) {
                    let safe = true;
                    for (const red of redAnims) {
                        if (Math.abs(blue.point.x - red.point.x) + Math.abs(blue.point.y - red.point.y) <= 1) { safe = false; break; }
                    }
                    if (!safe && !blueTurn) return -1000 * ply * neg;
                }
            }
            for (const red of redAnims) {
                if (map[red.point.x][red.point.y].trap === 0) {
                    let safe = true;
                    for (const blue of blueAnims) {
                        if (Math.abs(red.point.x - blue.point.x) + Math.abs(red.point.y - blue.point.y) <= 1) { safe = false; break; }
                    }
                    if (!safe && blueTurn) return 1000 * ply * neg;
                }
            }
            return null;
        }

        // 获取启发式排序后的移动列表：合法性完全来自 rules.js，这里只负责 AI 的排序打分
        function getOrderedMoves(map, animal) {
            const x1 = animal.point.x;
            const y1 = animal.point.y;
            return rules.getLegalMovesFrom(map, x1, y1)
                .map(({ x2, y2 }) => {
                    const target = map[x2][y2];
                    let score = 0;
                    if (target.animal) score = 100 + target.animal.rank * 10; // 吃子优先
                    if (target.base !== -1 && target.base !== animal.color) {
                        score = 1000; // 进对方兽穴优先级最高
                    } else if (y2 >= 3 && y2 <= 5) {
                        score += 5; // 抢占中心区域
                    }
                    return { x1, y1, x2, y2, score };
                })
                .sort((a, b) => b.score - a.score);
        }

        // 搜索上下文：一次搜索的全部可变状态都收在这里，不再挂在 Worker 顶层。
        // 好处：多次搜索互不串味、可并行（每次 new 一个）、方便把搜索逻辑单独拿出来测。
        function createSearchContext(maxTime) {
            return {
                startTime: Date.now(),
                maxTime,
                isTimeUp: false,
                bestDecision: null,
                rootPly: 0
            };
        }

        // Alpha-Beta 剪枝深度搜索
        // 超时中断约定：返回 null 表示「本层结果不完整」，调用方必须整条分支作废，
        // 绝不能把中断值当成真实评估参与 alpha/beta 比较。
        function alphaBetaPruning(ctx, map, ply, alpha, beta, aiturn) {
            if (Date.now() - ctx.startTime >= ctx.maxTime) {
                ctx.isTimeUp = true;
                return null;
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

                const res = alphaBetaPruning(ctx, map, ply - 1, alpha, beta, !aiturn);

                // 回溯还原
                map[x1][y1].animal = movingAnimal;
                map[x2][y2].animal = targetAnimal;
                movingAnimal.point.x = x1;
                movingAnimal.point.y = y1;

                // 子节点被超时中断：本层结果不完整，整条分支作废并继续向上冒泡
                if (ctx.isTimeUp || res === null) return null;

                if (aiturn) {
                    if (res > bestVal) {
                        bestVal = res;
                        if (ply === ctx.rootPly) ctx.bestDecision = { x1, y1, x2, y2 };
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

        // 兜底：搜索被中断且没有任何「完整层」结果时，至少给出一个合法走法，
        // 避免 Worker 返回 null 让主线程卡在「思考中」。
        function pickFallbackDecision(map) {
            for (let x1 = 0; x1 < 7; x1++) {
                for (let y1 = 0; y1 < 9; y1++) {
                    const cell = map[x1][y1];
                    if (!cell.animal || cell.animal.color !== 0) continue; // 0 = 蓝方 = AI
                    const moves = getOrderedMoves(map, cell.animal);
                    if (moves.length > 0) {
                        const m = moves[0];
                        return { x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2 };
                    }
                }
            }
            return null; // 真的无子可动，交由主线程判和
        }

        // 接收 Worker 消息
        rootGlobal.onmessage = function (e) {
            const { map, personality, maxTime = 1500, requestId = null } = e.data;

            let finalDecision = null;
            let maxDepth = personality === 'aggressive' ? 7 : 4;
            const ctx = createSearchContext(maxTime);

            // 迭代加深搜索
            for (let depth = 1; depth <= maxDepth; depth++) {
                ctx.bestDecision = null;
                ctx.rootPly = depth;
                const searchValue = alphaBetaPruning(ctx, map, depth, -Infinity, Infinity, true);

                // 本层被超时中断：结果不完整，直接丢弃该层，
                // finalDecision 保留上一层搜索完成的完整结果。
                if (ctx.isTimeUp || searchValue === null) {
                    break;
                }

                if (ctx.bestDecision) {
                    finalDecision = ctx.bestDecision;
                }

                if (Date.now() - ctx.startTime >= maxTime * 0.8) {
                    break;
                }
            }

            // 一层都没跑完（极端超时）时退回合法走法，保证 AI 一定有响应
            if (!finalDecision) {
                finalDecision = pickFallbackDecision(map);
            }

            rootGlobal.postMessage({ point: finalDecision, requestId });
        };
    }

    // 页面侧只定义工厂，供 game.js 序列化进 Worker Blob
    root.AnimalChessAiEngine = createAiEngine;

    // 作为独立 worker 源使用（会先 importScripts('rules.js')）时自动启动
    if (typeof importScripts === 'function' && root.AnimalChessRules) {
        createAiEngine(root, root.AnimalChessRules);
    }
})(typeof self !== 'undefined' ? self : globalThis);
