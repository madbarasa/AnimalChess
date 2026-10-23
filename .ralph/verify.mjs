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

// 3. AI worker 源码抽取（兼容内嵌 / 独立文件 / 独立 rules）
function loadWorkerSource() {
  if (!exists('game.js')) throw new Error('game.js 不存在');
  const src = read('game.js');
  const m = src.match(/const\s+workerCode\s*=\s*`([\s\S]*?)`;/);
  if (m) return { code: m[1], origin: 'game.js 内嵌 workerCode' };
  for (const cand of ['ai-worker.js', 'worker.js']) {
    if (exists(cand)) return { code: read(cand), origin: cand };
  }
  throw new Error('找不到 AI 源码（workerCode 模板字符串 或 ai-worker.js）');
}

function buildEvalSource(code) {
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

let worker = null;
try {
  const { code, origin } = loadWorkerSource();
  console.log(`  \u2139 AI 源码来源：${origin}`);
  const fn = new Function('postMessage', 'let onmessage;' + buildEvalSource(code) + '; return onmessage;');
  let out = null;
  const handler = fn((msg) => (out = msg));
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

console.log('\n=== TARGET：任务进度（不阻断提交）===');

target('P2-1 规则已抽到 rules.js', exists('rules.js'));
target('P2-2 AI 已移出模板字符串', !!(exists('ai-worker.js') || exists('worker.js')));
target('P3-3 已适配 devicePixelRatio', exists('game.js') && /devicePixelRatio/.test(read('game.js')));
target('P3-4 存在响应式样式', exists('style.css') && /@media/.test(read('style.css')));
target('P3-5 日志有上限', exists('game.js') && /(maxLog|LOG_LIMIT|slice\(0,\s*\d+\))/.test(read('game.js')));
target('P4-1 存在 ESLint 配置', ['eslint.config.js', 'eslint.config.mjs', '.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.cjs'].some(exists));
target('P4-3 存在 LICENSE', exists('LICENSE'));
target('P4-5 HTML 无占位符', exists('index.html') && !/APP_TITLE|MODE_A|MODE_B/.test(read('index.html')));

for (const t of targets) {
  console.log(`  ${t.cond ? '\u2705' : '\u2b1c'} ${t.name}`);
}

console.log(`\n=== 结果：MUST ${mustFail === 0 ? '全绿 \u2705' : `${mustFail} 项失败 \u274c`} ===`);
process.exit(mustFail === 0 ? 0 : 1);
