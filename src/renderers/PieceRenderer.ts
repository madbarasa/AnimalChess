/**
 * 斗兽棋 3D - 增强版棋子渲染器
 * 包含：独特动物剪影、皮毛纹理、面部特征、金属装饰、选择脉冲 VFX
 */

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { PieceVisual } from '../game/GameState';

// ===== 程序化材质工厂 =====
class MaterialFactory {
  private cache = new Map<string, THREE.MeshStandardMaterial>();

  furMaterial(colorHex: string, rank: number): THREE.MeshStandardMaterial {
    const colorId = `${colorHex}-rank${rank}`;
    if (this.cache.has(colorId)) return this.cache.get(colorId)!;
    const keyColor = colorHex === '#cc5544' ? '#cc5544' : '#2a9dc0';
    
    // 用 Canvas 生成渐变+噪点的皮毛纹理
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    
    // 基础渐变
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    if (colorHex === '#ff6b5e') {
      gradient.addColorStop(0, '#dd7766');
      gradient.addColorStop(0.5, '#aa4433');
      gradient.addColorStop(1, '#883322');
    } else {
      gradient.addColorStop(0, '#45c0d8');
      gradient.addColorStop(0.5, '#2588b0');
      gradient.addColorStop(1, '#186688');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    
    // 添加噪点模拟毛发纹理
    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const brightness = Math.random() * 0.15 - 0.075;
      ctx.fillStyle = `rgba(${brightness > 0 ? 255 : 0},${brightness > 0 ? 255 : 0},${brightness > 0 ? 255 : 0}, ${Math.abs(brightness)})`;
      ctx.fillRect(x, y, 1, 1);
    }
    
    // 等级相关的材质变化：高等级更闪亮
    const roughness = 0.6 - rank * 0.03;
    const metalness = 0.2 + rank * 0.04;
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      color: new THREE.Color(keyColor),
      roughness: Math.max(0.3, roughness),
      metalness: Math.min(0.5, metalness),
      normalScale: new THREE.Vector2(0.3, 0.3),
    });
    this.cache.set(colorId, mat);
    return mat;
  }

  headMaterial(accentHex: string, rank: number): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(accentHex),
      roughness: 0.3,
      metalness: 0.5 + rank * 0.02,
    });
    return mat;
  }

  eyeMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffcc,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.9,
    });
  }

  pupilMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.2,
      metalness: 0.5,
    });
  }

  metalBadgeMaterial(rank: number): THREE.MeshBasicMaterial {
    const brightness = 200 + rank * 5;
    return new THREE.MeshBasicMaterial({ 
      color: new THREE.Color(`rgb(${brightness},${brightness},${brightness})`)
    });
  }

  earMaterial(colorHex: string): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex).offsetHSL(0, 0, -0.1),
      roughness: 0.5,
      metalness: 0.2,
    });
  }

  noseMaterial(colorHex: string): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex).offsetHSL(0, 0, -0.3),
      roughness: 0.4,
      metalness: 0.1,
    });
  }
}

const materialFactory = new MaterialFactory();

// ===== 动物剪影配置 =====
interface SilhouetteConfig {
  bodyHeight: number;
  bodyRadiusBottom: number;
  bodyRadiusTop: number;
  headSize: number;
  headOffsetY: number;
  hasEars: boolean;
  earShape?: string; // 'round', 'pointed', 'droopy', 'wide'
  hasNose: boolean;
  noseStyle?: string; // 'trunk', 'flat', 'conical'
  hasCrown?: boolean;
  crownStyle?: string; // 'mane', 'crest', 'stripe', 'spots', 'tail', 'spike'
  hasMane?: boolean;
  maneCount?: number;
  baseVolume: number;
}

const SILHOUETTE_CONFIGS: Record<number, SilhouetteConfig> = {
  // Rank 1: 鼠 - small conical shape, big ears, long tail
  1: {
    bodyHeight: 0.3, bodyRadiusBottom: 0.22, bodyRadiusTop: 0.18,
    headSize: 0.15, headOffsetY: 0.45,
    hasEars: true, earShape: 'pointed',
    hasNose: true, noseStyle: 'conical',
    hasMane: false, crownStyle: 'tail',
    baseVolume: 1,
  },
  // Rank 2: 猫 - medium round head, pointed ears
  2: {
    bodyHeight: 0.35, bodyRadiusBottom: 0.28, bodyRadiusTop: 0.24,
    headSize: 0.22, headOffsetY: 0.5,
    hasEars: true, earShape: 'pointed',
    hasNose: true, noseStyle: 'flat',
    hasMane: false,
    baseVolume: 1,
  },
  // Rank 3: 狗 - robust round head, floppy ears
  3: {
    bodyHeight: 0.45, bodyRadiusBottom: 0.32, bodyRadiusTop: 0.28,
    headSize: 0.28, headOffsetY: 0.55,
    hasEars: true, earShape: 'droopy',
    hasNose: true, noseStyle: 'conical',
    hasMane: false,
    baseVolume: 1,
  },
  // Rank 4: 狼 - angular/wedge head, upright ears
  4: {
    bodyHeight: 0.5, bodyRadiusBottom: 0.30, bodyRadiusTop: 0.26,
    headSize: 0.26, headOffsetY: 0.58,
    hasEars: true, earShape: 'wide',
    hasNose: true, noseStyle: 'conical',
    crownStyle: 'spike',
    baseVolume: 1,
  },
  // Rank 5: 豹 - streamlined body, spots pattern handled by roughness
  5: {
    bodyHeight: 0.5, bodyRadiusBottom: 0.30, bodyRadiusTop: 0.25,
    headSize: 0.24, headOffsetY: 0.58,
    hasEars: true, earShape: 'round',
    hasNose: true, noseStyle: 'flat',
    crownStyle: 'spots',
    hasMane: false,
    baseVolume: 1,
  },
  // Rank 6: 虎 - striped back, rounded but strong build
  6: {
    bodyHeight: 0.55, bodyRadiusBottom: 0.34, bodyRadiusTop: 0.28,
    headSize: 0.28, headOffsetY: 0.62,
    hasEars: true, earShape: 'round',
    hasNose: true, noseStyle: 'flat',
    crownStyle: 'stripe',
    hasMane: false,
    baseVolume: 1,
  },
  // Rank 7: 狮 - majestic mane around neck, broad face
  7: {
    bodyHeight: 0.5, bodyRadiusBottom: 0.32, bodyRadiusTop: 0.30,
    headSize: 0.30, headOffsetY: 0.60,
    hasEars: true, earShape: 'round',
    hasNose: true, noseStyle: 'flat',
    crownStyle: 'crest',
    hasMane: true, maneCount: 8,
    baseVolume: 1,
  },
  // Rank 8: 象 - wide body, trunk, big ears
  8: {
    bodyHeight: 0.55, bodyRadiusBottom: 0.36, bodyRadiusTop: 0.32,
    headSize: 0.30, headOffsetY: 0.62,
    hasEars: true, earShape: 'wide',
    hasNose: true, noseStyle: 'trunk',
    hasMane: false,
    baseVolume: 1,
  },
};

export class PieceRenderer {
  private group: THREE.Group;
  private pieceMeshes: Map<PieceVisual, THREE.Group>;
  private cellSize: number;
  private boardOffsetX: number;
  private boardOffsetZ: number;
  private selectionRings: Map<PieceVisual, THREE.Group>;
  private lastUpdateTime = Date.now();
  private pieceHeadRotations: Map<string, number>; // key -> rotation angle

  constructor() {
    this.group = new THREE.Group();
    this.pieceMeshes = new Map();
    this.selectionRings = new Map();
    this.cellSize = CONFIG.BOARD.cellSize;
    
    this.boardOffsetX = -(CONFIG.BOARD.cols - 1) * this.cellSize / 2;
    this.boardOffsetZ = -(CONFIG.BOARD.rows - 1) * this.cellSize / 2;
    
    this.pieceHeadRotations = new Map();
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
        // 同步移除对应的选择环
        const ring = this.selectionRings.get(piece);
        if (ring) {
          this.group.remove(ring);
          this.disposePiece(ring);
          this.selectionRings.delete(piece);
        }
      }
    }

    // Add or update pieces
    for (const piece of currentPieces) {
      if (!this.pieceMeshes.has(piece)) {
        const mesh = this.createPieceMesh(piece);
        this.pieceMeshes.set(piece, mesh);
        this.group.add(mesh);
        
        // Create selection pulse ring
        const ring = this.createSelectionRing(piece);
        this.selectionRings.set(piece, ring);
        this.group.add(ring);
      } else {
        const existing = this.pieceMeshes.get(piece)!;
        this.updatePiecePosition(existing, piece);
        // Update ring position too
        const selRing = this.selectionRings.get(piece);
        if (selRing) {
          this.setPiecePosition(selRing, piece);
          selRing.position.y = -0.01; // just below ground
        }
      }
    }
  }

  /** 创建接触阴影圆盘 */
  private createContactShadow(): THREE.Mesh {
    const radius = this.cellSize * 0.9;
    const geometry = new THREE.CircleGeometry(radius, 32);

    const material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
      premultipliedAlpha: true,
    });

    const shadowMesh = new THREE.Mesh(geometry, material);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.005;
    shadowMesh.name = 'contactShadow';
    return shadowMesh;
  }

  private createPieceMesh(piece: PieceVisual): THREE.Group {
    const group = new THREE.Group();
    const cfg = SILHOUETTE_CONFIGS[piece.rank];
    const color = piece.color === 'red' ? '#ff6b5e' : '#35c8f5';
    const baseColor = piece.color === 'red' ? '#cc5544' : '#2a9dc0';
    
    const cs = this.cellSize; // shorthand
    
    // ========== BODY ==========
    // Custom tapered shape using custom BufferGeometry for more organic look
    const bodyHeight = cfg.bodyHeight * cs;
    const bodyRadiusBottom = cfg.bodyRadiusBottom * cs;
    const bodyRadiusTop = cfg.bodyRadiusTop * cs;
    
    // Use LatheGeometry for slightly bulging organic body profile
    const points: THREE.Vector2[] = [];
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Bulge in middle for organic feel
      const bulge = 1.0 + 0.08 * Math.sin(t * Math.PI);
      const radius = bodyRadiusBottom * (1.0 - t) + bodyRadiusTop * t;
      const r = radius * bulge;
      const y = t * bodyHeight;
      points.push(new THREE.Vector2(r, y));
    }
    const bodyGeometry = new THREE.LatheGeometry(points, 24);
    const bodyMaterial = materialFactory.furMaterial(baseColor, piece.rank);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    body.name = 'body';
    group.add(body);
    
    // ========== HEAD ==========
    const headSize = cfg.headSize * cs;
    const headOffsetY = cfg.headOffsetY * cs;
    
    // Head shape varies by animal type
    let headGeometry: THREE.BufferGeometry;
    switch (piece.rank) {
      case 1: // 鼠 - small cone-like head
        headGeometry = new THREE.ConeGeometry(headSize * 0.8, headSize * 1.5, 12);
        break;
      case 7: // 狮 - broad spherical head
        headGeometry = new THREE.SphereGeometry(headSize, 20, 16);
        break;
      default:
        headGeometry = new THREE.SphereGeometry(headSize, 20, 16);
        // Scale to make it more oval for most animals
        headGeometry.scale(1, 0.9, 1.1);
        headGeometry.computeVertexNormals();
    }
    
    const headMaterial = materialFactory.headMaterial(color, piece.rank);
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = headOffsetY;
    head.castShadow = true;
    head.receiveShadow = true;
    head.name = 'head';
    group.add(head);
    
    // ========== EARS ==========
    if (cfg.hasEars) {
      const earSize = headSize * 0.5;
      const earPositions: [number, number][] = [
        [-headSize * 0.7, headOffsetY], // left
        [headSize * 0.7, headOffsetY],   // right
      ];
      
      for (const [ex, ey] of earPositions) {
        let earGeo: THREE.BufferGeometry;
        switch (cfg.earShape) {
          case 'pointed': // cat, mouse
            earGeo = new THREE.ConeGeometry(earSize * 0.5, earSize * 1.2, 6);
            break;
          case 'droopy': // dog
            earGeo = new THREE.SphereGeometry(earSize * 0.5, 8, 8);
            (earGeo as any).scale?.(1, 0.4, 0.7);
            break;
          case 'wide': // elephant
            earGeo = new THREE.PlaneGeometry(earSize * 1.5, earSize * 1.8);
            break;
          case 'round':
          default:
            earGeo = new THREE.SphereGeometry(earSize * 0.4, 8, 8);
        }
        
        const earMat = materialFactory.earMaterial(baseColor);
        const ear = new THREE.Mesh(earGeo, earMat);
        ear.position.set(ex, ey + (cfg.earShape === 'droopy' ? -earSize * 0.3 : earSize * 0.3), -headSize * 0.2);
        ear.castShadow = true;
        ear.name = ex < 0 ? 'leftEar' : 'rightEar';
        group.add(ear);
      }
    }
    
    // ========== NOSE/MUZZLE ==========
    if (cfg.hasNose) {
      const noseSize = headSize * 0.35;
      let noseGeo: THREE.BufferGeometry;
      const noseY = headOffsetY - headSize * 0.15;
      
      switch (cfg.noseStyle) {
        case 'trunk': // elephant
          // Trunk made from a curved tube
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, noseY, headSize * 1.1),
            new THREE.Vector3(0, noseY - headSize * 0.3, headSize * 1.4),
            new THREE.Vector3(0, noseY - headSize * 0.6, headSize * 1.2),
          ]);
          noseGeo = new THREE.TubeGeometry(curve, 8, noseSize * 0.5, 8, false);
          break;
        case 'conical':
          noseGeo = new THREE.ConeGeometry(noseSize * 0.6, noseSize * 1.2, 8);
          noseGeo.rotateX(-Math.PI / 6);
          break;
        case 'flat':
        default:
          noseGeo = new THREE.SphereGeometry(noseSize, 8, 8);
          noseGeo.scale(1, 0.7, 1.5);
      }
      
      const noseMat = materialFactory.noseMaterial(baseColor);
      const nose = new THREE.Mesh(noseGeo, noseMat);
      nose.position.z = headSize * 0.3;
      nose.name = 'nose';
      group.add(nose);
    }
    
    // ========== EYES ==========
    const eyeSize = headSize * 0.2;
    const eyeOffsetY = headOffsetY + headSize * 0.2;
    const eyePositions: [number, number][] = [
      [-eyeSize * 1.2, eyeOffsetY], // left
      [eyeSize * 1.2, eyeOffsetY],   // right
    ];
    
    for (const [ey, eyPos] of eyePositions) {
      const whiteGeo = new THREE.SphereGeometry(eyeSize, 8, 8);
      const eyeWhiteMat = materialFactory.eyeMaterial();
      const eyeWhite = new THREE.Mesh(whiteGeo, eyeWhiteMat);
      eyeWhite.position.set(ey, eyPos, headSize * 0.8);
      eyeWhite.name = ey < 0 ? 'leftEye' : 'rightEye';
      group.add(eyeWhite);
      
      // Pupil (slightly offset toward front)
      const pupilGeo = new THREE.SphereGeometry(eyeSize * 0.55, 6, 6);
      const pupilMat = materialFactory.pupilMaterial();
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.set(ey, eyPos, headSize * 0.95);
      group.add(pupil);
    }
    
    // ========== CROWN/TOP ORNAMENTS ==========
    if (cfg.crownStyle) {
      switch (cfg.crownStyle) {
        case 'crest': // lion mane - spheres around neck
          if (cfg.hasMane && cfg.maneCount) {
            const maneCount = cfg.maneCount;
            for (let i = 0; i < maneCount; i++) {
              const angle = (i / maneCount) * Math.PI * 2;
              const manGeo = new THREE.SphereGeometry(cs * 0.12, 8, 8);
              const manMat = materialFactory.headMaterial(color, piece.rank);
              const mane = new THREE.Mesh(manGeo, manMat);
              mane.position.set(
                Math.cos(angle) * cs * 0.35,
                cs * 0.45,
                Math.sin(angle) * cs * 0.35
              );
              mane.name = `mane${i}`;
              group.add(mane);
            }
          }
          break;
          
        case 'spike': // wolf - dorsal spikes
          for (let i = 0; i < 4; i++) {
            const spikeGeo = new THREE.ConeGeometry(cs * 0.04, cs * 0.15, 4);
            const spikeMat = materialFactory.metalBadgeMaterial(piece.rank);
            const spike = new THREE.Mesh(spikeGeo, spikeMat);
            spike.position.set(
              (i - 1.5) * cs * 0.1,
              bodyHeight * 0.9,
              0
            );
            spike.name = `spike${i}`;
            group.add(spike);
          }
          break;
          
        case 'stripe': // tiger stripes on body sides
          for (let i = 0; i < 3; i++) {
            const stripeGeo = new THREE.BoxGeometry(cs * 0.08, bodyHeight * 0.4, cs * 0.02);
            const stripeMat = new THREE.MeshStandardMaterial({
              color: piece.color === 'red' ? 0x883322 : 0x186688,
              roughness: 0.8,
              metalness: 0.1,
            });
            const stripe = new THREE.Mesh(stripeGeo, stripeMat);
            stripe.position.set(
              cs * 0.3,
              bodyHeight * 0.5,
              (i - 1) * cs * 0.05
            );
            stripe.rotation.x = Math.atan2(cs * 0.3, bodyHeight * 0.5);
            stripe.name = `stripe${i}`;
            group.add(stripe);
          }
          break;
          
        case 'spots': // leopard spots
          for (let i = 0; i < 5; i++) {
            const spotGeo = new THREE.CircleGeometry(cs * 0.04, 8);
            const spotMat = new THREE.MeshStandardMaterial({
              color: piece.color === 'red' ? 0xaa3322 : 0x186688,
              roughness: 0.9,
              metalness: 0.0,
            });
            const spot = new THREE.Mesh(spotGeo, spotMat);
            const angle = Math.random() * Math.PI * 2;
            spot.position.set(
              Math.cos(angle) * bodyRadiusBottom * 0.85,
              bodyHeight * (0.3 + Math.random() * 0.4),
              Math.sin(angle) * bodyRadiusBottom * 0.85
            );
            spot.lookAt(0, spot.position.y, 0);
            spot.name = `spot${i}`;
            group.add(spot);
          }
          break;
          
        case 'tail': // mouse tail
          const tailCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, -cs * 0.3),
            new THREE.Vector3(0, cs * 0.1, -cs * 0.6),
            new THREE.Vector3(0, cs * 0.25, -cs * 0.9),
            new THREE.Vector3(0, cs * 0.15, -cs * 1.2),
          ]);
          const tailGeo = new THREE.TubeGeometry(tailCurve, 12, cs * 0.025, 4, false);
          const tailMat = materialFactory.furMaterial(baseColor, piece.rank);
          const tail = new THREE.Mesh(tailGeo, tailMat);
          tail.position.set(0, 0, 0);
          tail.name = 'tail';
          group.add(tail);
          break;
      }
    }
    
    // ========== RANK BADGE ==========
    // Metallic decorative ring/pattern that indicates animal rank
    const badgeY = bodyHeight * 0.35;
    const badgeGeo = new THREE.TorusGeometry(cs * 0.2, cs * 0.015, 6, 16);
    const badgeMat = materialFactory.metalBadgeMaterial(piece.rank);
    const badge = new THREE.Mesh(badgeGeo, badgeMat);
    badge.position.y = badgeY;
    badge.rotation.x = Math.PI / 2;
    badge.name = 'rankBadge';
    group.add(badge);
    
    // Extra decorative elements based on rank tiers
    if (piece.rank >= 6) {
      // High-rank: add golden accents on top
      const accentGeo = new THREE.SphereGeometry(cs * 0.08, 8, 8);
      const accentMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
      const accent = new THREE.Mesh(accentGeo, accentMat);
      accent.position.y = cfg.headOffsetY + headSize;
      accent.name = 'crownAccent';
      group.add(accent);
    }
    
    // ========== TEXT LABEL ==========
    const textSprite = this.createTextSprite(piece.name, color);
    textSprite.position.y = cfg.headOffsetY + headSize * 1.5;
    group.add(textSprite);
    
    // ========== CONTACT SHADOW ==========
    const contactShadow = this.createContactShadow();
    group.add(contactShadow);
    
    // Position the piece
    this.setPiecePosition(group, piece);
    
    return group;
  }

  /** Create a pulsing selection ring under the piece */
  private createSelectionRing(piece: PieceVisual): THREE.Group {
    const group = new THREE.Group();
    const cs = this.cellSize;
    
    // Main ring
    const ringGeo = new THREE.RingGeometry(cs * 0.25, cs * 0.45, 32);
    const ringMat = new THREE.MeshBasicMaterial({ 
      color: piece.color === 'red' ? 0xffd166 : 0x5dff6a,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.name = 'selectionRing';
    group.add(ring);
    
    // Inner glow disc
    const glowGeo = new THREE.CircleGeometry(cs * 0.25, 24);
    const glowMat = new THREE.MeshBasicMaterial({
      color: piece.color === 'red' ? 0xff6b5e : 0x35c8f5,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.005;
    glow.name = 'glowDisc';
    group.add(glow);
    
    this.setPiecePosition(group, piece);
    group.position.y = -0.01;
    
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
    const ctx = canvas.getContext('2d')!;

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

  /** Update which piece should be highlighted */
  updateSelection(selected: PieceVisual | null): void {
    for (const [piece, ring] of this.selectionRings) {
      const isActive = selected !== null && piece === selected;
      if (isActive) {
        ring.visible = true;
        // Highlight eyes brighter
        this.blinkEyes(piece, true);
      } else {
        ring.visible = false;
        this.blinkEyes(piece, false);
      }
    }
  }

  private blinkEyes(piece: PieceVisual, active: boolean): void {
    const mesh = this.pieceMeshes.get(piece);
    if (!mesh) return;
    mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.name.startsWith('leftEye') || child.name.startsWith('rightEye')) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (active) {
          mat.emissive.setHex(0xffffcc);
          mat.emissiveIntensity = 1.0;
        } else {
          mat.emissive.setHex(0x444444);
          mat.emissiveIntensity = 0.1;
        }
      }
    });
  }

  /** Animation loop for selection ring pulse */
  animateSelection(time: number): void {
    // Idle 呼吸动画：所有棋子轻微上下浮动
    const breatheSpeed = 0.5 + this.group.children.length * 0.01;
    const breatheAmplitude = 0.02 + this.group.children.length * 0.0008;
    
    const now = Date.now();
    const dt = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;
    
    for (const [piece, mesh] of this.pieceMeshes) {
      if (!mesh.parent) continue;
      
      // 轻微上下浮动（呼吸效果）
      const breath = Math.sin(time * breatheSpeed) * breatheAmplitude;
      const basePos = piece.visualX + this.boardOffsetX;
      const currentZ = piece.visualY + this.boardOffsetZ;
      mesh.position.set(basePos, breath, currentZ);
      
      // 头部小幅度转动
      const key = `${piece.rank}_${piece.color}`;
      const rotationSpeed = 0.3 + piece.rank * 0.03;
      let headRotation = this.pieceHeadRotations.get(key) ?? 0;
      headRotation += dt * rotationSpeed * (Math.random() - 0.5);
      headRotation = Math.max(-0.03, Math.min(0.03, headRotation));
      this.pieceHeadRotations.set(key, headRotation);
      
      const head = mesh.getObjectByName('head');
      if (head instanceof THREE.Mesh) {
        head.rotation.y = headRotation;
      }
      
      // 选中环脉冲效果
      const ring = this.selectionRings.get(piece);
      if (!ring || !ring.visible) continue;
      
      const pulse = 1.0 + 0.15 * Math.sin(time * 4 + piece.rank);
      ring.scale.set(pulse, 1, pulse);
      
      // 闪烁内发光盘
      const glowDisc = ring.getObjectByName('glowDisc');
      if (glowDisc instanceof THREE.Mesh) {
        glowDisc.material.opacity = 0.15 + 0.1 * Math.sin(time * 3 + 1 + piece.rank * 0.5);
      }
    }
  }
}
