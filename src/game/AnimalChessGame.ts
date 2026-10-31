/**
 * 斗兽棋 3D - 主游戏逻辑
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GameState, type PieceVisual } from './GameState';
import { AIEngine } from './AI';
import { BoardRenderer } from '../renderers/BoardRenderer';
import { PieceRenderer } from '../renderers/PieceRenderer';
import { GameUI } from '../ui/GameUI';
import { VfxSystem } from '../systems/VfxSystem';
import { CONFIG } from '../config';
import { createStarSprite } from '../assets/ProceduralTextures';

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
  private vfx: VfxSystem;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private mode: GameMode;
  private isAiThinking: boolean;
  private selectedPiece: PieceVisual | null = null;
  private selectionBeam: THREE.Mesh | null = null;
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

    this.vfx = new VfxSystem(this.scene);

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
    this.renderer.toneMappingExposure = 1.2;

    this.clock = new THREE.Clock();

    this.setupLights();
    this.setupPostProcessing();
    this.boardRenderer.createBoard();
    this.pieceRenderer.updatePieces(this.gameState.pieces);

    this.scene.add(this.boardRenderer.getGroup());
    this.scene.add(this.pieceRenderer.getGroup());

    // 背景星点层：远景粒子，增加画面深度与色彩层次
    this.createStarfield();

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
    // 环境半球光：蓝白天光 + 暗蓝地面反射
    const hemiLight = new THREE.HemisphereLight('#cfe2ff', '#1a2033', 0.55);
    this.scene.add(hemiLight);

    // Key Light：暖白主光，前左上方，负责塑造形体与投影
    const keyLight = new THREE.DirectionalLight('#fff0dc', 1.5);
    keyLight.position.set(9, 16, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 60;
    keyLight.shadow.camera.left = -12;
    keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 12;
    keyLight.shadow.camera.bottom = -12;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    // Fill Light：冷蓝辅光，右侧低位，防止暗面死黑
    const fillLight = new THREE.DirectionalLight('#6a8fd8', 0.45);
    fillLight.position.set(10, 5, -6);
    this.scene.add(fillLight);

    // Rim Light：青色轮廓光，正后方，分离棋子与背景
    const rimLight = new THREE.DirectionalLight('#7fdcff', 0.7);
    rimLight.position.set(-4, 8, -14);
    this.scene.add(rimLight);

    // 兽穴点光：红/蓝两方巢穴上方的主题色辉光
    for (const den of CONFIG.DENS) {
      const denLight = new THREE.PointLight(
        den.side === 'red' ? '#ff6b5e' : '#35c8f5',
        1.6,
        5.5,
      );
      const pos = this.boardRenderer.cellToWorld(den.row, den.col);
      denLight.position.set(pos.x, 2.2, pos.z);
      this.scene.add(denLight);
    }

    // 陷阱弱光：六个陷阱位上的冷光提示
    for (const trap of CONFIG.TRAPS) {
      const trapLight = new THREE.PointLight('#8a95c4', 0.35, 2.5);
      const pos = this.boardRenderer.cellToWorld(trap.row, trap.col);
      trapLight.position.set(pos.x, 0.9, pos.z);
      this.scene.add(trapLight);
    }
  }

  /** 背景星点层：远景粒子穹顶，增加画面深度 */
  private starfield: THREE.Points | null = null;

  private createStarfield(): void {
    const count = 150;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.8 + 0.1);
      const radius = 35 + Math.random() * 15;

      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      positions[i * 3 + 1] = Math.cos(phi) * radius + 5;
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;

      // 压暗星点颜色，避免压缩对比度
      const hue = Math.random();
      let r: number, g: number, b: number;
      if (hue < 0.6) {
        r = 0.4 + Math.random() * 0.15; g = 0.45 + Math.random() * 0.15; b = 0.6;
      } else if (hue < 0.85) {
        r = 0.3 + Math.random() * 0.1; g = 0.4 + Math.random() * 0.1; b = 0.55;
      } else {
        r = 0.4; g = 0.3 + Math.random() * 0.1; b = 0.55;
      }
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
      sizes[i] = 0.1 + Math.random() * 0.2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.25,
      map: createStarSprite(),
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.starfield = new THREE.Points(geometry, material);
    this.scene.add(this.starfield);
  }

  /** 设置 Bloom 后处理：让霓虹元素更亮眼 */
  private setupPostProcessing(): void {
    const renderScene = new RenderPass(this.scene, this.camera);
    
    // UnrealBloomPass: 阈值/强度/半径
    // threshold=0.25: 只让亮部发光（霓虹 UI、兽穴光、水晶）
    // strength=0.4: 中等辉光强度，保持画面清晰度
    // radius=0.5: 辉光扩散范围，营造柔和氛围
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.renderer.domElement.width, this.renderer.domElement.height),
      0.4,   // strength
      0.5,   // radius
      0.25   // threshold
    );
    
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderScene);
    this.composer.addPass(this.bloomPass);
    
    // 窗口 resize 时更新 composer 尺寸
    const originalOnResize = this.onResize.bind(this);
    this.onResize = () => {
      originalOnResize();
      const canvas = this.renderer.domElement;
      this.composer.setSize(canvas.clientWidth, canvas.clientHeight);
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    };
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
    this.pieceRenderer.updateSelection(piece);
    
    // 创建选中光束
    const pos = this.boardRenderer.cellToWorld(piece.row, piece.col);
    const color = piece.color === 'red' ? 0xff6b5e : 0x35c8f5;
    if (this.selectionBeam) {
      this.vfx.getGroup().remove(this.selectionBeam);
    }
    this.selectionBeam = this.vfx.selectionBeam(
      new THREE.Vector3(pos.x, 0, pos.z),
      color,
      piece.rank
    );
    
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
    this.pieceRenderer.updateSelection(null);
    
    // 移除选中光束
    if (this.selectionBeam) {
      this.vfx.getGroup().remove(this.selectionBeam);
      this.selectionBeam.geometry.dispose();
      (this.selectionBeam.material as THREE.Material).dispose();
      this.selectionBeam = null;
    }
    
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

    // 走子拖尾粒子（带等级差异化）
    const fromPos = this.boardRenderer.cellToWorld(fromRow, fromCol);
    const toPos = this.boardRenderer.cellToWorld(row, col);
    this.vfx.trail(
      new THREE.Vector3(fromPos.x, 0.3, fromPos.z),
      new THREE.Vector3(toPos.x, 0.3, toPos.z),
      piece.color === 'red' ? 0xff6b5e : 0x35c8f5,
      24,
      piece.rank,
    );

    if (result.captured) {
      const side = piece.color === 'red' ? CONFIG.UI_TEXT.redBrief : CONFIG.UI_TEXT.blueBrief;
      this.ui.log(CONFIG.UI_TEXT.eatAction(side, piece.name, result.captured.name), piece.color);
      // 吃子粒子爆发（带等级差异化）
      const targetPos = this.boardRenderer.cellToWorld(row, col);
      this.vfx.burst(
        new THREE.Vector3(targetPos.x, 0.4, targetPos.z),
        piece.color === 'red' ? 0xff6b5e : 0x35c8f5,
        32,
        piece.rank,
      );
    }

    // Update roster
    this.ui.updateRoster(this.gameState.countPieces('red'), this.gameState.countPieces('blue'));

    if (result.winner) {
      this.ui.log(CONFIG.UI_TEXT.gameEnd(result.winner === 'red' ? CONFIG.UI_TEXT.redSide : CONFIG.UI_TEXT.blueSide), 'system');
      this.ui.showWinner(result.winner, this.gameState.countPieces('red'), this.gameState.countPieces('blue'), this.elapsedText());
      this.stopTimer();
      // 胜利闪光
      this.vfx.victoryFlash();
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
    this.vfx.clear();
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
    this.pieceRenderer.animateSelection(time);
    this.boardRenderer.animateWater(time);

    // 使用 composer 进行渲染，包含 Bloom 后处理
    this.composer.render();

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

// 测试钩子：供 canvas inspector 使用
declare global {
  interface Window {
    __THREE_GAME_TEST_HOOKS__?: {
      setState: (name: string | null) => Promise<void>;
      setPausedForScreenshot: (paused: boolean) => void;
      seed: (seed: number) => void;
    };
  }
}

if (typeof window !== 'undefined') {
  (window as any).__THREE_GAME_TEST_HOOKS__ = {
    async setState(name: string | null) {
      // 当前游戏状态已可通过 diagnostics 获取
      console.log('[Test Hook] setState:', name);
    },
    setPausedForScreenshot(paused: boolean) {
      // 暂停游戏逻辑（可选）
      console.log('[Test Hook] setPaused:', paused);
    },
    seed(seed: number) {
      // 设置随机种子（可选）
      console.log('[Test Hook] seed:', seed);
    },
  };
}