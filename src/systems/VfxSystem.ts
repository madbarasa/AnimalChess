/**
 * 斗兽棋 3D - 视觉特效系统
 *
 * 程序化 VFX：走子拖尾粒子、吃子爆发、胜利闪光、选中光束。
 * 所有特效基于 BufferGeometry + Points 或 Mesh，轻量且无需外部资源。
 */

import * as THREE from 'three';

export class VfxSystem {
  private scene: THREE.Scene;
  private particleGroups: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.particleGroups = new THREE.Group();
    this.scene.add(this.particleGroups);
  }

  getGroup(): THREE.Group {
    return this.particleGroups;
  }

  /** 在指定位置产生一个短促的粒子爆发（捕获/胜利反馈） */
  burst(position: THREE.Vector3, colorHex: number, count = 32, rank = 4): void {
    const color = new THREE.Color(colorHex);
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const velocities: THREE.Vector3[] = [];

    // 高等级更多粒子、更大速度
    const extraCount = Math.min(24, rank * 3);
    const totalCount = count + extraCount;
    const speedBase = 0.03 + rank * 0.003;

    for (let i = 0; i < totalCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = speedBase + Math.random() * (0.04 + rank * 0.005);
      const v = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed,
        Math.sin(phi) * Math.sin(theta) * speed,
      );
      velocities.push(v);

      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;

      const c = color.clone();
      c.offsetHSL(0, 0, (Math.random() - 0.5) * 0.15);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      sizes[i] = 0.04 + Math.random() * 0.03 + rank * 0.002;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.05 + rank * 0.003,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    this.particleGroups.add(points);

    // 简单动画：持续时间随等级增加
    const start = Date.now();
    const duration = 800 + rank * 30;
    const animate = () => {
      const now = Date.now();
      const t = Math.min(1, (now - start) / duration);
      if (!points.geometry) return;
      const pos = points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < totalCount; i++) {
        const v = velocities[i];
        pos.array[i * 3] += v.x;
        pos.array[i * 3 + 1] += v.y;
        pos.array[i * 3 + 2] += v.z;
        // gravity
        v.y -= 0.0005;
      }
      pos.needsUpdate = true;
      material.opacity = 0.9 * (1 - t);
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        this.particleGroups.remove(points);
        geometry.dispose();
        material.dispose();
      }
    };
    requestAnimationFrame(animate);
  }

  /** 为棋子创建选中光束：从棋盘向上发射的半透明光柱 */
  selectionBeam(position: THREE.Vector3, colorHex: number, rank: number): THREE.Mesh {
    // 光束高度随等级提升：高等级更霸气
    const height = 1.5 + rank * 0.15;
    const radius = 0.08 + rank * 0.008;
    
    // 圆柱体分段，便于渐变材质
    const segments = 16;
    const geometry = new THREE.CylinderGeometry(radius, radius * 0.3, height, segments, 1, true);
    
    // 顶点颜色渐变：底部亮 -> 顶部透明
    const colors = new Float32Array(segments * 2 * 3);
    const color = new THREE.Color(colorHex);
    for (let i = 0; i < segments; i++) {
      // 底部顶点（亮）
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      // 顶部顶点（暗）
      colors[(segments + i) * 3] = color.r * 0.1;
      colors[(segments + i) * 3 + 1] = color.g * 0.1;
      colors[(segments + i) * 3 + 2] = color.b * 0.1;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.35 + rank * 0.02, // 高等级更浓
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, height / 2, position.z);
    
    this.particleGroups.add(mesh);
    return mesh;
  }

  /** 升级版拖尾：螺旋上升粒子流，速度感更强 */
  trail(from: THREE.Vector3, to: THREE.Vector3, colorHex: number, count = 24, rank = 4): void {
    const color = new THREE.Color(colorHex);
    const duration = 500 + (8 - rank) * 15; // 高等级移动更快
    const start = Date.now();

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const seeds: number[] = [];
    const angles: number[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = from.x;
      positions[i * 3 + 1] = from.y;
      positions[i * 3 + 2] = from.z;
      seeds.push(Math.random());
      angles.push(Math.random() * Math.PI * 2);
      const c = color.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.05 + rank * 0.005, // 高等级粒子更大
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    this.particleGroups.add(points);

    const dir = to.clone().sub(from);
    const distance = dir.length();
    dir.normalize();

    // 垂直方向（用于螺旋）
    const up = new THREE.Vector3(0, 1, 0);
    const perpendicular = new THREE.Vector3().crossVectors(dir, up).normalize();

    const animate = () => {
      const now = Date.now();
      const t = Math.min(1, (now - start) / duration);
      if (!points.geometry) return;
      const pos = points.geometry.getAttribute('position') as THREE.BufferAttribute;
      
      // 缓动函数：easeOutCubic
      const easedT = 1 - Math.pow(1 - t, 3);
      
      for (let i = 0; i < count; i++) {
        const seed = seeds[i];
        const angleOffset = angles[i];
        
        // 粒子沿路径前进，带轻微螺旋
        const progress = easedT + seed * 0.1 * (1 - easedT);
        const basePos = from.clone().add(dir.clone().multiplyScalar(progress * distance));
        
        // 螺旋偏移
        const spiralRadius = 0.06 + rank * 0.008;
        const spiralAngle = angleOffset + progress * Math.PI * 4;
        const offset = perpendicular.clone().multiplyScalar(Math.sin(spiralAngle) * spiralRadius);
        
        // 高度起伏
        const height = Math.sin(progress * Math.PI * 3 + angleOffset) * 0.08 * (1 + rank * 0.1);
        
        pos.array[i * 3] = basePos.x + offset.x + (Math.random() - 0.5) * 0.04;
        pos.array[i * 3 + 1] = basePos.y + height + 0.15;
        pos.array[i * 3 + 2] = basePos.z + offset.z + (Math.random() - 0.5) * 0.04;
      }
      pos.needsUpdate = true;
      material.opacity = 0.85 * (1 - easedT);
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        this.particleGroups.remove(points);
        geometry.dispose();
        material.dispose();
      }
    };
    requestAnimationFrame(animate);
  }

  /** 胜利时全屏闪光 */
  victoryFlash(onComplete?: () => void): void {
    const geom = new THREE.PlaneGeometry(40, 40);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(0, 10, 0);
    mesh.lookAt(this.scene.position);
    this.particleGroups.add(mesh);

    const start = Date.now();
    const duration = 900;

    const animate = () => {
      const now = Date.now();
      const t = Math.min(1, (now - start) / duration);
      const intensity = Math.sin(t * Math.PI);
      mat.opacity = intensity * 0.35;
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        this.particleGroups.remove(mesh);
        geom.dispose();
        mat.dispose();
        onComplete?.();
      }
    };
    requestAnimationFrame(animate);
  }

  /** 清理所有特效（切换场景/游戏结束时） */
  clear(): void {
    while (this.particleGroups.children.length > 0) {
      const child = this.particleGroups.children[0];
      this.particleGroups.remove(child);
      if (child instanceof THREE.Points) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      } else if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
  }
}
