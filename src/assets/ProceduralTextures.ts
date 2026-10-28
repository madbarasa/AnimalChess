/**
 * 斗兽棋 3D - 程序化纹理库
 *
 * 用 Canvas 生成可复用的纹理：草地、石板、河流焦散、背景星点。
 * 所有纹理设置正确的 colorSpace、wrap、filtering。
 */

import * as THREE from 'three';

/** 噪点辅助：在 canvas 上撒指定密度的随机像素 */
function scatterNoise(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  count: number,
  r: number,
  g: number,
  b: number,
  alphaRange: [number, number],
): void {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const a = alphaRange[0] + Math.random() * (alphaRange[1] - alphaRange[0]);
    ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
    ctx.fillRect(x, y, 1 + Math.random(), 1 + Math.random());
  }
}

/** 棋盘草地格纹理：深色基底 + 草纹噪点 + 暗色斑块 */
export function createGrassTexture(variant: 0 | 1): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // 基底渐变
  const base = ctx.createLinearGradient(0, 0, size, size);
  if (variant === 0) {
    base.addColorStop(0, '#1a2040');
    base.addColorStop(1, '#151a35');
  } else {
    base.addColorStop(0, '#171b30');
    base.addColorStop(1, '#121628');
  }
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // 草纹：竖向短线
  ctx.strokeStyle = variant === 0 ? 'rgba(60,90,70,0.35)' : 'rgba(50,80,65,0.3)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 3 + Math.random() * 6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 2, y - len);
    ctx.stroke();
  }

  // 噪点细节
  scatterNoise(ctx, size, size, 800, 40, 60, 50, [0.05, 0.15]);
  scatterNoise(ctx, size, size, 400, 80, 100, 90, [0.08, 0.2]);

  // 暗色斑块（模拟阴影/湿地）
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = 15 + Math.random() * 25;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, 'rgba(0,0,10,0.25)');
    grad.addColorStop(1, 'rgba(0,0,10,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** 河流底部石板纹理 */
export function createRiverbedTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // 深蓝石板基底
  ctx.fillStyle = '#0d2a3a';
  ctx.fillRect(0, 0, size, size);

  // 石板裂纹
  ctx.strokeStyle = 'rgba(5,15,25,0.5)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    let x = Math.random() * size;
    let y = Math.random() * size;
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (Math.random() - 0.5) * 40;
      y += (Math.random() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // 水生噪点
  scatterNoise(ctx, size, size, 600, 20, 60, 80, [0.1, 0.3]);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** 陷阱格骷髅/危险标记纹理 */
export function createHazardTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  // 警告条纹（斜线）
  ctx.strokeStyle = 'rgba(255,209,102,0.25)';
  ctx.lineWidth = 6;
  for (let i = -size; i < size * 2; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }

  // 中心菱形标记
  ctx.strokeStyle = 'rgba(255,107,94,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(size / 2, size * 0.3);
  ctx.lineTo(size * 0.7, size / 2);
  ctx.lineTo(size / 2, size * 0.7);
  ctx.lineTo(size * 0.3, size / 2);
  ctx.closePath();
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** 兽穴巢穴纹理：辐射光晕 */
export function createDenTexture(side: 'red' | 'blue'): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  const color = side === 'red' ? '255,107,94' : '53,200,245';
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${color},0.5)`);
  grad.addColorStop(0.5, `rgba(${color},0.2)`);
  grad.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // 八角星纹
  ctx.strokeStyle = `rgba(${color},0.6)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r1 = size * 0.2;
    const r2 = size * 0.38;
    ctx.moveTo(size / 2 + Math.cos(a) * r1, size / 2 + Math.sin(a) * r1);
    ctx.lineTo(size / 2 + Math.cos(a) * r2, size / 2 + Math.sin(a) * r2);
  }
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 背景星点粒子纹理：圆形光晕 */
export function createStarSprite(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(200,220,255,0.6)');
  grad.addColorStop(1, 'rgba(100,150,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
