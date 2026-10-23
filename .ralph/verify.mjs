#!/usr/bin/env node
/**
 * AnimalChess 验收脚本
 *
 * MUST  段：全绿才允许提交（回归防线）
 * TARGET 段：进度可视化，不阻断提交
 *
 * 用法：node .ralph/verify.mjs
 * 退出码：MUST 全部通过为 0，否则为 1
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const exists = (p) => existsSync(path.join(root, p));

let mustFail = 0;
const targets = [];

function must(name, cond, detail = '') {
  if (cond) {
    console.log(`  \u2705 ${name}`);
  } else {
    console.log(`  \u274c ${name}${detail ? ' \u2014 ' + detail : ''}`);
    mustFail++;
  }
}

function target(name, cond, detail = '') {
  targets.push({ name, cond, detail });
}

console.log('=== MUST：语法与可运行性 ===');

// 1. 所有根目录 JS 文件语法检查
const jsFiles = readdirSync(root).filter((f) => f.endsWith('.js'));
must('发现 JS 入口文件', jsFiles.length > 0);
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'pipe' });
    must(`语法 ${f}`, true);
  } catch (e) {
    const msg = String(e.stderr || e.message || '').trim().split('\n').slice(-3).join(' ').slice(0, 240);
    must(`语法 ${f}`, false, msg);
  }
}

// 2. 页面入口与资源引用
must('index.html 存在', exists('index.html'));
must('style.css 存在', exists('style.css'));
if (exists('index.html')) {
  const html = read('index.html');
  must('index.html 引用了 game.js 或等价入口', /<script[^>]+src=["'][^"']*game\.js/.test(html));
  must('index.html 引用了 style.css', /<link[^>]+href=["'][^"']*style\.css/.test(html));
}

// 3. AI worker 源码抽取（P2-2 后来自 ai-worker.js；旧内嵌模板仍兼容）
function loadWorkerSource() {
  if (!exists('game.js')) throw new Error('game.js 不存在');
  if (exists('ai-worker.js')) {
    // 模拟页面加载顺序，取到真实的引擎工厂与规则源码，再拼出与 game.js 完全一致的 Worker 源
    const page = createSandbox();
    vm.runInContext(read('rules.js'), page);
    vm.runInContext(read('ai-worker.js'), page);
    const engine = page.AnimalChessAiEngine;
    const rulesSource = page.AnimalChessRules && page.AnimalChessRules.source;
    if (typeof engine !== 'function' || !rulesSource) {
      throw new Error('ai-worker.js 未暴露 AnimalChessAiEngine 或 rules.source');
    }
    return {
      code: rulesSource + '\n(' + engine.toString() + ')(self, self.AnimalChessRules);',
      origin: 'ai-worker.js（rules.js 源码随 Worker 注入）',
      bundled: true
    };
  }
  const src = read('game.js');
  const m = src.match(/const\s+workerCode\s*=\s*`([\s\S]*?)`;/);
  if (m) return { code: m[1], origin: 'game.js 内嵌 workerCode', bundled: false };
  throw new Error('找不到 AI 源码（ai-worker.js 或 workerCode 模板字符串）');
}

function buildEvalSource(code, bundled = false) {
  if (bundled) return code;
  // 若规则已抽到 rules.js，先把纯函数拼进作用域（去 ESM 导出关键字）
  let prefix = '';
  if (exists('rules.js')) {
    prefix = read('rules.js')
      .replace(/^\s*export\s+/gm, '')
      .replace(/^\s*module\.exports[\s\S]*$/m, '') + '\n';
  }
  return prefix + code;
}

const ROWS = 9, COLS = 7;
const RIVERS = [[3,1],[3,2],[4,1],[4,2],[5,1],[5,2],[3,4],[3,5],[4,4],[4,5],[5,4],[5,5]];
const TRAPS = [
  { r: 0, c: 2, side: 'blue' }, { r: 0, c: 4, side: 'blue' }, { r: 1, c: 3, side: 'blue' },
  { r: 8, c: 2, side: 'red' }, { r: 8, c: 4, side: 'red' }, { r: 7, c: 3, side: 'red' }
];
const DENS = [{ r: 0, c: 3, side: 'blue' }, { r: 8, c: 3, side: 'red' }];

function buildBoard(bPos, rPos) {
  const board = Array(ROWS).fill().map(() => Array(COLS).fill(null));
  bPos.forEach(([r, c, rank]) => (board[r][c] = { rank, color: 'blue' }));
  rPos.forEach(([r, c, rank]) => (board[r][c] = { rank, color: 'red' }));
  return board;
}

function toAiMap(board) {
  const aiMap = [];
  for (let x = 0; x < COLS; x++) {
    aiMap[x] = [];
    for (let y = 0; y < ROWS; y++) {
      const p = board[y][x];
      const t = TRAPS.find((t) => t.r === y && t.c === x);
      const d = DENS.find((d) => d.r === y && d.c === x);
      aiMap[x][y] = {
        animal: p ? { rank: p.rank, color: p.color === 'blue' ? 0 : 1, point: { x, y } } : null,
        terrain: RIVERS.some(([rr, cc]) => rr === y && cc === x) ? 'water' : 'land',
        trap: t ? (t.side === 'blue' ? 0 : 1) : -1,
        base: d ? (d.side === 'blue' ? 0 : 1) : -1
      };
    }
  }
  return aiMap;
}

// 统一用 vm 沙箱装载：模拟 self / postMessage，页面与 Worker 的加载顺序都按真实文件来
function createSandbox(extra = {}) {
  const sandbox = { console, ...extra };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

let worker = null;
try {
  const { code, origin, bundled } = loadWorkerSource();
  console.log(`  \u2139 AI 源码来源：${origin}`);
  let out = null;
  const sandbox = createSandbox({ postMessage: (msg) => (out = msg) });
  vm.runInContext(buildEvalSource(code, bundled), sandbox);
  const handler = sandbox.onmessage;
  must('AI worker 暴露 onmessage', typeof handler === 'function');
  const initialMap = () => toAiMap(buildBoard(
    [[0,0,8],[0,6,7],[0,4,6],[2,4,5],[2,2,4],[2,6,3],[1,5,2],[2,0,1]],
    [[8,6,8],[8,0,7],[8,2,6],[6,2,5],[6,4,4],[6,0,3],[7,1,2],[6,6,1]]
  ));
  const t0 = Date.now();
  handler({ data: { map: initialMap(), personality: 'aggressive', maxTime: 1500 } });
  const ms = Date.now() - t0;
  must(`AI 开局返回走法（${ms}ms）`, !!(out && out.point), JSON.stringify(out));
  if (out && out.point) {
    const { x1, y1, x2, y2 } = out.point;
    const inBoard = [x1, x2].every((v) => v >= 0 && v < COLS) && [y1, y2].every((v) => v >= 0 && v < ROWS);
    must('AI 走法坐标在棋盘内', inBoard, JSON.stringify(out.point));
    must('AI 走法为真实位移', x1 !== x2 || y1 !== y2, JSON.stringify(out.point));
    // P2-1：AI 的走法必须能通过主线程同一份规则校验
    const rules = sandbox.AnimalChessRules;
    must('P2-1 AI 走法通过 rules.canMove 校验',
      !!(rules && rules.canMove(initialMap(), x1, y1, x2, y2)), JSON.stringify(out.point));
  }

  // P1-3 回归：搜索被超时中断（maxTime=0）时也不能返回 null / 非法坐标。
  // 旧实现超时 return 0 会污染搜索值；新实现应丢弃不完整层并走合法兜底。
  out = null;
  handler({ data: { map: initialMap(), personality: 'aggressive', maxTime: 0 } });
  must('P1-3 超时中断仍返回合法走法', !!(out && out.point), JSON.stringify(out));
  if (out && out.point) {
    const { x1, y1, x2, y2 } = out.point;
    const inBoard = [x1, x2].every((v) => v >= 0 && v < COLS) && [y1, y2].every((v) => v >= 0 && v < ROWS);
    must('P1-3 超时兜底坐标在棋盘内', inBoard, JSON.stringify(out.point));
    must('P1-3 超时兜底为真实位移', x1 !== x2 || y1 !== y2, JSON.stringify(out.point));
  }
  worker = true;
} catch (e) {
  must('AI worker 可独立加载并运行', false, String(e.message || e).slice(0, 300));
}

console.log('\n=== MUST：规则唯一来源（P2-1） ===');

try {
  const rulesSandbox = createSandbox();
  vm.runInContext(read('rules.js'), rulesSandbox);
  const R = rulesSandbox.AnimalChessRules;
  const isFn = (k) => R && typeof R[k] === 'function';
  must('rules.js 导出 canEat / canMove / getLegalMovesFrom / getAllLegalMoves',
    isFn('canEat') && isFn('canMove') && isFn('getLegalMovesFrom') && isFn('getAllLegalMoves'));

  const eat = (a, f, trap = -1, from = 'land', to = 'land') =>
    R.canEat({ rank: a, color: 0 }, f ? { rank: f, color: 1 } : null, trap, from, to);
  must('P2-1 鼠吃象', eat(1, 8) === true);
  must('P2-1 象不吃鼠', eat(8, 1) === false);
  must('P2-1 等级低者不可捕食', eat(3, 7) === false);
  must('P2-1 陷阱中的防守棋子等级视为 0', eat(3, 7, 0) === true);
  must('P2-1 水中棋子不能攻击岸上', eat(1, 2, -1, 'water', 'land') === false);
  must('P2-1 岸上鼠可吃水中鼠', eat(1, 1, -1, 'land', 'water') === true);

  const move = (bPos, rPos, from, to) => {
    const board = toAiMap(buildBoard(bPos, rPos));
    return R.canMove(board, from[1], from[0], to[1], to[0]);
  };
  must('P2-1 鼠可进河', move([[2,1,1,'blue']], [], [2,1], [3,1]) === true);
  must('P2-1 非鼠不可进河', move([[2,1,3,'blue']], [], [2,1], [3,1]) === false);
  must('P2-1 岸上鼠可跨地形吃水中鼠', move([[2,1,1,'blue']], [[3,1,1,'red']], [2,1], [3,1]) === true);
  must('P2-1 水中鼠不能吃岸上鼠', move([[3,1,1,'blue']], [[2,1,1,'red']], [3,1], [2,1]) === false);
  must('P2-1 狮虎可跨河', move([[2,1,7,'blue']], [], [2,1], [6,1]) === true);
  must('P2-1 跨河被河中棋子阻挡', move([[2,1,7,'blue']], [[4,1,1,'red']], [2,1], [6,1]) === false);
  must('P2-1 跨河不能落在水里', move([[2,1,7,'blue']], [], [2,1], [5,1]) === false);
  must('P2-1 不能进入己方兽穴', move([[1,3,1,'blue']], [], [1,3], [0,3]) === false);
  must('P2-1 可以进入对方兽穴', move([[7,3,1,'blue']], [], [7,3], [8,3]) === true);

  const initialRulesBoard = toAiMap(buildBoard(
    [[0,0,8],[0,6,7],[0,4,6],[2,4,5],[2,2,4],[2,6,3],[1,5,2],[2,0,1]],
    [[8,6,8],[8,0,7],[8,2,6],[6,2,5],[6,4,4],[6,0,3],[7,1,2],[6,6,1]]
  ));
  const blueMoves = R.getAllLegalMoves(initialRulesBoard, 0).length;
  const redMoves = R.getAllLegalMoves(initialRulesBoard, 1).length;
  must('P2-1 开局蓝方 22 步（与原实现一致）', blueMoves === 22, `实际 ${blueMoves}`);
  must('P2-1 开局红方 22 步（与原实现一致）', redMoves === 22, `实际 ${redMoves}`);

  const gameSrc = read('game.js');
  must('P2-1 game.js 不再保留第二套 canEat', !/function\s+canEat\s*\(/.test(gameSrc));
  must('P2-1 game.js 不再保留第二套 checkEat', !/checkEat/.test(gameSrc));
  const html = read('index.html');
  const scriptPos = (name) => html.search(new RegExp(`<script[^>]+src=["'][^"']*${name.replace('.', '\\.')}`));
  must('P2-1 index.html 先加载 rules.js 再加载 game.js',
    scriptPos('rules.js') !== -1 && scriptPos('rules.js') < scriptPos('game.js'));
} catch (e) {
  must('P2-1 规则测试可运行', false, String(e.message || e).slice(0, 300));
}

console.log('\n=== MUST：AI 源码独立（P2-2） ===');

try {
  const gameSrc = read('game.js');
  const html = read('index.html');
  must('P2-2 ai-worker.js 存在', exists('ai-worker.js'));
  must('P2-2 game.js 已无 workerCode 模板字符串', !/const\s+workerCode\s*=\s*`/.test(gameSrc));
  must('P2-2 game.js 通过 AnimalChessAiEngine 构造 Worker', /AnimalChessAiEngine/.test(gameSrc));
  const scriptPos = (name) => html.search(new RegExp(`<script[^>]+src=["'][^"']*${name.replace('.', '\\.')}`));
  must('P2-2 index.html 在 game.js 前加载 ai-worker.js',
    scriptPos('ai-worker.js') !== -1 && scriptPos('ai-worker.js') < scriptPos('game.js'));

  // 独立 worker 场景：importScripts('rules.js') + importScripts('ai-worker.js') 也应自动启动
  const independent = createSandbox({ postMessage: () => {} });
  vm.runInContext(read('rules.js'), independent);
  independent.importScripts = () => {};
  vm.runInContext(read('ai-worker.js'), independent);
  must('P2-2 ai-worker.js 可在独立 Worker 环境自动启动', typeof independent.onmessage === 'function');
} catch (e) {
  must('P2-2 AI 源码独立测试可运行', false, String(e.message || e).slice(0, 300));
}


console.log('\n=== MUST：终局判定（P1-6）与主线程规则一致性（P2-1） ===');

// 在 vm 里加载 config.js + rules.js + game-state.js + game.js，只用纯逻辑方法，不触碰真实 DOM。
function makeHeadlessGame(Game, GameState, config) {
  const g = Object.create(Game.prototype);
  g.state = new GameState(config);
  // 测试用空棋盘：不沿用默认开局摆子
  g.state.board = Array(g.state.rows).fill().map(() => Array(g.state.cols).fill(null));
  g.mode = 'pvp';
  g.isThinking = false;
  g.startTime = Date.now();
  g.log = () => {};
  g.updateUI = () => {};
  g.triggerRedraw = () => {};
  g.shakeEffect = () => {};
  g.aiAction = () => { g._aiCalled = true; };
  g.win = (side) => { g._won = side; g.state.gameOver = true; };
  g.drawGame = (side) => { g._drawn = side; g.state.gameOver = true; };
  g.add = (r, c, rank, color) => {
    g.state.board[r][c] = { rank, color, r, c, name: '\u5b50', x: 0, y: 0, targetX: 0, targetY: 0 };
    return g.state.board[r][c];
  };
  Object.defineProperty(g, 'board', { get: () => g.state.board });
  return g;
}

try {
  const gameSrc = read('game.js');
  const sandbox = { document: { addEventListener() {} } };
  vm.createContext(sandbox);
  vm.runInContext(read('config.js'), sandbox);
  vm.runInContext(read('rules.js'), sandbox);
  vm.runInContext(read('game-state.js'), sandbox);
  vm.runInContext(gameSrc + '\n;globalThis.__Game = Game;', sandbox);
  const Game = sandbox.__Game;
  const R = sandbox.AnimalChessRules;
  const GameState = sandbox.AnimalChessGameState;
  const config = sandbox.AnimalChessConfig;

  // 吃光对方最后一子 → 判负
  {
    const g = makeHeadlessGame(Game, GameState, config);
    const lion = g.add(0, 0, 7, 'red');
    g.add(0, 1, 1, 'blue');
    g.executeMove(lion, 0, 1);
    must('P1-6 吃光对方棋子判负', g._won === 'red', JSON.stringify({ won: g._won, drawn: g._drawn }));
  }

  // 轮走方无合法走法 → 判和
  {
    const g = makeHeadlessGame(Game, GameState, config);
    g.add(0, 0, 7, 'blue'); // 蓝狮被两枚红象堵死
    g.add(0, 1, 8, 'red');
    g.add(1, 0, 8, 'red');
    must('P1-6 无子可动可被识别', !g.hasLegalMoves('blue'));
    g.executeMove(g.add(4, 3, 1, 'red'), 4, 4);
    must('P1-6 无子可动判和', g._drawn === 'blue', JSON.stringify({ won: g._won, drawn: g._drawn }));
  }

  // 进兽穴判胜优先级不变
  {
    const g = makeHeadlessGame(Game, GameState, config);
    g.add(0, 3, 1, 'blue');
    g.executeMove(g.add(1, 3, 7, 'red'), 0, 3);
    must('P1-6 进兽穴仍判胜', g._won === 'red', JSON.stringify({ won: g._won, drawn: g._drawn }));
  }

  // P2-1 主线程与 rules.js 是同一实现：开局所有起点/终点逐一比对
  {
    const g = makeHeadlessGame(Game, GameState, config);
    [[0,0,8],[0,6,7],[0,4,6],[2,4,5],[2,2,4],[2,6,3],[1,5,2],[2,0,1]]
      .forEach(([r, c, rank]) => g.add(r, c, rank, 'blue'));
    [[8,6,8],[8,0,7],[8,2,6],[6,2,5],[6,4,4],[6,0,3],[7,1,2],[6,6,1]]
      .forEach(([r, c, rank]) => g.add(r, c, rank, 'red'));

    const rulesBoard = g.getAiCompatibleMap();
    let mismatches = 0;
    for (let x1 = 0; x1 < COLS; x1++) {
      for (let y1 = 0; y1 < ROWS; y1++) {
        const p = g.board[y1][x1];
        if (!p) continue;
        for (let x2 = 0; x2 < COLS; x2++) {
          for (let y2 = 0; y2 < ROWS; y2++) {
            if (!!g.canMove(p, y2, x2) !== !!R.canMove(rulesBoard, x1, y1, x2, y2)) mismatches++;
          }
        }
      }
    }
    must('P2-1 主线程 canMove 与 rules.canMove 开局全坐标一致', mismatches === 0, `不一致 ${mismatches} 处`);

    const blueGame = g.getAllValidMoves('blue').length;
    const redGame = g.getAllValidMoves('red').length;
    must('P2-1 主线程 getAllValidMoves 与 rules 一致',
      blueGame === R.getAllLegalMoves(rulesBoard, 0).length && redGame === R.getAllLegalMoves(rulesBoard, 1).length,
      `游戏 ${blueGame}/${redGame}`);
    must('P2-1 开局合法步数 22/22（回归基线）', blueGame === 22 && redGame === 22, `蓝 ${blueGame} / 红 ${redGame}`);
  }
} catch (e) {
  must('P1-6 / P2-1 逻辑测试可运行', false, String(e.message || e).slice(0, 300));
}

console.log('\n=== MUST：渲染/状态拆分（P2-3） ===');

try {
  const html = read('index.html');
  const scriptPos = (name) => html.search(new RegExp(`<script[^>]+src=["'][^"']*${name.replace('.', '\\.')}`));
  const order = ['config.js', 'rules.js', 'ai-worker.js', 'renderer.js', 'game-state.js', 'game.js'].map(scriptPos);
  must('P2-3 renderer.js / game-state.js 存在', exists('renderer.js') && exists('game-state.js'));
  must('P2-3 index.html 依次加载 config → rules → ai-worker → renderer → game-state → game',
    order.every((p, i) => p !== -1 && (i === 0 || order[i - 1] < p)), JSON.stringify(order));

  const gameSrc = read('game.js');
  must('P2-3 game.js 不再直接操作 canvas 绘制',
    !/getContext\s*\(|fillRect|strokeRect|fillText|clearRect|roundRect/.test(gameSrc));
  must('P2-3 game.js 仍为入口（DOMContentLoaded + new Game）',
    /DOMContentLoaded/.test(gameSrc) && /new Game\s*\(/.test(gameSrc));

  const sandbox = { document: { addEventListener() {} } };
  vm.createContext(sandbox);
  vm.runInContext(read('config.js'), sandbox);
  vm.runInContext(read('rules.js'), sandbox);
  vm.runInContext(read('renderer.js'), sandbox);
  vm.runInContext(read('game-state.js'), sandbox);
  const Config = sandbox.AnimalChessConfig;
  const GameState = sandbox.AnimalChessGameState;
  const Renderer = sandbox.AnimalChessRenderer;
  const R = sandbox.AnimalChessRules;

  must('P2-3 暴露 AnimalChessRenderer / AnimalChessGameState',
    typeof Renderer === 'function' && typeof GameState === 'function');

  const state = new GameState(Config);
  must('P2-3 GameState 初始化 16 子、红先、未终局',
    state.board.flat().filter(Boolean).length === 16 && state.turn === 'red' && !state.gameOver);

  // 无 DOM 渲染冒烟：用假的 2D context 调 draw，必须产生实际绘制调用且不抛错
  const draws = { fillRect: 0, fillText: 0, arc: 0, strokeRect: 0 };
  const ctx = new Proxy({}, {
    get(t, k) {
      if (Object.prototype.hasOwnProperty.call(draws, k)) return () => { draws[k]++; };
      if (!(k in t)) t[k] = () => {};
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const renderer = new Renderer(canvas, Config);
  let drawError = '';
  try {
    renderer.draw(state.board, state.board[0][0]);
  } catch (e) {
    drawError = String(e.message || e);
  }
  must('P2-3 Renderer 可无 DOM 绘制（河道/陷阱/兽穴/棋子均有绘制）',
    !drawError && draws.fillRect > 0 && draws.strokeRect > 0 && draws.arc > 0 && draws.fillText > 0, drawError);
  must('P2-3 Renderer 按配置设置画布尺寸',
    canvas.width === Config.BOARD.cols * Config.BOARD.cell && canvas.height === Config.BOARD.rows * Config.BOARD.cell,
    `${canvas.width}x${canvas.height}`);

  // GameState 与 rules.js 仍是同一实现（拆分不能引入第二套规则）
  const rulesBoard = state.getAiCompatibleMap();
  let stateMismatches = 0;
  for (let x1 = 0; x1 < COLS; x1++) {
    for (let y1 = 0; y1 < ROWS; y1++) {
      const p = state.board[y1][x1];
      if (!p) continue;
      for (let x2 = 0; x2 < COLS; x2++) {
        for (let y2 = 0; y2 < ROWS; y2++) {
          if (!!state.canMove(p, y2, x2) !== !!R.canMove(rulesBoard, x1, y1, x2, y2)) stateMismatches++;
        }
      }
    }
  }
  must('P2-3 GameState.canMove 全坐标与 rules 一致', stateMismatches === 0, `不一致 ${stateMismatches} 处`);
} catch (e) {
  must('P2-3 渲染/状态拆分测试可运行', false, String(e.message || e).slice(0, 300));
}

console.log('\n=== MUST：配置分离（P2-4） ===');

try {
  const html = read('index.html');
  const scriptPos = (name) => html.search(new RegExp(`<script[^>]+src=["'][^"']*${name.replace('.', '\\.')}`));
  must('P2-4 config.js 存在并在 rules.js 之前加载',
    exists('config.js') && scriptPos('config.js') !== -1 && scriptPos('config.js') < scriptPos('rules.js'));

  const sandbox = createSandbox();
  vm.runInContext(read('config.js'), sandbox);
  const Config = sandbox.AnimalChessConfig;
  must('P2-4 配置暴露 VERSION / BOARD / RULES / UI_TEXT',
    !!Config && typeof Config.VERSION === 'string' &&
    !!(Config.BOARD && Config.RULES && Config.UI_TEXT));
  must('P2-4 规则数据独立为 RULES（rivers/traps/dens/pst）',
    !!(Config.RULES.rivers && Config.RULES.traps && Config.RULES.dens && Config.RULES.pst));
  must('P2-4 UI 文案独立为 UI_TEXT（不含规则数据）',
    typeof Config.UI_TEXT.redTurn === 'string' &&
    !Object.prototype.hasOwnProperty.call(Config.UI_TEXT, 'rivers') &&
    Config.UI_TEXT !== Config.RULES);
  must('P2-4 迁移后规则数据未变（rivers/traps/dens 与基线一致）',
    JSON.stringify(Config.RULES.rivers) === JSON.stringify(RIVERS) &&
    JSON.stringify(Config.RULES.traps) === JSON.stringify(TRAPS) &&
    JSON.stringify(Config.RULES.dens) === JSON.stringify(DENS));
  must('P2-4 开局摆子数据移入配置（蓝红各 8 子）',
    Config.RULES.startPositions.blue.length === 8 && Config.RULES.startPositions.red.length === 8);

  const gameSrc = read('game.js');
  must('P2-4 game.js 不再内嵌规则数据',
    !/(rivers|traps|dens|pst)\s*:/.test(gameSrc), 'game.js 仍有规则数据字面量');
  must('P2-4 game.js 改为消费 AnimalChessConfig', /AnimalChessConfig/.test(gameSrc));
} catch (e) {
  must('P2-4 配置分离测试可运行', false, String(e.message || e).slice(0, 300));
}

console.log('\n=== TARGET：任务进度（不阻断提交）===');

target('P2-1 规则已抽到 rules.js', exists('rules.js'));
target('P2-2 AI 已移出模板字符串', !!(exists('ai-worker.js') || exists('worker.js')));
target('P2-3 Game 已拆分渲染/状态职责', exists('renderer.js') && exists('game-state.js'));
target('P2-4 配置已分离', exists('config.js'));
target('P3-3 已适配 devicePixelRatio', /(window|self|globalThis)\.devicePixelRatio/.test(
  (exists('renderer.js') ? read('renderer.js') : '') + (exists('game.js') ? read('game.js') : '')));
target('P3-4 存在响应式样式', exists('style.css') && /@media/.test(read('style.css')));
target('P3-5 日志有上限', exists('game.js') && /MAX_LOGS|max.*log|maxLogs|children\.length\s*>/.test(read('game.js')));
target('P4-1 存在 ESLint 配置', ['eslint.config.js', 'eslint.config.mjs', '.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.cjs'].some(exists));
target('P4-3 存在 LICENSE', exists('LICENSE'));
target('P4-5 HTML 无占位符', exists('index.html') && !/APP_TITLE|MODE_A|MODE_B/.test(read('index.html')));

for (const t of targets) {
  console.log(`  ${t.cond ? '\u2705' : '\u2b1c'} ${t.name}`);
}

console.log(`\n=== 结果：MUST ${mustFail === 0 ? '全绿 \u2705' : `${mustFail} 项失败 \u274c`} ===`);
process.exit(mustFail === 0 ? 0 : 1);
