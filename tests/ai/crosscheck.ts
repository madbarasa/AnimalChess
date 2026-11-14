import { createEmptyBoard, placeStartingAnimals, getLegalMovesFrom, getAllLegalMoves, type Board } from '../../src/game/rules';
import { __test } from '../../src/game/aiEngine';
import type { SerializedCell } from '../../src/game/aiEngine';

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

const b: Board = createEmptyBoard();
placeStartingAnimals(b);
const compact = __test.serializeToCompact(serialize(b));
const engineMoves = __test.generateMoves(compact, 'blue');
const rulesMoves = getAllLegalMoves(b, 'blue');

const key = (m: { x1: number; y1: number; x2: number; y2: number }): string =>
  `${m.x1},${m.y1},${m.x2},${m.y2}`;
const ruleSet = new Set(rulesMoves.map(key));
const engineSet = new Set(engineMoves.map(key));

const onlyRules = [...ruleSet].filter((k) => !engineSet.has(k));
const onlyEngine = [...engineSet].filter((k) => !ruleSet.has(k));

console.log(`规则生成 ${rulesMoves.length} 步，引擎生成 ${engineMoves.length} 步`);
if (onlyRules.length) console.log('仅规则有:', onlyRules.join(' | '));
if (onlyEngine.length) console.log('仅引擎有:', onlyEngine.join(' | '));
console.log(`差异合计 ${onlyRules.length + onlyEngine.length} 处`);
if (onlyRules.length || onlyEngine.length) process.exit(1);
