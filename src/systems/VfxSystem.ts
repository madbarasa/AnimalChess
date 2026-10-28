/**
 * 斗兽棋 3D - 视觉特效系统
 *
 * 程序化 VFX：走子拖尾粒子、吃子爆发、胜利闪光。
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
  burst(position: THREE.Vector3, colorHex: number, count = 24): void {
    const color = new THREE.Color(colorHex);
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 0.03 + Math.random() * 0.04;
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
      sizes[i] = 0.04 + Math.random() * 0.03;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    this.particleGroups.add(points);

    // 简单动画：0.8 秒内扩散并淡出
    const start = Date.now();
    const duration = 800;
    const animate = () => {
      const now = Date.now();
      const t = Math.min(1, (now - start) / duration);
      if (!points.geometry) return;
      const pos = points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) {
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

  /** 从 from 到 to 的短暂拖尾粒子 */
  trail(from: THREE.Vector3, to: THREE.Vector3, colorHex: number, count = 16): void {
    const color = new THREE.Color(colorHex);
    const duration = 600;
    const start = Date.now();

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const seeds: number[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = from.x;
      positions[i * 3 + 1] = from.y;
      positions[i * 3 + 2] = from.z;
      seeds.push(Math.random());
      const c = color.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    this.particleGroups.add(points);

    const dir = to.clone().sub(from);

    const animate = () => {
      const now = Date.now();
      const t = Math.min(1, (now - start) / duration);
      if (!points.geometry) return;
      const pos = points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) {
        const seed = seeds[i];
        const p = from.clone().add(dir.clone().multiplyScalar(seed + t * (1 - seed)));
        pos.array[i * 3] = p.x + (Math.random() - 0.5) * 0.08;
        pos.array[i * 3 + 1] = p.y + 0.1 + Math.sin(seed * 10 + t * 8) * 0.05;
        pos.array[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.08;
      }
      pos.needsUpdate = true;
      material.opacity = 0.8 * (1 - t);
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
