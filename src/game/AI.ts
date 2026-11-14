/**
 * 斗兽棋 3D - AI 客户端（单档冠军难度）
 *
 * 把棋盘序列化后交给 Web Worker 做迭代加深搜索，
 * 主线程只负责等待结果，渲染循环不受影响。
 * 每次请求使用独立 Worker，重开/切模式时旧结果自然失效，不产生竞态。
 */

import {
  type SerializedCell,
  type SearchResponse,
  type Move as AiMove,
} from './aiEngine';
import type { Board } from './rules';
import { CONFIG } from '../config';
import { getAllLegalMoves } from './rules';

/** 一档默认难度的思考时间预算 */
export const AI_THINK_TIME_MS = 3000;

export interface AIResult {
  move: AiMove;
  depth: number;
  nodes: number;
  elapsedMs: number;
}

export class AIEngine {
  private requestId = 0;

  /** 为指定一方搜索最佳走法（异步，不阻塞渲染） */
  getBestMove(board: Board, side: 'red' | 'blue'): Promise<AIResult> {
    const cells: SerializedCell[][] = [];
    for (let x = 0; x < CONFIG.BOARD.cols; x++) {
      cells[x] = [];
      for (let y = 0; y < CONFIG.BOARD.rows; y++) {
        const animal = board[x][y].animal;
        cells[x][y] = animal
          ? { rank: animal.rank, color: animal.color === 'red' ? 1 : 0 }
          : { rank: 0, color: 0 };
      }
    }

    this.requestId += 1;
    const requestId = this.requestId;
    const worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });

    return new Promise<AIResult>((resolve, reject) => {
      const cleanup = (): void => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        worker.terminate();
      };
      const onMessage = (event: MessageEvent<SearchResponse>): void => {
        if (event.data.requestId !== requestId) return;
        cleanup();
        const data = event.data;
        resolve({
          move: data.move ?? fallbackMove(board, side),
          depth: data.depth,
          nodes: data.nodes,
          elapsedMs: data.elapsedMs,
        });
      };
      const onError = (event: ErrorEvent): void => {
        cleanup();
        reject(new Error(`AI Worker 异常: ${event.message}`));
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.postMessage({
        cells,
        side,
        maxTimeMs: AI_THINK_TIME_MS,
        requestId,
      });
    });
  }
}

/** Worker 无结果时的兜底：取启发式排序第一的合法走法 */
function fallbackMove(board: Board, side: 'red' | 'blue'): AiMove {
  const moves = getAllLegalMoves(board, side);
  if (moves.length === 0) {
    return { x1: 0, y1: 0, x2: 0, y2: 0 };
  }
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const target = board[m.x2][m.y2];
    let score = 0;
    if (target.animal) score += 1000 + target.animal.rank * 10;
    if (target.denSide && target.denSide !== side) score += 100000;
    score += (side === 'red' ? m.y2 - m.y1 : m.y1 - m.y2) * 5;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}
