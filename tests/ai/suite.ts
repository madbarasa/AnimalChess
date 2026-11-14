import { installAiWorker, type WorkerGlobal, type SerializedCell, type SearchResponse, type SearchRequest } from '../../src/game/aiEngine';
import { createEmptyBoard, placeStartingAnimals, getLegalMovesFrom, type Board, type Move } from '../../src/game/rules';

// 河道格（行, 列）：行 3/4/5，列 1/2/4/5。非鼠棋子不得位于其中。
const WATER = new Set([3, 4, 5].flatMap((r) => [1, 2, 4, 5].map((c) => `${r},${c}`)));

interface Case {
  name: string;
  board: Board;
  side: 'red' | 'blue';
  expectWinAt?: { x2: number; y2: number };
  expectCaptureAt?: { x2: number; y2: number };
  forbidden?: { x2: number; y2: number };
}

function put(b: Board, col: number, row: number, rank: number, color: 'red' | 'blue'): void {
  if (rank !== 1 && WATER.has(`${row},${col}`)) {
    throw new Error(`非法测试摆位：非鼠棋子 (${col},${row}) 位于河道`);
  }
  b[col][row].animal = { rank, color, row, col };
}

function serialize(board: Board): SerializedCell[][] {
  const cells: SerializedCell[][] = [];
  for (let x = 0; x < 7; x++) {
    cells[x] = [];
    for (let y = 0; y < 9; y++) {
      const a = board[x][y].animal;
      cells[x][y] = a ? { rank: a.rank, color: a.color === 'red' ? 1 : 0 } : { rank: 0, color: 0 };
    }
  }
  return cells;
}

function clearBoard(): Board {
  const b = createEmptyBoard();
  for (let x = 0; x < 7; x++) for (let y = 0; y < 9; y++) b[x][y].animal = null;
  return b;
}

function run(cells: SerializedCell[][], side: 'red' | 'blue', maxTimeMs: number): SearchResponse {
  let response: SearchResponse | null = null;
  const g: WorkerGlobal = {
    onmessage: null,
    postMessage: (m) => { response = m; },
  };
  installAiWorker(g);
  g.onmessage!({ data: { cells, side, maxTimeMs, requestId: 1 } as SearchRequest });
  if (!response) throw new Error('no response');
  return response;
}

const cases: Case[] = [];

// 1. 蓝方一步进红穴获胜
{
  const b = clearBoard();
  put(b, 3, 7, 7, 'blue');
  put(b, 0, 0, 2, 'red');
  put(b, 6, 8, 3, 'red');
  cases.push({ name: '蓝方一步进红兽穴立即取胜', board: b, side: 'blue', expectWinAt: { x2: 3, y2: 8 } });
}
// 2. 红方一步进蓝穴获胜
{
  const b = clearBoard();
  put(b, 3, 1, 7, 'red');
  put(b, 0, 8, 2, 'blue');
  put(b, 6, 0, 3, 'blue');
  cases.push({ name: '红方一步进蓝兽穴立即取胜', board: b, side: 'red', expectWinAt: { x2: 3, y2: 0 } });
}
// 3. 蓝象有免费捕食机会必须抓住（红方余子远离己方兽穴，无竞速干扰）
{
  const b = clearBoard();
  put(b, 3, 2, 8, 'blue'); // 蓝象
  put(b, 3, 3, 3, 'red');  // 红狗
  put(b, 1, 7, 4, 'red');
  put(b, 5, 7, 4, 'red');
  cases.push({ name: '蓝象抓住机会吃红狗', board: b, side: 'blue', expectCaptureAt: { x2: 3, y2: 3 } });
}
// 4. 蓝象吃红象（同级可吃），红鼠与红狮不可吃
{
  const b = clearBoard();
  put(b, 3, 4, 8, 'blue');
  put(b, 3, 3, 8, 'red'); // 红象可吃
  put(b, 3, 5, 1, 'red'); // 红鼠：象不可吃
  put(b, 0, 3, 7, 'red'); // 红狮：象可吃，但不同方向
  put(b, 6, 0, 4, 'red');
  put(b, 6, 8, 4, 'red');
  cases.push({ name: '蓝象选择吃红象', board: b, side: 'blue', expectCaptureAt: { x2: 3, y2: 3 } });
}
// 5. 鼠吃象特例
{
  const b = clearBoard();
  put(b, 3, 4, 1, 'blue');
  put(b, 3, 3, 8, 'red');
  put(b, 0, 0, 4, 'red');
  put(b, 6, 8, 4, 'red');
  cases.push({ name: '蓝鼠吃红象', board: b, side: 'blue', expectCaptureAt: { x2: 3, y2: 3 } });
}
// 6. 蓝猫被红狮威胁时必须逃到安全格，不能主动贴近
{
  const b = clearBoard();
  put(b, 3, 4, 2, 'blue'); // 蓝猫
  put(b, 3, 6, 7, 'red');  // 红狮（两格外，下一手可逼近）
  put(b, 0, 0, 4, 'red');
  put(b, 6, 8, 4, 'red');
  cases.push({ name: '受威胁蓝猫不主动靠向红狮', board: b, side: 'blue', forbidden: { x2: 3, y2: 5 } });
}
// 7. 开局蓝方走法合法
{
  const b = createEmptyBoard();
  placeStartingAnimals(b);
  cases.push({ name: '开局蓝方走法合法', board: b, side: 'blue' });
}

let failures = 0;
for (const c of cases) {
  const res = run(serialize(c.board), c.side, 1200);
  const move = res.move;
  let pass = true;
  const notes: string[] = [];
  if (!move) {
    pass = false;
    notes.push('无走法');
  } else {
    const legal = getLegalMovesFrom(c.board, move.x1, move.y1).some(
      (m: Move) => m.x2 === move.x2 && m.y2 === move.y2,
    );
    if (!legal) { pass = false; notes.push(`走法非法 ${JSON.stringify(move)}`); }
    if (c.expectWinAt && (move.x2 !== c.expectWinAt.x2 || move.y2 !== c.expectWinAt.y2)) {
      pass = false; notes.push(`未选立即获胜走法 ${JSON.stringify(move)}`);
    }
    if (c.expectCaptureAt && (move.x2 !== c.expectCaptureAt.x2 || move.y2 !== c.expectCaptureAt.y2)) {
      pass = false; notes.push(`未选预期捕食走法 ${JSON.stringify(move)}`);
    }
    if (c.forbidden && move.x2 === c.forbidden.x2 && move.y2 === c.forbidden.y2) {
      pass = false; notes.push(`走了禁止走法 ${JSON.stringify(move)}`);
    }
  }
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${c.name} | depth=${res.depth} nodes=${res.nodes} elapsed=${res.elapsedMs}ms | move=${JSON.stringify(move)}${notes.length ? ' | ' + notes.join('; ') : ''}`);
}

// 极短时间预算下也必须返回合法走法（超时安全兜底）
{
  const b = createEmptyBoard();
  placeStartingAnimals(b);
  const res = run(serialize(b), 'blue', 1);
  const legal = res.move ? getLegalMovesFrom(b, res.move.x1, res.move.y1).some(
    (m: Move) => m.x2 === res.move!.x2 && m.y2 === res.move!.y2,
  ) : false;
  if (!legal) failures++;
  console.log(`${legal ? 'PASS' : 'FAIL'} | 1ms 极短预算仍返回合法走法 | depth=${res.depth} elapsed=${res.elapsedMs}ms | move=${JSON.stringify(res.move)}`);
}

// 无子可动时返回 null
{
  const b = clearBoard();
  put(b, 0, 0, 2, 'red');
  const res = run(serialize(b), 'blue', 100);
  const ok = res.move === null;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} | 蓝方无子可动返回 null | move=${JSON.stringify(res.move)}`);
}

console.log(`\n总计: ${cases.length + 2} 项，失败 ${failures} 项`);
if (failures > 0) process.exit(1);
