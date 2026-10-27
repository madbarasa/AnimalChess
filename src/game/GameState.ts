/**
 * 斗兽棋 3D - 游戏状态管理
 */

import { CONFIG } from '../config';
import {
  Board,
  type AnimalData,
  createEmptyBoard,
  placeStartingAnimals,
  canMove as rulesCanMove,
  getAllLegalMoves,
} from './rules';

export interface PieceVisual {
  rank: number;
  color: 'red' | 'blue';
  row: number;
  col: number;
  name: string;
  visualX: number; // for animation interpolation
  visualY: number;
  targetX: number;
  targetY: number;
}

export interface GameMove {
  piece: PieceVisual;
  toRow: number;
  toCol: number;
}

export interface MoveResult {
  captured: PieceVisual | null;
  winner?: 'red' | 'blue';
  draw?: 'red' | 'blue';
}

export class GameState {
  public readonly board: Board;
  public readonly pieces: Map<string, PieceVisual>;
  public turn: 'red' | 'blue';
  public gameOver: boolean;
  public selected: PieceVisual | null;
  public startTime: number;

  private readonly cellSize: number;

  constructor() {
    this.board = createEmptyBoard();
    placeStartingAnimals(this.board);
    this.pieces = new Map();
    this.turn = 'red';
    this.gameOver = false;
    this.selected = null;
    this.startTime = Date.now();
    this.cellSize = CONFIG.BOARD.cellSize;

    this.initializePieces();
  }

  /** Reset game to initial state */
  reset(): void {
    this.board.length = 0;
    for (let x = 0; x < CONFIG.BOARD.cols; x++) {
      this.board[x] = [];
      for (let y = 0; y < CONFIG.BOARD.rows; y++) {
        this.board[x][y] = {
          animal: null,
          terrain: this.isRiver(y, x) ? 'water' : 'land',
          trapSide: this.getTrapSideImpl(y, x),
          denSide: this.getDenSideImpl(y, x),
        };
      }
    }
    placeStartingAnimals(this.board);
    this.pieces.clear();
    this.turn = 'red';
    this.gameOver = false;
    this.selected = null;
    this.startTime = Date.now();
    this.initializePieces();
  }

  private initializePieces(): void {
    for (let r = 0; r < CONFIG.BOARD.rows; r++) {
      for (let c = 0; c < CONFIG.BOARD.cols; c++) {
        const animal = this.board[c][r].animal;
        if (animal) {
          const pieceName = CONFIG.PIECES[animal.rank - 1].name;
          this.pieces.set(`${c}_${r}`, {
            rank: animal.rank,
            color: animal.color,
            row: r,
            col: c,
            name: pieceName,
            visualX: c * this.cellSize,
            visualY: r * this.cellSize,
            targetX: c * this.cellSize,
            targetY: r * this.cellSize,
          });
        }
      }
    }
  }

  isRiver(row: number, col: number): boolean {
    return CONFIG.RIVERS.some(([r, c]) => r === row && c === col);
  }

  getTrapSideImpl(row: number, col: number): 'blue' | 'red' | null {
    const trap = CONFIG.TRAPS.find((t) => t.row === row && t.col === col);
    return trap?.side ?? null;
  }

  getDenSideImpl(row: number, col: number): 'blue' | 'red' | null {
    const den = CONFIG.DENS.find((d) => d.row === row && d.col === col);
    return den?.side ?? null;
  }

  /** Check if move is legal */
  canMove(piece: PieceVisual, targetRow: number, targetCol: number): boolean {
    return rulesCanMove(
      this.board,
      piece.col,
      piece.row,
      targetCol,
      targetRow,
    );
  }

  /** Get all valid moves for a side */
  getAllValidMoves(color: 'red' | 'blue'): GameMove[] {
    const moves = getAllLegalMoves(this.board, color);
    const result: GameMove[] = [];
    for (const move of moves) {
      const key = `${move.x1}_${move.y1}`;
      const piece = this.pieces.get(key);
      if (piece) {
        result.push({
          piece,
          toRow: move.y2,
          toCol: move.x2,
        });
      }
    }
    return result;
  }

  /** Count remaining pieces for one side */
  countPieces(color: 'red' | 'blue'): number {
    let count = 0;
    for (const piece of this.pieces.values()) {
      if (piece.color === color) count++;
    }
    return count;
  }

  /** Check if one side has any legal moves */
  hasLegalMoves(color: 'red' | 'blue'): boolean {
    return getAllLegalMoves(this.board, color).length > 0;
  }

  /** Check if enemy den is occupied by own piece */
  isDenOccupied(color: 'red' | 'blue'): boolean {
    const enemyDen = CONFIG.DENS.find((d) => d.side !== color);
    if (!enemyDen) return false;
    const cell = this.board[enemyDen.col][enemyDen.row];
    return !!cell.animal && cell.animal.color === color;
  }

  /** Apply a legal move and return result */
  applyMove(piece: PieceVisual, targetRow: number, targetCol: number): MoveResult {
    const captured = this.board[targetCol][targetRow]?.animal
      ? this.pieces.get(`${targetCol}_${targetRow}`) ?? null
      : null;

    // Remove from old position
    const oldKey = `${piece.col}_${piece.row}`;
    this.board[piece.col][piece.row].animal = null;
    this.pieces.delete(oldKey);

    // Update piece position
    piece.row = targetRow;
    piece.col = targetCol;
    piece.targetX = targetCol * this.cellSize;
    piece.targetY = targetRow * this.cellSize;

    // Add to new position
    const newKey = `${targetCol}_${targetRow}`;
    this.board[targetCol][targetRow].animal = {
      rank: piece.rank,
      color: piece.color,
      row: targetRow,
      col: targetCol,
    } as AnimalData;
    this.pieces.set(newKey, piece);
    this.selected = null;

    // Check win conditions
    if (this.isDenOccupied(piece.color)) {
      this.gameOver = true;
      return { captured, winner: piece.color };
    }

    // Check if enemy has no pieces left
    const foeColor = piece.color === 'red' ? 'blue' : 'red';
    if (this.countPieces(foeColor) === 0) {
      this.gameOver = true;
      return { captured, winner: piece.color };
    }

    // Switch turns
    this.turn = this.turn === 'red' ? 'blue' : 'red';

    // Check if current side has no legal moves (draw)
    if (!this.hasLegalMoves(this.turn)) {
      this.gameOver = true;
      return { captured, draw: this.turn };
    }

    return { captured };
  }

  /** Animate piece movement interpolation */
  animatePieces(): void {
    const speed = 0.25;
    for (const piece of this.pieces.values()) {
      const dx = piece.targetX - piece.visualX;
      const dy = piece.targetY - piece.visualY;
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        piece.visualX += dx * speed;
        piece.visualY += dy * speed;
      } else {
        piece.visualX = piece.targetX;
        piece.visualY = piece.targetY;
      }
    }
  }

  /** Check if any piece is still animating */
  isAnimating(): boolean {
    for (const piece of this.pieces.values()) {
      if (Math.abs(piece.targetX - piece.visualX) > 0.01 ||
          Math.abs(piece.targetY - piece.visualY) > 0.01) {
        return true;
      }
    }
    return false;
  }
}
