/// <reference types="vite/client" />

/** 运行时诊断快照，供自动化验证与调试读取 */
interface AnimalChessDiagnostics {
  frame: number;
  mode: 'pve' | 'pvp';
  turn: 'red' | 'blue';
  gameOver: boolean;
  pieceCount: number;
  redCount: number;
  blueCount: number;
  aiThinking: boolean;
  selected: { name: string; color: 'red' | 'blue'; row: number; col: number } | null;
  pieces: Array<{ name: string; color: 'red' | 'blue'; row: number; col: number }>;
  renderer: {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
  };
  canvas: {
    clientWidth: number;
    clientHeight: number;
    width: number;
    height: number;
  };
}

interface Window {
  __ANIMAL_CHESS_DIAGNOSTICS__?: AnimalChessDiagnostics;
  animalChessGame?: unknown;
}