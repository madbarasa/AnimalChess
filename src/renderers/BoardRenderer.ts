/**
 * 斗兽棋 3D - 棋盘场景渲染器
 */

import * as THREE from 'three';
import { CONFIG, isRiver, getTrapSide, getDenSide } from '../config';

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
    
    for (let x = 0; x < CONFIG.BOARD.cols; x++) {
      for (let y = 0; y < CONFIG.BOARD.rows; y++) {
        const river = isRiver(y, x);
        const trapSide = getTrapSide(y, x);
        const denSide = getDenSide(y, x);

        let color: string;
        if (river) {
          color = '#1c749e';
        } else if (trapSide === 'blue') {
          color = 'rgba(255, 107, 94, 0.3)';
        } else if (trapSide === 'red') {
          color = 'rgba(53, 200, 245, 0.3)';
        } else if (denSide === 'blue') {
          color = '#3568f5';
        } else if (denSide === 'red') {
          color = '#ff6b5e';
        } else {
          // Checkerboard pattern
          color = (x + y) % 2 === 0 ? '#171b30' : '#1a2040';
        }

        const material = new THREE.MeshStandardMaterial({
          color,
          roughness: river ? 0.3 : 0.8,
          metalness: river ? 0.1 : 0.05,
        });

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

  private createRiverEffect(): void {
    // Water shimmer effect using transparent overlay planes
    const waterGeometry = new THREE.PlaneGeometry(this.cellSize * 0.9, 0.01);
    const waterMaterial = new THREE.MeshBasicMaterial({
      color: '#63d5ff',
      transparent: true,
      opacity: 0.3,
    });

    for (const [row, col] of CONFIG.RIVERS) {
      const mesh = new THREE.Mesh(waterGeometry, waterMaterial);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(
        col * this.cellSize + this.boardOffsetX,
        0.06,
        row * this.cellSize + this.boardOffsetZ,
      );
      this.group.add(mesh);
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

  /** Animate water shimmer */
  animateWater(_time: number): void {
    // Placeholder for future water animation
  }
}
