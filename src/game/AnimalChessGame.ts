/**
 * 斗兽棋 3D - 主游戏逻辑
 */

import * as THREE from 'three';
import { GameState, type PieceVisual } from './GameState';
import { AIEngine } from './AI';
import { BoardRenderer } from '../renderers/BoardRenderer';
import { PieceRenderer } from '../renderers/PieceRenderer';
import { GameUI } from '../ui/GameUI';
import { CONFIG } from '../config';

export type GameMode = 'pve' | 'pvp';

/** 玩家执红（下方），AI 执蓝（上方） */
const PLAYER_SIDE: 'red' | 'blue' = 'red';
const AI_SIDE: 'red' | 'blue' = 'blue';

export class AnimalChessGame {
  private gameState: GameState;
  private aiEngine: AIEngine;
  private boardRenderer: BoardRenderer;
  private pieceRenderer: PieceRenderer;
  private ui: GameUI;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private mode: GameMode;
  private isAiThinking: boolean;
  private selectedPiece: PieceVisual | null = null;
  private animationId = 0;
  private frame = 0;
  private clock: THREE.Clock;
  private pickPlane: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private timerInterval: number | null = null;
  private kbdDir: [number, number] | null = null;

  constructor(canvas: HTMLCanvasElement, mode: GameMode = 'pve') {
    this.mode = mode;
    this.gameState = new GameState();
    this.aiEngine = new AIEngine(600, 6);
    this.boardRenderer = new BoardRenderer();
    this.pieceRenderer = new PieceRenderer();
    this.ui = new GameUI();
    this.isAiThinking = false;

    // Three.js 基础设置
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0f141f');
    this.scene.fog = new THREE.Fog('#0f141f', 18, 46);

    this.camera = new THREE.PerspectiveCamera(
      45,
      Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight),
      0.1,
      120,
    );
    this.camera.position.set(0, 13.5, 13);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.clock = new THREE.Clock();

    this.setupLights();
    this.boardRenderer.createBoard();
    this.pieceRenderer.updatePieces(this.gameState.pieces);

    this.scene.add(this.boardRenderer.getGroup());
    this.scene.add(this.pieceRenderer.getGroup());

    // 不可见拾取平面：点击定位棋盘格
    this.pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(
        CONFIG.BOARD.cols * CONFIG.BOARD.cellSize + 4,
        CONFIG.BOARD.rows * CONFIG.BOARD.cellSize + 4,
      ),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.pickPlane.rotation.x = -Math.PI / 2;
    this.scene.add(this.pickPlane);

    document.body.appendChild(this.ui.getContainer());

    this.setupInputHandlers(canvas);
    this.setupUIHandlers();
    this.setupKeyboardHandlers();

    window.addEventListener('resize', () => this.onResize());

    this.ui.setActiveMode(this.mode);
    this.ui.updateTurn(this.gameState.turn);
    this.ui.updateRoster(this.gameState.countPieces('red'), this.gameState.countPieces('blue'));
    this.ui.log(CONFIG.UI_TEXT.enterMode(this.ui.getPersonality(), CONFIG.VERSION), 'system');
    this.startTimer();
    this.animationId = requestAnimationFrame(() => this.animate());
  }

  private setupLights(): void {
    const hemiLight = new THREE.HemisphereLight('#cfe2ff', '#1a2033', 0.75);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight('#fff5e6', 1.35);
    dirLight.position.set(9, 16, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 60;
    dirLight.shadow.camera.left = -12;
    dirLight.shadow.camera.right = 12;
    dirLight.shadow.camera.top = 12;
    dirLight.shadow.camera.bottom = -12;
    this.scene.add(dirLight);
  }

  private setupInputHandlers(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (event) => {
      if (this.gameState.gameOver || this.isAiThinking) return;

      const cell = this.pickCell(event, canvas);
      if (!cell) return;

      this.handleCellClick(cell.row, cell.col);
    });
  }

  /** 把一次点击换算为棋盘格 */
  private pickCell(event: PointerEvent, canvas: HTMLCanvasElement): { row: number; col: number } | null {
    const rect = canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.pickPlane, false);
    if (hits.length === 0) return null;

    const point = hits[0].point;
    return this.boardRenderer.worldToCell(point.x, point.z);
  }

  /** 该棋子当前是否可被玩家操作 */
  private canPlayerControl(piece: PieceVisual): boolean {
    if (this.gameState.turn !== piece.color) return false;
    // PvE 模式下玩家只执红，蓝方交给 AI
    if (this.mode === 'pve') return piece.color === PLAYER_SIDE;
    return true;
  }

  /** 选中己方棋子 / 对已选中的棋子执行走子 */
  private handleCellClick(row: number, col: number): void {
    const key = `${col}_${row}`;
    const target = this.gameState.pieces.get(key) ?? null;

    // 尚未选中：只能选中当前可操作的己方棋子
    if (!this.selectedPiece) {
      if (target && this.canPlayerControl(target)) {
        this.selectPiece(target);
      }
      return;
    }

    // 点击自己另一枚棋子：切换选中
    if (target && target !== this.selectedPiece && this.canPlayerControl(target)) {
      this.selectPiece(target);
      return;
    }

    // 点击已选中棋子本身：取消选中
    if (target === this.selectedPiece) {
      this.clearSelection();
      return;
    }

    // 尝试走子
    if (!this.gameState.canMove(this.selectedPiece, row, col)) {
      this.ui.showStatus('该位置不可落子');
      this.ui.shakeCanvas();
      return;
    }

    this.performMove(this.selectedPiece, row, col);

    // PvE：玩家走完轮到 AI
    if (this.mode === 'pve' && !this.gameState.gameOver && this.gameState.turn === AI_SIDE) {
      void this.makeAiMove();
    }
  }

  private selectPiece(piece: PieceVisual): void {
    this.selectedPiece = piece;
    this.gameState.selected = piece;
    this.boardRenderer.updateSelection(piece);
    this.ui.updateSelected({
      name: piece.name,
      rank: piece.rank,
      color: piece.color === 'red' ? '红方' : '蓝方',
    });
  }

  private clearSelection(): void {
    this.selectedPiece = null;
    this.gameState.selected = null;
    this.boardRenderer.hideSelection();
    this.ui.clearSelection();
  }

  /** 应用一步走子并同步渲染与 UI */
  private performMove(piece: PieceVisual, row: number, col: number): void {
    const fromRow = piece.row;
    const fromCol = piece.col;
    const result = this.gameState.applyMove(piece, row, col);
    this.pieceRenderer.updatePieces(this.gameState.pieces);
    this.clearSelection();

    // Show last-move marker
    this.boardRenderer.showLastMove({ row: fromRow, col: fromCol }, { row, col });

    if (result.captured) {
      const side = piece.color === 'red' ? CONFIG.UI_TEXT.redBrief : CONFIG.UI_TEXT.blueBrief;
      this.ui.log(CONFIG.UI_TEXT.eatAction(side, piece.name, result.captured.name), piece.color);
    }

    // Update roster
    this.ui.updateRoster(this.gameState.countPieces('red'), this.gameState.countPieces('blue'));

    if (result.winner) {
      this.ui.log(CONFIG.UI_TEXT.gameEnd(result.winner === 'red' ? CONFIG.UI_TEXT.redSide : CONFIG.UI_TEXT.blueSide), 'system');
      this.ui.showWinner(result.winner, this.gameState.countPieces('red'), this.gameState.countPieces('blue'), this.elapsedText());
      this.stopTimer();
      return;
    }
    if (result.draw) {
      this.ui.log(CONFIG.UI_TEXT.drawLog(result.draw === 'red' ? CONFIG.UI_TEXT.redSide : CONFIG.UI_TEXT.blueSide), 'system');
      this.ui.showDraw(result.draw, this.gameState.countPieces('red'), this.gameState.countPieces('blue'), this.elapsedText());
      this.stopTimer();
      return;
    }

    this.ui.updateTurn(this.gameState.turn);
  }

  /** PvE 模式下由 AI 走蓝方 */
  private async makeAiMove(): Promise<void> {
    if (this.gameState.gameOver || this.gameState.turn !== AI_SIDE) return;

    this.isAiThinking = true;
    this.ui.updateTurn(this.gameState.turn, true);

    // 让出一帧，保证「AI 计算中」状态先绘制
    await new Promise((resolve) => setTimeout(resolve, 220));

    const move = this.aiEngine.getBestMove(this.gameState.board, AI_SIDE);
    this.isAiThinking = false;

    if (!move) {
      this.ui.showStatus('AI 无子可动');
      return;
    }

    const piece = this.gameState.pieces.get(`${move.x1}_${move.y1}`);
    if (!piece) return;

    this.performMove(piece, move.y2, move.x2);
  }

  private setupUIHandlers(): void {
    this.ui.getContainer().addEventListener('mode-select', ((event: CustomEvent) => {
      this.mode = event.detail as GameMode;
      this.restart();
    }) as EventListener);

    this.ui.getContainer().addEventListener('restart', () => {
      this.restart();
      this.ui.showStatus('游戏重新开始');
    });

    this.ui.getContainer().addEventListener('personality-change', ((event: CustomEvent) => {
      const personality = event.detail as string;
      const maxTime = personality === 'aggressive' ? 1500 : 500;
      this.aiEngine.setMaxTime(maxTime);
      const pName = personality === 'aggressive' ? CONFIG.UI_TEXT.aggressive : CONFIG.UI_TEXT.conservative;
      this.ui.log(CONFIG.UI_TEXT.aiSwitch(pName), 'system');
    }) as EventListener);
  }

  private setupKeyboardHandlers(): void {
    window.addEventListener('keydown', (e) => this.handleKeyboard(e));
  }

  private handleKeyboard(e: KeyboardEvent): void {
    if (this.gameState.gameOver || this.isAiThinking) return;
    const sel = this.selectedPiece;
    switch (e.key) {
      case 'Escape':
        if (sel) {
          this.clearSelection();
        }
        break;
      case 'Enter':
        if (sel && this.kbdDir) {
          const [dr, dc] = this.kbdDir;
          const tr = sel.row + dr;
          const tc = sel.col + dc;
          if (this.gameState.canMove(sel, tr, tc)) {
            this.performMove(sel, tr, tc);
            if (this.mode === 'pve' && !this.gameState.gameOver && this.gameState.turn === AI_SIDE) {
              void this.makeAiMove();
            }
          } else {
            this.ui.shakeCanvas();
          }
        }
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
        this.kbdDir = [-1, 0];
        this.previewMove(sel);
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        this.kbdDir = [1, 0];
        this.previewMove(sel);
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.kbdDir = [0, -1];
        this.previewMove(sel);
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.kbdDir = [0, 1];
        this.previewMove(sel);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  private previewMove(sel: PieceVisual | null): void {
    if (!sel || !this.kbdDir) return;
    const [dr, dc] = this.kbdDir;
    const tr = sel.row + dr;
    const tc = sel.col + dc;
    if (this.gameState.canMove(sel, tr, tc)) {
      this.boardRenderer.updateHighlight(tr, tc);
      setTimeout(() => {
        this.boardRenderer.hideHighlight();
      }, 400);
    }
  }

  private startTimer(): void {
    if (this.timerInterval !== null) return;
    this.timerInterval = window.setInterval(() => {
      if (this.gameState.gameOver) {
        this.stopTimer();
        return;
      }
      this.ui.updateTimer(this.elapsedText());
    }, 500);
  }

  private stopTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private elapsedText(): string {
    const endTime = this.gameState.gameOver ? this.gameState.endTime : Date.now();
    const totalTime = Math.floor((endTime - this.gameState.startTime) / 1000);
    const mins = Math.floor(totalTime / 60).toString().padStart(2, '0');
    const secs = (totalTime % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  private restart(): void {
    this.gameState.reset();
    this.isAiThinking = false;
    this.kbdDir = null;
    this.pieceRenderer.updatePieces(this.gameState.pieces);
    this.clearSelection();
    this.boardRenderer.hideLastMove();
    this.ui.setActiveMode(this.mode);
    this.ui.updateTurn(this.gameState.turn);
    this.ui.updateRoster(this.gameState.countPieces('red'), this.gameState.countPieces('blue'));
    this.ui.clearLog();
    this.ui.hideVictoryOverlay();
    this.ui.log(CONFIG.UI_TEXT.enterMode(this.ui.getPersonality(), CONFIG.VERSION), 'system');
    this.stopTimer();
    this.startTimer();
  }

  private animate(): void {
    this.animationId = requestAnimationFrame(() => this.animate());

    const time = this.clock.getElapsedTime();

    this.gameState.animatePieces();
    this.pieceRenderer.updatePieces(this.gameState.pieces);
    this.boardRenderer.animateWater(time);

    this.renderer.render(this.scene, this.camera);

    this.frame += 1;
    if (this.frame % 15 === 0) this.publishDiagnostics();
  }

  /** 把运行时状态暴露给自动化验证与调试 */
  private publishDiagnostics(): void {
    const info = this.renderer.info;
    const canvas = this.renderer.domElement;
    window.__ANIMAL_CHESS_DIAGNOSTICS__ = {
      frame: this.frame,
      mode: this.mode,
      turn: this.gameState.turn,
      gameOver: this.gameState.gameOver,
      pieceCount: this.gameState.pieces.size,
      redCount: this.gameState.countPieces('red'),
      blueCount: this.gameState.countPieces('blue'),
      aiThinking: this.isAiThinking,
      selected: this.selectedPiece
        ? { name: this.selectedPiece.name, color: this.selectedPiece.color, row: this.selectedPiece.row, col: this.selectedPiece.col }
        : null,
      pieces: Array.from(this.gameState.pieces.values()).map((piece) => ({
        name: piece.name,
        color: piece.color,
        row: piece.row,
        col: piece.col,
      })),
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        width: canvas.width,
        height: canvas.height,
      },
    };
  }

  private onResize(): void {
    const canvas = this.renderer.domElement;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
  }

  /** 把棋盘格中心投影为画布内的 CSS 像素坐标（自动化点击用） */
  projectCell(row: number, col: number): { x: number; y: number } | null {
    const world = this.boardRenderer.cellToWorld(row, col);
    const point = new THREE.Vector3(world.x, 0.1, world.z).project(this.camera);
    const canvas = this.renderer.domElement;
    return {
      x: ((point.x + 1) / 2) * canvas.clientWidth,
      y: ((1 - point.y) / 2) * canvas.clientHeight,
    };
  }

  /** 释放全部资源 */
  dispose(): void {
    cancelAnimationFrame(this.animationId);
    this.stopTimer();
    this.ui.getContainer().remove();

    for (const group of [this.boardRenderer.getGroup(), this.pieceRenderer.getGroup()]) {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const material = child.material;
          if (Array.isArray(material)) {
            material.forEach((entry) => entry.dispose());
          } else if (material instanceof THREE.Material) {
            material.dispose();
          }
        }
      });
    }

    this.pickPlane.geometry.dispose();
    this.renderer.dispose();
  }
}