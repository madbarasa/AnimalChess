/**
 * 斗兽棋 3D - 冠军级 AI 引擎（单档难度）
 *
 * 设计目标：一档默认难度，直接给出最强搜索结果。
 *  - 迭代加深 + 时间预算：在预算内尽可能搜深，超时安全回退到上一层完整结果。
 *  - Alpha-Beta 剪枝 + 置换表（Zobrist 哈希）：大幅提升有效搜索深度。
 *  - 静态评估（红方为正）：子力、位置、威胁、保护、机动性、鼠象牵制、兽穴推进。
 *  - 终局判定：兽穴被占 / 一方被吃光 / 无子可动判和，分数带必胜/必败量级与 ply 偏好。
 *
 * 本文件不引用 DOM，可直接在 Web Worker 中运行。
 */

import { CONFIG } from '../config';

export type Side = 'red' | 'blue';

export interface Move {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SearchRequest {
  cells: SerializedCell[][];
  side: Side;
  maxTimeMs: number;
  requestId: number;
}

export interface SearchResponse {
  move: Move | null;
  depth: number;
  nodes: number;
  elapsedMs: number;
  requestId: number;
}

/** 主线程传给 Worker 的精简棋盘格 */
export interface SerializedCell {
  rank: number;
  color: 0 | 1; // 0 = 蓝, 1 = 红
}

// ---------- 常量 ----------
const COLS = CONFIG.BOARD.cols;
const ROWS = CONFIG.BOARD.rows;
const WIN_SCORE = 1000000;
const MATE_BOUND = 900000;
const INF = 2000000;

// 棋子在棋盘上的布局（与 config.ts 一致，编译期固定）
const RIVERS = new Set(CONFIG.RIVERS.map(([r, c]) => r * COLS + c));
const TRAPS: Map<number, Side> = new Map(
  CONFIG.TRAPS.map((t) => [t.row * COLS + t.col, t.side]),
);
const DENS: Map<number, Side> = new Map(
  CONFIG.DENS.map((d) => [d.row * COLS + d.col, d.side]),
);

// 位置价值表（红方视角，行 0 = 蓝方底线，行 8 = 红方底线）。
// 越靠近对方兽穴、越靠近中线越有价值。
const PST: number[][] = (() => {
  const table = [
    [0, 3, 6, 10, 6, 3, 0],
    [3, 8, 14, 20, 14, 8, 3],
    [7, 15, 24, 34, 24, 15, 7],
    [12, 24, 38, 52, 38, 24, 12],
    [18, 34, 52, 70, 52, 34, 18],
    [26, 46, 68, 92, 68, 46, 26],
    [38, 60, 90, 120, 90, 60, 38],
    [60, 88, 130, 170, 130, 88, 60],
    [90, 130, 190, 240, 190, 130, 90],
  ];
  // 转成 [col][row]（列优先，与引擎内部一致）
  const result: number[][] = [];
  for (let x = 0; x < COLS; x++) {
    result[x] = [];
    for (let y = 0; y < ROWS; y++) result[x][y] = table[y][x];
  }
  return result;
})();

const PIECE_VALUE = [0, 90, 180, 280, 400, 550, 750, 950, 1200];

// ---------- 棋盘内部表示 ----------
// board 为紧凑 Int8Array，索引 = x * ROWS + y。
// 0 = 空格；正数 = 红子等级(1..8)；负数 = 蓝子等级(-1..-8)。
type CompactBoard = Int8Array;

function idx(x: number, y: number): number {
  return x * ROWS + y;
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS;
}

function serializeToCompact(cells: SerializedCell[][]): CompactBoard {
  const board = new Int8Array(COLS * ROWS);
  for (let x = 0; x < COLS; x++) {
    for (let y = 0; y < ROWS; y++) {
      const c = cells[x]?.[y];
      if (c && c.rank >= 1 && c.rank <= 8) {
        board[idx(x, y)] = c.color === 1 ? c.rank : -c.rank;
      }
    }
  }
  return board;
}

// ---------- Zobrist ----------
// 用固定种子的 xorshift32 生成，保证跨层/跨搜索一致。
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return s >>> 0;
  };
}

const ZOBRIST = (() => {
  const rand = makeRandom(0x5eed1234);
  const piece: number[][] = [];
  for (let sq = 0; sq < COLS * ROWS; sq++) {
    piece[sq] = [];
    for (let code = 0; code < 17; code++) piece[sq][code] = rand();
  }
  const side = rand();
  return { piece, side };
})();

function pieceCode(v: number): number {
  return v + 8; // -8..8 -> 0..16, 0 表示空格
}

function hashBoard(board: CompactBoard, side: Side): number {
  let h = side === 'red' ? ZOBRIST.side : 0;
  for (let sq = 0; sq < board.length; sq++) {
    const v = board[sq];
    if (v !== 0) h ^= ZOBRIST.piece[sq][pieceCode(v)];
  }
  return h >>> 0;
}

// ---------- 走法 ----------
const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** 捕食判定：attacker 能否吃掉 defender（defender=0 表示空格） */
function canEat(
  attacker: number,
  defender: number,
  fromWater: boolean,
  toWater: boolean,
  targetTrap: Side | undefined,
): boolean {
  if (defender === 0) return true;
  const aRank = Math.abs(attacker);
  const dRank = Math.abs(defender);
  const aRed = attacker > 0;
  // 目标格属于进攻方陷阱：防守子等级视为 0
  if (targetTrap === (aRed ? 'red' : 'blue')) return true;
  // 水中棋子不能攻击岸上棋子
  if (fromWater && !toWater) return false;
  if (aRank === 1 && dRank === 8) return true; // 鼠吃象
  if (aRank === 8 && dRank === 1) return false; // 象不吃鼠
  return aRank >= dRank;
}

/** 生成某一方的全部合法走法，附带启发式排序分 */
function generateMoves(board: CompactBoard, side: Side): Move[] {
  const moves: Move[] = [];
  const red = side === 'red';
  for (let x = 0; x < COLS; x++) {
    for (let y = 0; y < ROWS; y++) {
      const v = board[idx(x, y)];
      if (v === 0 || (v > 0) !== red) continue;
      const rank = Math.abs(v);
      const fromWater = RIVERS.has(y * COLS + x);

      const tryMove = (x2: number, y2: number, distance: number): void => {
        if (!inBounds(x2, y2)) return;
        const target = board[idx(x2, y2)];
        if (target !== 0 && (target > 0) === red) return; // 己方棋子
        const targetDen = DENS.get(y2 * COLS + x2);
        if (targetDen === side) return; // 不能进己方兽穴
        const toWater = RIVERS.has(y2 * COLS + x2);

        if (distance > 1) {
          // 狮虎跨河：直线越过连续水格，途中不得有棋子
          if (rank !== 6 && rank !== 7) return;
          if (toWater) return;
          const dx = x2 - x;
          const dy = y2 - y;
          if (dx !== 0 && dy !== 0) return;
          const stepX = Math.sign(dx);
          const stepY = Math.sign(dy);
          let mx = x + stepX;
          let my = y + stepY;
          let waterCount = 0;
          while (mx !== x2 || my !== y2) {
            if (!inBounds(mx, my)) return;
            if (!RIVERS.has(my * COLS + mx)) return;
            if (board[idx(mx, my)] !== 0) return;
            waterCount++;
            mx += stepX;
            my += stepY;
          }
          if (waterCount === 0) return;
        } else {
          if (toWater && rank !== 1) return; // 只有鼠能下水
        }

        const targetTrap = TRAPS.get(y2 * COLS + x2);
        if (!canEat(v, target, fromWater, toWater, targetTrap)) return;
        moves.push({ x1: x, y1: y, x2, y2 });
      };

      for (const [dx, dy] of DIRS) tryMove(x + dx, y + dy, 1);
      if (rank === 6 || rank === 7) {
        for (const [dx, dy] of [[0, -3], [3, 0], [0, 3], [-3, 0], [0, -4], [4, 0], [0, 4], [-4, 0]]) {
          tryMove(x + dx, y + dy, Math.abs(dx) + Math.abs(dy));
        }
      }
    }
  }
  return moves;
}

/** 走法启发式评分：吃子、进穴、中心、推进 */
function moveScore(board: CompactBoard, move: Move, side: Side): number {
  const v = board[idx(move.x1, move.y1)];
  const target = board[idx(move.x2, move.y2)];
  let score = 0;
  if (target !== 0) {
    score += 10000 + PIECE_VALUE[Math.abs(target)] * 4 - PIECE_VALUE[Math.abs(v)] / 10;
  }
  const den = DENS.get(move.y2 * COLS + move.x2);
  if (den && den !== side) score += 1000000; // 进对方兽穴直接获胜
  const forward = side === 'red' ? move.y2 - move.y1 : move.y1 - move.y2;
  score += forward * 12;
  score += (3 - Math.abs(move.x2 - 3)) * 4; // 中线控制
  return score;
}

// ---------- 评估 ----------
/** 某棋子是否受到敌方威胁（不考虑己方保护，取最坏情况） */
function pieceSafety(board: CompactBoard, x: number, y: number, v: number): number {
  const red = v > 0;
  const rank = Math.abs(v);
  const trap = TRAPS.get(y * COLS + x);
  const effectiveRank = trap === (red ? 'blue' : 'red') ? 0 : rank;
  let worst = 0;
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny)) continue;
    const e = board[idx(nx, ny)];
    if (e === 0 || (e > 0) === red) continue;
    const eRank = Math.abs(e);
    const eWater = RIVERS.has(ny * COLS + nx);
    const myWater = RIVERS.has(y * COLS + x);
    if (eWater && !myWater) continue; // 水中子不能上岸吃
    let canCapture = false;
    if (eRank === 1 && effectiveRank === 8) canCapture = myWater === eWater || !eWater;
    else if (eRank === 8 && effectiveRank === 1) canCapture = false;
    else canCapture = eRank >= effectiveRank;
    if (canCapture) worst = Math.max(worst, PIECE_VALUE[rank] / 100);
  }
  return worst;
}

/** 静态评估：返回红方视角分数（红优为正） */
function evaluate(board: CompactBoard): number {
  let score = 0;
  let redCount = 0;
  let blueCount = 0;
  let redMouse: { x: number; y: number } | null = null;
  let blueMouse: { x: number; y: number } | null = null;
  let redElephant: { x: number; y: number } | null = null;
  let blueElephant: { x: number; y: number } | null = null;

  for (let x = 0; x < COLS; x++) {
    for (let y = 0; y < ROWS; y++) {
      const v = board[idx(x, y)];
      if (v === 0) continue;
      const red = v > 0;
      const rank = Math.abs(v);
      const sign = red ? 1 : -1;
      if (red) redCount++;
      else blueCount++;

      // 子力 + 位置价值（蓝方使用上下镜像 PST）
      const pst = PST[x][red ? ROWS - 1 - y : y] / 100;
      score += sign * (PIECE_VALUE[rank] + pst * 12);

      // 兽穴推进：非鼠棋子越靠近对方兽穴越有价值
      const denRow = red ? 0 : 8;
      const denDist = Math.abs(y - denRow) + Math.abs(x - 3);
      score += sign * (14 - denDist) * (rank === 1 ? 2 : 5);

      // 河道控制：狮虎靠近河道可威慑跃河
      if (rank === 6 || rank === 7) {
        const riverDist = Math.min(...[...RIVERS].map((k) => Math.abs(x - (k % COLS)) + Math.abs(y - Math.floor(k / COLS))));
        score += sign * (12 - riverDist) * 2;
      }

      // 安全性：受威胁且无保护则扣分
      const threat = pieceSafety(board, x, y, v);
      if (threat > 0) {
        let protectedByAlly = false;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny)) continue;
          const a = board[idx(nx, ny)];
          if (a !== 0 && (a > 0) === red) {
            protectedByAlly = true;
            break;
          }
        }
        score -= sign * threat * (protectedByAlly ? 18 : 55);
      }

      // 陷阱压制：站在敌方陷阱里被削弱
      const trap = TRAPS.get(y * COLS + x);
      if (trap === (red ? 'blue' : 'red')) score -= sign * 120;

      // 鼠/象牵制
      if (rank === 1) {
        if (red) redMouse = { x, y };
        else blueMouse = { x, y };
      } else if (rank === 8) {
        if (red) redElephant = { x, y };
        else blueElephant = { x, y };
      }
    }
  }

  if (redMouse && blueElephant) {
    const d = Math.abs(redMouse.x - blueElephant.x) + Math.abs(redMouse.y - blueElephant.y);
    score += Math.max(0, 10 - d) * 4;
  }
  if (blueMouse && redElephant) {
    const d = Math.abs(blueMouse.x - redElephant.x) + Math.abs(blueMouse.y - redElephant.y);
    score -= Math.max(0, 10 - d) * 4;
  }

  // 残局：子力优势时鼓励兑子、逼近对方兽穴
  const diff = redCount - blueCount;
  if (diff > 0) score += diff * 30;
  else if (diff < 0) score += diff * 30;

  return score;
}

// ---------- 搜索 ----------
const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;

interface TTEntry {
  hash: number;
  depth: number;
  value: number;
  flag: number;
  move: Move | null;
}

interface SearchContext {
  startTime: number;
  maxTimeMs: number;
  timedOut: boolean;
  nodes: number;
  tt: Map<number, TTEntry>;
  killerMoves: (Move | null)[][];
  history: number[][];
  board: CompactBoard;
}

function createContext(board: CompactBoard, maxTimeMs: number): SearchContext {
  return {
    startTime: Date.now(),
    maxTimeMs,
    timedOut: false,
    nodes: 0,
    tt: new Map(),
    killerMoves: Array.from({ length: 32 }, () => [null, null]),
    history: Array.from({ length: 2 }, () => new Array(COLS * ROWS * COLS * ROWS).fill(0)),
    board,
  };
}

function checkTime(ctx: SearchContext, ply: number): boolean {
  if (ctx.timedOut) return true;
  // 深度 1 的叶子节点必须完整返回，避免「一层都跑不完」；
  // 更深层在第 1024 个节点起做时间检查，超时后整条分支作废。
  if (ply > 1 && (ctx.nodes & 1023) === 0 && Date.now() - ctx.startTime >= ctx.maxTimeMs) {
    ctx.timedOut = true;
  }
  return ctx.timedOut;
}

/**
 * 终局检测（不生成走法，困毙由 negamax 在 moves 为空时处理）。
 * 进入终局节点的「走棋方」必是败方（对手刚完成制胜走法），
 * 因此所有胜负终局在 negamax 视角统一返回 -(WIN_SCORE - ply)：
 * ply 越小越负 → 胜方（父节点取反）越快取胜分越高。
 */
function terminalValue(ctx: SearchContext, ply: number): number | null {
  const board = ctx.board;
  // 兽穴被敌子占据
  if (board[idx(3, 0)] > 0) return -(WIN_SCORE - ply); // 红占蓝穴
  if (board[idx(3, 8)] < 0) return -(WIN_SCORE - ply); // 蓝占红穴

  let red = 0;
  let blue = 0;
  for (let sq = 0; sq < board.length; sq++) {
    const v = board[sq];
    if (v > 0) red++;
    else if (v < 0) blue++;
  }
  if (blue === 0 || red === 0) return -(WIN_SCORE - ply);
  return null;
}

/** 增量计算走子后的 Zobrist 哈希（captured=0 时不得 XOR 空格键） */
function moveHash(hash: number, from: number, to: number, moving: number, captured: number): number {
  let h = hash ^ ZOBRIST.piece[from][pieceCode(moving)] ^ ZOBRIST.piece[to][pieceCode(moving)] ^ ZOBRIST.side;
  if (captured !== 0) h ^= ZOBRIST.piece[to][pieceCode(captured)];
  return h >>> 0;
}

/** 应用一步（原地），返回被吃子用于回溯 */
function applyMove(ctx: SearchContext, move: Move): number {
  const board = ctx.board;
  const from = idx(move.x1, move.y1);
  const to = idx(move.x2, move.y2);
  const captured = board[to];
  board[to] = board[from];
  board[from] = 0;
  return captured;
}

function undoMove(ctx: SearchContext, move: Move, captured: number): void {
  const board = ctx.board;
  board[idx(move.x1, move.y1)] = board[idx(move.x2, move.y2)];
  board[idx(move.x2, move.y2)] = captured;
}

function orderMoves(ctx: SearchContext, moves: Move[], side: Side, ply: number, ttMove: Move | null): void {
  const red = side === 'red';
  const colorIdx = red ? 1 : 0;
  const killers = ctx.killerMoves[Math.min(ply, 31)];
  const scoreOf = (m: Move): number => {
    let s = moveScore(ctx.board, m, side);
    if (ttMove && sameMove(m, ttMove)) s += 5000000;
    else if (killers[0] && sameMove(m, killers[0])) s += 800000;
    else if (killers[1] && sameMove(m, killers[1])) s += 700000;
    s += ctx.history[colorIdx][moveIndex(m)];
    return s;
  };
  moves.sort((a, b) => scoreOf(b) - scoreOf(a));
}

function moveIndex(m: Move): number {
  return (idx(m.x1, m.y1) * (COLS * ROWS) + idx(m.x2, m.y2));
}

function sameMove(a: Move, b: Move): boolean {
  return a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2;
}

function storeTT(ctx: SearchContext, hash: number, depth: number, value: number, flag: number, move: Move | null): void {
  const existing = ctx.tt.get(hash);
  if (existing && existing.depth > depth) return;
  ctx.tt.set(hash, { hash, depth, value, flag, move });
  if (ctx.tt.size > 250000) {
    // 简单容量控制：清掉约一半旧条目
    let n = 0;
    for (const key of ctx.tt.keys()) {
      ctx.tt.delete(key);
      if (++n > 100000) break;
    }
  }
}

/**
 * 主搜索（negamax + alpha-beta + 置换表）。
 * 返回值始终是「当前走棋方视角」的分数；返回 null 表示该分支因超时作废。
 */
function negamax(ctx: SearchContext, depth: number, alpha: number, beta: number, side: Side, ply: number, hash: number): number | null {
  ctx.nodes++;
  if (checkTime(ctx, ply)) return null;

  const terminal = terminalValue(ctx, ply);
  if (terminal !== null) return terminal;

  if (depth <= 0) {
    const v = evaluate(ctx.board);
    return side === 'red' ? v : -v;
  }

  const alphaOrig = alpha;
  const entry = ctx.tt.get(hash);
  let ttMove: Move | null = null;
  if (entry && entry.depth >= depth) {
    if (entry.flag === TT_EXACT) return entry.value;
    if (entry.flag === TT_LOWER) alpha = Math.max(alpha, entry.value);
    else if (entry.flag === TT_UPPER) beta = Math.min(beta, entry.value);
    if (alpha >= beta) return entry.value;
    ttMove = entry.move;
  } else if (entry) {
    ttMove = entry.move;
  }

  const moves = generateMoves(ctx.board, side);
  if (moves.length === 0) return 0; // 困毙判和
  orderMoves(ctx, moves, side, ply, ttMove);

  let best = -INF;
  let bestMove: Move | null = null;
  const red = side === 'red';
  const colorIdx = red ? 1 : 0;

  for (const move of moves) {
    const from = idx(move.x1, move.y1);
    const to = idx(move.x2, move.y2);
    const moving = ctx.board[from];
    const captured = applyMove(ctx, move);
    const childHash = moveHash(hash, from, to, moving, captured);

    const value = negamax(ctx, depth - 1, -beta, -alpha, red ? 'blue' : 'red', ply + 1, childHash);
    undoMove(ctx, move, captured);

    if (value === null || ctx.timedOut) return null; // 超时：整条分支作废
    const score = -value;
    if (score > best) {
      best = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (captured === 0) {
        const killers = ctx.killerMoves[Math.min(ply, 31)];
        if (!killers[0] || !sameMove(move, killers[0])) {
          killers[1] = killers[0];
          killers[0] = move;
        }
        ctx.history[colorIdx][moveIndex(move)] += depth * depth;
      }
      break;
    }
  }

  const flag = best <= alphaOrig ? TT_UPPER : best >= beta ? TT_LOWER : TT_EXACT;
  storeTT(ctx, hash, depth, best, flag, bestMove);
  return best;
}

/** 迭代加深根节点搜索，返回「完成的最深一层」的最佳走法 */
function searchBestMove(request: SearchRequest): SearchResponse {
  const board = serializeToCompact(request.cells);
  const ctx = createContext(board, request.maxTimeMs);
  const side = request.side;
  const rootHash = hashBoard(board, side);

  let bestMove: Move | null = null;
  let completedDepth = 0;
  let lastScore = 0;
  const maxDepth = 24;

  const rootMoves = generateMoves(board, side);
  if (rootMoves.length === 0) {
    return { move: null, depth: 0, nodes: 0, elapsedMs: 0, requestId: request.requestId };
  }
  // 根层先验排序：立即获胜的走法排最前
  rootMoves.sort((a, b) => moveScore(board, b, side) - moveScore(board, a, side));

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (depth > 1 && checkTime(ctx, 2)) break;
    let localBest: Move | null = null;
    let localBestScore = -INF;
    let alpha = -INF;

    for (const move of rootMoves) {
      const from = idx(move.x1, move.y1);
      const to = idx(move.x2, move.y2);
      const moving = board[from];
      const captured = applyMove(ctx, move);
      const childHash = moveHash(rootHash, from, to, moving, captured);
      const value = negamax(ctx, depth - 1, -INF, -alpha, side === 'red' ? 'blue' : 'red', 1, childHash);
      undoMove(ctx, move, captured);

      if (value === null || ctx.timedOut) break; // 本层未完成
      const score = -value;
      if (score > localBestScore) {
        localBestScore = score;
        localBest = move;
      }
      if (score > alpha) alpha = score;
    }

    if (ctx.timedOut || localBest === null) break; // 丢弃不完整层
    bestMove = localBest;
    completedDepth = depth;
    lastScore = localBestScore;

    // 已找到必胜/必败，无需再搜
    if (Math.abs(lastScore) >= MATE_BOUND) break;
    // 预算用掉 85% 后不再开新层
    if (Date.now() - ctx.startTime >= request.maxTimeMs * 0.85) break;
  }

  // 兜底：一层都没完成时，至少给出启发式最优的合法走法
  if (!bestMove) bestMove = rootMoves[0] ?? null;

  return {
    move: bestMove,
    depth: completedDepth,
    nodes: ctx.nodes,
    elapsedMs: Date.now() - ctx.startTime,
    requestId: request.requestId,
  };
}

// ---------- Worker 入口 ----------
export interface WorkerGlobal {
  onmessage: ((event: { data: SearchRequest }) => void) | null;
  postMessage: (message: SearchResponse) => void;
}

export function installAiWorker(workerGlobal: WorkerGlobal): void {
  workerGlobal.onmessage = (event) => {
    const response = searchBestMove(event.data);
    workerGlobal.postMessage(response);
  };
}

/** 仅供自动化测试比对走法生成，不参与运行时逻辑 */
export const __test = {
  serializeToCompact,
  generateMoves,
  evaluate,
  moveScore,
  idx,
};
