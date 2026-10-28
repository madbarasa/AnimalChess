/**
 * 斗兽棋 3D - 3D 棋子渲染器
 */

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { PieceVisual } from '../game/GameState';

export class PieceRenderer {
  private group: THREE.Group;
  private pieceMeshes: Map<PieceVisual, THREE.Group>;
  private cellSize: number;
  private boardOffsetX: number;
  private boardOffsetZ: number;

  constructor() {
    this.group = new THREE.Group();
    this.pieceMeshes = new Map();
    this.cellSize = CONFIG.BOARD.cellSize;
    
    this.boardOffsetX = -(CONFIG.BOARD.cols - 1) * this.cellSize / 2;
    this.boardOffsetZ = -(CONFIG.BOARD.rows - 1) * this.cellSize / 2;
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  /** Create and add all piece meshes */
  updatePieces(pieces: Map<string, PieceVisual>): void {
    const currentPieces = new Set(pieces.values());
    
    // Remove pieces no longer in the game state
    for (const [piece, mesh] of this.pieceMeshes) {
      if (!currentPieces.has(piece)) {
        this.group.remove(mesh);
        this.disposePiece(mesh);
        this.pieceMeshes.delete(piece);
      }
    }

    // Add or update pieces
    for (const piece of currentPieces) {
      if (!this.pieceMeshes.has(piece)) {
        const mesh = this.createPieceMesh(piece);
        this.pieceMeshes.set(piece, mesh);
        this.group.add(mesh);
      } else {
        const existing = this.pieceMeshes.get(piece)!;
        this.updatePiecePosition(existing, piece);
      }
    }
  }

  private createPieceMesh(piece: PieceVisual): THREE.Group {
    const group = new THREE.Group();
    
    const color = piece.color === 'red' ? '#ff6b5e' : '#35c8f5';
    const baseColor = piece.color === 'red' ? '#cc5544' : '#2a9dc0';
    
    // Main body - cylinder shape for animals
    const bodyGeometry = new THREE.CylinderGeometry(
      this.cellSize * 0.35,
      this.cellSize * 0.4,
      this.cellSize * 0.5,
      16,
    );
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.4,
      metalness: 0.3,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = this.cellSize * 0.25;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Top dome - represents animal head
    const headGeometry = new THREE.SphereGeometry(this.cellSize * 0.3, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const headMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.3,
      metalness: 0.5,
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = this.cellSize * 0.5;
    head.castShadow = true;
    group.add(head);

    // Rank indicator - small ring on top
    const ringGeometry = new THREE.TorusGeometry(this.cellSize * 0.15, 0.02, 8, 16);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.y = this.cellSize * 0.8;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    // Text label using canvas texture
    const textSprite = this.createTextSprite(piece.name, color);
    textSprite.position.y = this.cellSize * 1.0;
    group.add(textSprite);

    // Position the piece
    this.setPiecePosition(group, piece);

    return group;
  }

  private updatePiecePosition(group: THREE.Group, piece: PieceVisual): void {
    this.setPiecePosition(group, piece);
  }

  private setPiecePosition(group: THREE.Group, piece: PieceVisual): void {
    const visualX = piece.visualX + this.boardOffsetX;
    const visualZ = piece.visualY + this.boardOffsetZ;
    
    group.position.x = visualX;
    group.position.z = visualZ;
    group.position.y = 0;
  }

  private createTextSprite(text: string, accentColor: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot create text sprite context');

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.roundRect(0, 0, 128, 64, 10);
    ctx.fill();

    // Border
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.roundRect(2, 2, 124, 60, 10);
    ctx.stroke();

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.6, 0.3, 1);
    
    return sprite;
  }

  private disposePiece(group: THREE.Group): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
  }

  /** Animate piece selection highlight */
  animateSelection(_time: number): void {
    // Placeholder for future animation
  }
}
