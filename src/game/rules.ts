/**
 * 斗兽棋 3D - 游戏规则核心实现
 */

import { CONFIG, isRiver } from '../config';

export interface CellData {
  animal: AnimalData | null;
  terrain: 'land' | 'water';
  trapSide: 'blue' | 'red' | null;
  denSide: 'blue' | 'red' | null;
}

export interface AnimalData {
  rank: number;
  color: 'red' | 'blue';
  row: number;
  col: number;
}

export interface Move {
  x1: number; // column
  y1: number; // row
  x2: number;
  y2: number;
}

export type Board = CellData[][];

/** Create an empty board */
export function createEmptyBoard(): Board {
  const board: Board = [];
  for (let x = 0; x < CONFIG.BOARD.cols; x++) {
    board[x] = [];
    for (let y = 0; y < CONFIG.BOARD.rows; y++) {
      board[x][y] = {
        animal: null,
        terrain: isRiver(y, x) ? 'water' : 'land',
        trapSide: getTrapSideImpl(y, x),
        denSide: getDenSideImpl(y, x),
      };
    }
  }
  return board;
}

/** Place animals on the board according to starting positions */
export function placeStartingAnimals(board: Board): void {
  CONFIG.START_POSITIONS.blue.forEach((pos) => {
    placeAnimal(board, pos.col, pos.row, { rank: pos.rank, color: 'blue', row: pos.row, col: pos.col });
  });
  CONFIG.START_POSITIONS.red.forEach((pos) => {
    placeAnimal(board, pos.col, pos.row, { rank: pos.rank, color: 'red', row: pos.row, col: pos.col });
  });
}

/** Place a single animal on the board */
export function placeAnimal(board: Board, col: number, row: number, animal: AnimalData): void {
  if (!isInBounds(col, row)) return;
  board[col][row].animal = { ...animal };
}

/** Check if coordinates are within board bounds */
export function isInBounds(x: number, y: number): boolean {
  return x >= 0 && x < CONFIG.BOARD.cols && y >= 0 && y < CONFIG.BOARD.rows;
}

/** Predation rule: can animal eat foe? */
export function canEat(
  animal: AnimalData,
  foe: AnimalData | null,
  targetTrapSide: 'blue' | 'red' | null,
  fromTerrain: 'land' | 'water',
  toTerrain: 'land' | 'water',
): boolean {
  if (!foe) return true;
  // Enemy in our trap: their rank becomes 0
  if (targetTrapSide === animal.color) return true;
  // Water creatures cannot attack land creatures
  if (fromTerrain === 'water' && toTerrain !== 'water') return false;
  // Mouse eats elephant (rank 1 eats 8)
  if (animal.rank === 1 && foe.rank === 8) return true;
  // Elephant does not eat mouse
  if (animal.rank === 8 && foe.rank === 1) return false;
  // Normal rank comparison
  return animal.rank >= foe.rank;
}

/** Check if a single-step move is valid */
export function canMove(
  board: Board,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  if (!isInBounds(x1, y1) || !isInBounds(x2, y2)) return false;
  const from = board[x1][y1];
  const to = board[x2][y2];
  if (!from.animal || !to) return false;

  const animal = from.animal;
  // Cannot capture own pieces
  if (to.animal && to.animal.color === animal.color) return false;
  // Cannot enter own den
  if (to.denSide === animal.color) return false;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.abs(dx) + Math.abs(dy);

  // Lion/Tiger leap over river: must travel straight over consecutive water cells
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
      if (riverCount >= 1) {
        return canEat(animal, to.animal, to.trapSide, from.terrain, to.terrain);
      }
    }
  }

  // Adjacent moves only
  if (dist !== 1) return false;
  // Only mice can enter water
  if (to.terrain === 'water' && animal.rank !== 1) return false;
  return canEat(animal, to.animal, to.trapSide, from.terrain, to.terrain);
}

/** Get all legal moves for a piece at given position */
export function getLegalMovesFrom(board: Board, x: number, y: number): Move[] {
  const moves: Move[] = [];
  if (!isInBounds(x, y) || !board[x][y].animal) return moves;

  const animal = board[x][y].animal;
  
  // Four adjacent directions
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (const [dx, dy] of directions) {
    if (canMove(board, x, y, x + dx, y + dy)) {
      moves.push({ x1: x, y1: y, x2: x + dx, y2: y + dy });
    }
  }

  // Lion/Tiger river leap attempts (distances 3 or 4)
  if (animal.rank === 6 || animal.rank === 7) {
    const leaps = [[0, -3], [3, 0], [0, 3], [-3, 0], [0, -4], [4, 0], [0, 4], [-4, 0]];
    for (const [dx, dy] of leaps) {
      if (canMove(board, x, y, x + dx, y + dy)) {
        moves.push({ x1: x, y1: y, x2: x + dx, y2: y + dy });
      }
    }
  }

  return moves;
}

/** Get all legal moves for one side */
export function getAllLegalMoves(board: Board, color: 'red' | 'blue'): Move[] {
  const moves: Move[] = [];
  for (let x = 0; x < CONFIG.BOARD.cols; x++) {
    for (let y = 0; y < CONFIG.BOARD.rows; y++) {
      const cell = board[x][y];
      if (!cell.animal || cell.animal.color !== color) continue;
      moves.push(...getLegalMovesFrom(board, x, y));
    }
  }
  return moves;
}

/** Simulate a move and return new board state */
export function simulateMove(board: Board, move: Move): Board {
  const newBoard: Board = [];
  for (let x = 0; x < CONFIG.BOARD.cols; x++) {
    newBoard[x] = [];
    for (let y = 0; y < CONFIG.BOARD.rows; y++) {
      const cell = board[x][y];
      const animal = cell.animal;
      newBoard[x][y] = {
        terrain: cell.terrain,
        trapSide: cell.trapSide,
        denSide: cell.denSide,
        animal: animal ? { ...animal } : null,
      };
    }
  }
  // Apply move
  newBoard[move.x2][move.y2].animal = newBoard[move.x1][move.y1].animal;
  newBoard[move.x1][move.y1].animal = null;
  if (newBoard[move.x2][move.y2].animal) {
    newBoard[move.x2][move.y2].animal!.row = move.y2;
    newBoard[move.x2][move.y2].animal!.col = move.x2;
  }
  return newBoard;
}

// Internal helper functions
function getTrapSideImpl(row: number, col: number): 'blue' | 'red' | null {
  const trap = CONFIG.TRAPS.find((t) => t.row === row && t.col === col);
  return trap?.side ?? null;
}

function getDenSideImpl(row: number, col: number): 'blue' | 'red' | null {
  const den = CONFIG.DENS.find((d) => d.row === row && d.col === col);
  return den?.side ?? null;
}
