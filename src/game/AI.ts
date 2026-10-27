/**
 * 斗兽棋 3D - AI 引擎 (Alpha-Beta 剪枝)
 */

import { CONFIG } from '../config';
import { Board, AnimalData, Move, getLegalMovesFrom, isInBounds, simulateMove } from './rules';

export interface AIMove {
  move: Move;
  score: number;
}

export class AIEngine {
  private maxTime: number;
  private depth: number;

  constructor(maxTimeMs = 500, searchDepth = 6) {
    this.maxTime = maxTimeMs;
    this.depth = searchDepth;
  }

  /** 为指定一方搜索最佳走法（Alpha-Beta 剪枝） */
  getBestMove(board: Board, side: 'red' | 'blue'): Move | null {
    const startTime = Date.now();
    const isRedTurn = side === 'red';
    let bestDecision: Move | null = null;
    let bestValue = isRedTurn ? -Infinity : Infinity;

    // 候选走法先做启发式排序，提高剪枝效率
    const candidateMoves = this.getCandidateMovesWithScore(board, side);

    if (candidateMoves.length === 0) return null;

    for (const candidate of candidateMoves) {
      const newBoard = simulateMove(board, candidate.move);
      const value = this.alphaBeta(
        newBoard,
        this.depth - 1,
        -Infinity,
        Infinity,
        !isRedTurn,
        startTime,
      );

      if (value !== null) {
        if (isRedTurn ? value > bestValue : value < bestValue) {
          bestValue = value;
          bestDecision = candidate.move;
        }
      }

      if (Date.now() - startTime >= this.maxTime) break;
    }

    return bestDecision;
  }

  private getCandidateMovesWithScore(board: Board, color: 'red' | 'blue'): Array<{ move: Move; score: number }> {
    const candidates: Array<{ move: Move; score: number }> = [];
    
    for (let x = 0; x < CONFIG.BOARD.cols; x++) {
      for (let y = 0; y < CONFIG.BOARD.rows; y++) {
        const cell = board[x][y];
        if (!cell.animal || cell.animal.color !== color) continue;
        
        const moves = getLegalMovesFrom(board, x, y);
        for (const move of moves) {
          let score = 0;
          // Prioritize capturing enemy pieces
          if (board[move.x2][move.y2].animal) {
            score = 100 + board[move.x2][move.y2].animal!.rank * 10;
          }
          // Highest priority: entering enemy den
          if (board[move.x2][move.y2].denSide !== null && 
              board[move.x2][move.y2].denSide !== color) {
            score = 1000;
          } else if (move.y2 >= 3 && move.y2 <= 5) {
            score += 5; // Center area control
          }
          candidates.push({ move, score });
        }
      }
    }
    
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }

  private alphaBeta(
    board: Board,
    ply: number,
    alpha: number,
    beta: number,
    isRedTurn: boolean,
    startTime: number,
  ): number | null {
    // Time limit check
    if (Date.now() - startTime >= this.maxTime) {
      return null;
    }

    // Terminal state checks
    const exitValue = this.exitCondition(board, ply, isRedTurn);
    if (exitValue !== null) return exitValue;

    if (ply === 0) {
      return this.evaluate(board, isRedTurn);
    }

    const color = isRedTurn ? 'red' : 'blue';
    let allMoves: Move[] = [];
    
    for (let x = 0; x < CONFIG.BOARD.cols; x++) {
      for (let y = 0; y < CONFIG.BOARD.rows; y++) {
        const cell = board[x][y];
        if (!cell.animal || cell.animal.color !== color) continue;
        allMoves.push(...getLegalMovesFrom(board, x, y));
      }
    }

    // Sort moves by heuristic (capture priority)
    allMoves.sort((a, b) => {
      const scoreA = (board[a.x2][a.y2].animal ? 100 + board[a.x2][a.y2].animal!.rank * 10 : 0) +
                     (board[a.x2][a.y2].denSide !== null && board[a.x2][a.y2].denSide !== color ? 1000 : 0);
      const scoreB = (board[b.x2][b.y2].animal ? 100 + board[b.x2][b.y2].animal!.rank * 10 : 0) +
                     (board[b.x2][b.y2].denSide !== null && board[b.x2][b.y2].denSide !== color ? 1000 : 0);
      return scoreB - scoreA;
    });

    let bestVal = isRedTurn ? -Infinity : Infinity;

    for (const move of allMoves) {
      const newBoard = simulateMove(board, move);
      const value = this.alphaBeta(newBoard, ply - 1, alpha, beta, !isRedTurn, startTime);

      if (value === null) continue; // Time limit reached

      if (isRedTurn) {
        bestVal = Math.max(bestVal, value);
        alpha = Math.max(alpha, value);
      } else {
        bestVal = Math.min(bestVal, value);
        beta = Math.min(beta, value);
      }

      if (beta <= alpha) break; // Pruning
    }

    return bestVal;
  }

  private exitCondition(board: Board, ply: number, isRedTurn: boolean): number | null {
    // Check den occupation
    const blueDen = board[3][0].animal;
    if (blueDen && blueDen.color === 'red') return -2000 * (ply + 1);
    
    const redDen = board[3][8].animal;
    if (redDen && redDen.color === 'blue') return 2000 * (ply + 1);

    // Count pieces
    let redCount = 0, blueCount = 0;
    for (let x = 0; x < CONFIG.BOARD.cols; x++) {
      for (let y = 0; y < CONFIG.BOARD.rows; y++) {
        const animal = board[x][y].animal;
        if (!animal) continue;
        if (animal.color === 'red') redCount++;
        else blueCount++;
      }
    }

    if (blueCount === 0) return 5000 * (ply + 1);
    if (redCount === 0) return -5000 * (ply + 1);

    // Trap defense check: if own piece in enemy trap and adjacent to enemy, it will be captured next turn
    const color = isRedTurn ? 'red' : 'blue';
    const enemyColor = isRedTurn ? 'blue' : 'red';
    
    // Simplified trap check
    for (let x = 0; x < CONFIG.BOARD.cols; x++) {
      for (let y = 0; y < CONFIG.BOARD.rows; y++) {
        const cell = board[x][y];
        if (!cell.animal || cell.animal.color !== color) continue;
        if (cell.trapSide === enemyColor) {
          // Check if any enemy adjacent
          const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
          for (const [dx, dy] of dirs) {
            if (isInBounds(x + dx, y + dy)) {
              const adj = board[x + dx][y + dy];
              if (adj.animal && adj.animal.color === enemyColor) {
                return -(1000 * (ply + 1));
              }
            }
          }
        }
      }
    }

    return null;
  }

  private evaluate(board: Board, isRedTurn: boolean): number {
    let redScore = 0, blueScore = 0;
    let redMouse: AnimalData | null = null, redElephant: AnimalData | null = null;
    let blueMouse: AnimalData | null = null, blueElephant: AnimalData | null = null;
    let redLion: AnimalData | null = null, blueLion: AnimalData | null = null;
    let redTiger: AnimalData | null = null, blueTiger: AnimalData | null = null;

    for (let x = 0; x < CONFIG.BOARD.cols; x++) {
      for (let y = 0; y < CONFIG.BOARD.rows; y++) {
        const animal = board[x][y].animal;
        if (!animal) continue;
        
        const score = (animal.rank === 1 ? 6 : 0) + animal.rank;
        
        if (animal.color === 'red') {
          redScore += score;
          if (animal.rank === 1) redMouse = animal;
          if (animal.rank === 8) redElephant = animal;
          if (animal.rank === 7) redLion = animal;
          if (animal.rank === 6) redTiger = animal;
        } else {
          blueScore += score;
          if (animal.rank === 1) blueMouse = animal;
          if (animal.rank === 8) blueElephant = animal;
          if (animal.rank === 7) blueLion = animal;
          if (animal.rank === 6) blueTiger = animal;
        }
      }
    }

    let returnValue = redScore - blueScore;

    // Mouse-elephant proximity bonus
    if (redMouse && blueElephant) {
      const dist = Math.abs(redMouse.col - blueElephant.col) + Math.abs(redMouse.row - blueElephant.row);
      if (dist <= 1 || (dist <= 2 && isRedTurn)) returnValue += (dist === 1 && isRedTurn ? 7.5 : 3.5);
    }
    if (blueMouse && redElephant) {
      const dist = Math.abs(blueMouse.col - redElephant.col) + Math.abs(blueMouse.row - redElephant.row);
      if (dist <= 1 || (dist <= 2 && !isRedTurn)) returnValue -= (dist === 1 && !isRedTurn ? 7.5 : 3.5);
    }

    // Elephant progression tendency
    if (redElephant) returnValue -= 0.01 * Math.abs(8 - redElephant.row);
    if (blueElephant) returnValue += 0.01 * Math.abs(0 - blueElephant.row);

    // Lion/Tiger mobility bonus (closer to river center = better)
    if (redLion) returnValue += this.lionTigerMobility(redLion);
    if (blueLion) returnValue -= this.lionTigerMobility(blueLion);
    if (redTiger) returnValue += this.lionTigerMobility(redTiger);
    if (blueTiger) returnValue -= this.lionTigerMobility(blueTiger);

    return returnValue;
  }

  private lionTigerMobility(animal: AnimalData): number {
    let minDistance = 1000;
    const riverPoints = [[1, 3], [2, 3], [4, 3], [5, 3], [1, 5], [2, 5], [4, 5], [5, 5]];
    for (const [px, py] of riverPoints) {
      const dist = Math.abs(animal.col - px) + Math.abs(animal.row - py);
      minDistance = Math.min(minDistance, dist);
    }
    return 0.05 - 0.01 * minDistance;
  }
}
