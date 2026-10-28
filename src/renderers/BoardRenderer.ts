/**
 * 斗兽棋 3D - 棋盘场景渲染器
 */

import * as THREE from 'three';
import { CONFIG, isRiver, getTrapSide, getDenSide } from '../config';
import {
  createGrassTexture,
  createRiverbedTexture,
  createHazardTexture,
  createDenTexture,
} from '../assets/ProceduralTextures';

export class BoardRenderer {
  private group: THREE.Group;
  private meshes: Map<string, THREE.Mesh>;
  private highlightMesh: THREE.Mesh;
  private selectedMesh: THREE.Mesh;
  private lastMoveFromMesh: THREE.Mesh;
  private lastMoveToMesh: THREE.Mesh;
  private cellSize: number;
  private boardOffsetX: number;
  private boardOffsetZ: number;

  constructor() {
    this.group = new THREE.Group();
    this.meshes = new Map();
    this.cellSize = CONFIG.BOARD.cellSize;
    
    // Center the board
    this.boardOffsetX = -(CONFIG.BOARD.cols - 1) * this.cellSize / 2;
    this.boardOffsetZ = -(CONFIG.BOARD.rows - 1) * this.cellSize / 2;

    this.highlightMesh = new THREE.Mesh(
      new THREE.BoxGeometry(this.cellSize * 1.05, 0.05, this.cellSize * 1.05),
      new THREE.MeshBasicMaterial({ color: 0x5dff6a, transparent: true, opacity: 0.4 }),
    );
    this.highlightMesh.visible = false;
    this.highlightMesh.position.y = 0.05;

    this.selectedMesh = new THREE.Mesh(
      new THREE.TorusGeometry(this.cellSize * 0.5, 0.03, 16, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }),
    );
    this.selectedMesh.visible = false;
    this.selectedMesh.rotation.x = Math.PI / 2;

    // Last-move markers (from/to positions)
    this.lastMoveFromMesh = new THREE.Mesh(
      new THREE.BoxGeometry(this.cellSize * 0.9, 0.02, this.cellSize * 0.9),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.25 }),
    );
    this.lastMoveFromMesh.visible = false;
    this.lastMoveFromMesh.position.y = 0.02;

    this.lastMoveToMesh = new THREE.Mesh(
      new THREE.BoxGeometry(this.cellSize * 0.9, 0.02, this.cellSize * 0.9),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.35 }),
    );
    this.lastMoveToMesh.visible = false;
    this.lastMoveToMesh.position.y = 0.02;
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  getCellSize(): number {
    return this.cellSize;
  }

  /** 世界坐标换算为棋盘行列（越界返回 null） */
  worldToCell(worldX: number, worldZ: number): { row: number; col: number } | null {
    const col = Math.round((worldX - this.boardOffsetX) / this.cellSize);
    const row = Math.round((worldZ - this.boardOffsetZ) / this.cellSize);
    if (col < 0 || col >= CONFIG.BOARD.cols || row < 0 || row >= CONFIG.BOARD.rows) {
      return null;
    }
    return { row, col };
  }

  /** 棋盘行列换算为世界坐标（格子中心） */
  cellToWorld(row: number, col: number): { x: number; z: number } {
    return {
      x: col * this.cellSize + this.boardOffsetX,
      z: row * this.cellSize + this.boardOffsetZ,
    };
  }

  /** Create the entire board scene */
  createBoard(): void {
    // Create floor terrain
    this.createTerrain();
    
    // Create ground base and decorative border
    this.createEnvironmentBase();
    
    // Create grid lines
    this.createGrid();
    
    // Add to scene
    this.group.add(...this.meshes.values());
    this.group.add(this.highlightMesh);
    this.group.add(this.selectedMesh);
    this.group.add(this.lastMoveFromMesh);
    this.group.add(this.lastMoveToMesh);
  }

  private createTerrain(): void {
    const geometry = new THREE.BoxGeometry(this.cellSize * 0.95, 0.1, this.cellSize * 0.95);

    // 预生成可复用纹理
    const grassTex0 = createGrassTexture(0);
    const grassTex1 = createGrassTexture(1);
    const riverbedTex = createRiverbedTexture();
    const hazardTex = createHazardTexture();
    const denRedTex = createDenTexture('red');
    const denBlueTex = createDenTexture('blue');

    for (let x = 0; x < CONFIG.BOARD.cols; x++) {
      for (let y = 0; y < CONFIG.BOARD.rows; y++) {
        const river = isRiver(y, x);
        const trapSide = getTrapSide(y, x);
        const denSide = getDenSide(y, x);

        let material: THREE.MeshStandardMaterial;

        if (river) {
          material = new THREE.MeshStandardMaterial({
            map: riverbedTex,
            color: '#1c749e',
            roughness: 0.3,
            metalness: 0.1,
          });
        } else if (denSide) {
          const tex = denSide === 'red' ? denRedTex : denBlueTex;
          material = new THREE.MeshStandardMaterial({
            map: tex,
            color: denSide === 'red' ? '#ff6b5e' : '#3568f5',
            emissive: denSide === 'red' ? '#ff6b5e' : '#3568f5',
            emissiveIntensity: 0.3,
            roughness: 0.4,
            metalness: 0.6,
          });
        } else if (trapSide) {
          material = new THREE.MeshStandardMaterial({
            map: hazardTex,
            color: trapSide === 'blue' ? 'rgba(255,107,94,0.3)' : 'rgba(53,200,245,0.3)',
            roughness: 0.7,
            metalness: 0.2,
            transparent: true,
            opacity: 0.85,
          });
        } else {
          // 棋盘格交替草地纹理
          const tex = (x + y) % 2 === 0 ? grassTex0 : grassTex1;
          material = new THREE.MeshStandardMaterial({
            map: tex,
            color: '#2a3050',
            roughness: 0.85,
            metalness: 0.05,
          });
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
          x * this.cellSize + this.boardOffsetX,
          0,
          y * this.cellSize + this.boardOffsetZ,
        );
        mesh.receiveShadow = true;

        const key = `${x}_${y}`;
        this.meshes.set(key, mesh);
        this.group.add(mesh);
      }
    }

    // Add river flow effect
    this.createRiverEffect();

    // Add den markers
    this.createDenMarkers();

    // Add trap indicators
    this.createTrapIndicators();
  }

  /** 环境基底：大底盘 + 四角装饰 + 边框立柱 */
  private createEnvironmentBase(): void {
    const cs = this.cellSize;
    const boardWidth = CONFIG.BOARD.cols * cs;
    const boardHeight = CONFIG.BOARD.rows * cs;
    const margin = cs * 0.6;

    // 大底盘：比棋盘略大的深色平台
    const baseGeometry = new THREE.BoxGeometry(
      boardWidth + margin * 2,
      0.2,
      boardHeight + margin * 2,
    );
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: '#0b0f20',
      roughness: 0.9,
      metalness: 0.05,
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = -0.11;
    base.receiveShadow = true;
    this.group.add(base);

    // 边框立柱：棋盘四角
    const postGeometry = new THREE.CylinderGeometry(cs * 0.15, cs * 0.18, cs * 0.7, 8);
    const postMaterial = new THREE.MeshStandardMaterial({
      color: '#141a30',
      roughness: 0.7,
      metalness: 0.3,
    });
    const corners = [
      { x: -boardWidth / 2, z: -boardHeight / 2 },
      { x: boardWidth / 2, z: -boardHeight / 2 },
      { x: -boardWidth / 2, z: boardHeight / 2 },
      { x: boardWidth / 2, z: boardHeight / 2 },
    ];
    for (const c of corners) {
      const post = new THREE.Mesh(postGeometry, postMaterial);
      post.position.set(c.x, cs * 0.25, c.z);
      post.castShadow = true;
      post.receiveShadow = true;
      this.group.add(post);
      
      // 顶部发光水晶
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(cs * 0.12, 0),
        new THREE.MeshStandardMaterial({
          color: '#5dff6a',
          emissive: '#5dff6a',
          emissiveIntensity: 0.5,
          roughness: 0.1,
          metalness: 0.8,
        }),
      );
      crystal.position.set(c.x, cs * 0.7, c.z);
      crystal.castShadow = true;
      this.group.add(crystal);
    }
  }

  private waterMeshes: { mesh: THREE.Mesh; baseZ: Float32Array }[] = [];

  private createRiverEffect(): void {
    // 带顶点细分的水面，供正弦波动画使用
    const segments = 8;

    for (const [row, col] of CONFIG.RIVERS) {
      const waterGeometry = new THREE.PlaneGeometry(
        this.cellSize * 0.9,
        this.cellSize * 0.9,
        segments,
        segments,
      );
      const waterMaterial = new THREE.MeshStandardMaterial({
        color: '#2f9ec9',
        transparent: true,
        opacity: 0.65,
        roughness: 0.15,
        metalness: 0.6,
      });

      const mesh = new THREE.Mesh(waterGeometry, waterMaterial);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(
        col * this.cellSize + this.boardOffsetX,
        0.06,
        row * this.cellSize + this.boardOffsetZ,
      );
      this.group.add(mesh);

      // 保存顶点初始高度，动画时在此基础上叠加正弦波
      const posAttr = waterGeometry.getAttribute('position');
      this.waterMeshes.push({ mesh, baseZ: new Float32Array(posAttr.array as Float32Array) });
    }
  }

  private createDenMarkers(): void {
    const denGeometry = new THREE.CylinderGeometry(this.cellSize * 0.4, this.cellSize * 0.4, 0.15, 32);
    
    for (const den of CONFIG.DENS) {
      const color = den.side === 'blue' ? '#3568f5' : '#ff6b5e';
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.5,
        roughness: 0.2,
        metalness: 0.8,
      });

      const mesh = new THREE.Mesh(denGeometry, material);
      mesh.position.set(
        den.col * this.cellSize + this.boardOffsetX,
        0.08,
        den.row * this.cellSize + this.boardOffsetZ,
      );
      mesh.castShadow = true;
      this.group.add(mesh);
    }
  }

  private createTrapIndicators(): void {
    const trapGeometry = new THREE.BoxGeometry(this.cellSize * 0.6, 0.05, this.cellSize * 0.6);
    
    for (const trap of CONFIG.TRAPS) {
      const color = trap.side === 'blue' ? '#ff6b5e' : '#35c8f5';
      const material = new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.6,
        wireframe: true,
      });

      const mesh = new THREE.Mesh(trapGeometry, material);
      mesh.position.set(
        trap.col * this.cellSize + this.boardOffsetX,
        0.03,
        trap.row * this.cellSize + this.boardOffsetZ,
      );
      this.group.add(mesh);
    }
  }

  private createGrid(): void {
    const gridHelper = new THREE.GridHelper(
      Math.max(CONFIG.BOARD.cols, CONFIG.BOARD.rows) * this.cellSize,
      1,
      '#7a8fd6',
      '#7a8fd6',
    );
    gridHelper.position.set(
      CONFIG.BOARD.cols * this.cellSize / 2 + this.boardOffsetX - this.cellSize / 2,
      0.01,
      CONFIG.BOARD.rows * this.cellSize / 2 + this.boardOffsetZ - this.cellSize / 2,
    );
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.2;
    this.group.add(gridHelper);
  }



  /** Update highlight position based on game state */
  updateHighlight(row: number, col: number): void {
    this.highlightMesh.visible = true;
    this.highlightMesh.position.set(
      col * this.cellSize + this.boardOffsetX,
      0.05,
      row * this.cellSize + this.boardOffsetZ,
    );
  }

  hideHighlight(): void {
    this.highlightMesh.visible = false;
  }

  /** Update selection ring position */
  updateSelection(piece: { row: number; col: number }): void {
    this.selectedMesh.visible = true;
    this.selectedMesh.position.set(
      piece.col * this.cellSize + this.boardOffsetX,
      0.1,
      piece.row * this.cellSize + this.boardOffsetZ,
    );
  }

  hideSelection(): void {
    this.selectedMesh.visible = false;
  }

  /** Show last-move markers (from and to positions) */
  showLastMove(from: { row: number; col: number }, to: { row: number; col: number }): void {
    this.lastMoveFromMesh.position.set(
      from.col * this.cellSize + this.boardOffsetX,
      0.02,
      from.row * this.cellSize + this.boardOffsetZ,
    );
    this.lastMoveFromMesh.visible = true;

    this.lastMoveToMesh.position.set(
      to.col * this.cellSize + this.boardOffsetX,
      0.02,
      to.row * this.cellSize + this.boardOffsetZ,
    );
    this.lastMoveToMesh.visible = true;
  }

  /** Hide last-move markers */
  hideLastMove(): void {
    this.lastMoveFromMesh.visible = false;
    this.lastMoveToMesh.visible = false;
  }

  /** 水面波浪动画：按世界坐标相位做正弦顶点置换 */
  animateWater(time: number): void {
    for (const { mesh, baseZ } of this.waterMeshes) {
      const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const base = baseZ;

      for (let i = 0; i < posAttr.count; i++) {
        const localX = arr[i * 3];
        const localY = arr[i * 3 + 1];
        // 世界坐标相位，让相邻河格的波浪连续
        const worldX = mesh.position.x + localX;
        const worldZ = mesh.position.z - localY;
        arr[i * 3 + 2] =
          base[i * 3 + 2] +
          Math.sin(worldX * 2.2 + time * 1.8) * 0.028 +
          Math.sin(worldZ * 3.1 + time * 2.4) * 0.018;
      }
      posAttr.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
  }
}
