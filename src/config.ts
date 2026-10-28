/**
 * 斗兽棋 3D - 全局配置
 */

export interface BoardConfig {
  rows: number;
  cols: number;
  cellSize: number;
}

export interface TrapConfig {
  row: number;
  col: number;
  side: 'blue' | 'red';
}

export interface DenConfig {
  row: number;
  col: number;
  side: 'blue' | 'red';
}

export interface PieceConfig {
  rank: number;
  name: string;
}

export interface StartPosition {
  row: number;
  col: number;
  rank: number;
}

export const CONFIG = {
  VERSION: '3.0.0',
  
  BOARD: {
    rows: 9,
    cols: 7,
    cellSize: 1.2,
  } as BoardConfig,

  RIVERS: [
    [3, 1], [3, 2], [4, 1], [4, 2], [5, 1], [5, 2],
    [3, 4], [3, 5], [4, 4], [4, 5], [5, 4], [5, 5]
  ] as [number, number][],

  TRAPS: [
    { row: 0, col: 2, side: 'blue' as const },
    { row: 0, col: 4, side: 'blue' as const },
    { row: 1, col: 3, side: 'blue' as const },
    { row: 8, col: 2, side: 'red' as const },
    { row: 8, col: 4, side: 'red' as const },
    { row: 7, col: 3, side: 'red' as const },
  ] as TrapConfig[],

  DENS: [
    { row: 0, col: 3, side: 'blue' as const },
    { row: 8, col: 3, side: 'red' as const },
  ] as DenConfig[],

  PIECES: [
    { rank: 1, name: '鼠' },
    { rank: 2, name: '猫' },
    { rank: 3, name: '狗' },
    { rank: 4, name: '狼' },
    { rank: 5, name: '豹' },
    { rank: 6, name: '虎' },
    { rank: 7, name: '狮' },
    { rank: 8, name: '象' },
  ] as PieceConfig[],

  START_POSITIONS: {
    blue: [
      { row: 0, col: 0, rank: 8 },
      { row: 0, col: 6, rank: 7 },
      { row: 0, col: 4, rank: 6 },
      { row: 2, col: 4, rank: 5 },
      { row: 2, col: 2, rank: 4 },
      { row: 2, col: 6, rank: 3 },
      { row: 1, col: 5, rank: 2 },
      { row: 2, col: 0, rank: 1 },
    ],
    red: [
      { row: 8, col: 6, rank: 8 },
      { row: 8, col: 0, rank: 7 },
      { row: 8, col: 2, rank: 6 },
      { row: 6, col: 2, rank: 5 },
      { row: 6, col: 4, rank: 4 },
      { row: 6, col: 0, rank: 3 },
      { row: 7, col: 1, rank: 2 },
      { row: 6, col: 6, rank: 1 },
    ],
  },

  UI_TEXT: {
    system: '系统',
    aiThinking: 'AI 计算中...',
    redTurn: '红方回合',
    blueTurn: '蓝方回合',
    victoryTitle: 'VICTORY',
    drawTitle: 'DRAW',
    drawTurn: '和棋',
    restartBtn: '🔄 重新开始',
    restartWinBtn: '再次征战',
    pveBtn: '单人挑战',
    pvpBtn: '双人对决',
    aggressive: '积极型',
    conservative: '保守型',
    aggressiveDesc: '积极型',
    conservativeDesc: '保守型',
    redSide: '红方',
    blueSide: '蓝方',
    redBrief: '红',
    blueBrief: '蓝',
    aiEngineLabel: (ver: string) => `AI 引擎: Champion ${ver}`,
    enterMode: (p: string, ver: string) => `系统: 进入 ${p} 演练模式 v${ver}...`,
    eatAction: (side: string, pName: string, tName: string) => `${side}${pName} 捕食 ${tName}`,
    aiSwitch: (p: string) => `系统: AI 已切换为 ${p} 性格`,
    victory: (side: string) => `${side} 统领了战场！`,
    timeTaken: (m: string, s: string) => `用时: ${m}:${s}`,
    gameEnd: (side: string) => `🏆 终结: ${side}获得了胜利！`,
    drawReason: (side: string) => `${side}无子可动，双方握手言和。`,
    drawLog: (side: string) => `🤝 和棋: ${side}无子可动`,
    pageTitle: (ver: string) => `斗兽棋 3D v${ver} - Tactical Neon`,
  },
};

// Helper functions to check board features
export function isRiver(row: number, col: number): boolean {
  return CONFIG.RIVERS.some(([r, c]) => r === row && c === col);
}

export function getTrapSide(row: number, col: number): 'blue' | 'red' | null {
  const trap = CONFIG.TRAPS.find((t) => t.row === row && t.col === col);
  return trap?.side ?? null;
}

export function getDenSide(row: number, col: number): 'blue' | 'red' | null {
  const den = CONFIG.DENS.find((d) => d.row === row && d.col === col);
  return den?.side ?? null;
}
