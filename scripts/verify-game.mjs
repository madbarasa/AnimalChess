#!/usr/bin/env node
/**
 * 斗兽棋 3D 浏览器验证：截图 + 像素统计 + 真实点击走子 + AI 回手
 *
 * 用法：node scripts/verify-game.mjs [url]
 * 默认使用本机 Edge（channel: msedge），无需下载 Playwright 浏览器。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const URL_ARG = process.argv[2] ?? 'http://127.0.0.1:5188/';
const OUT = 'artifacts/verification';

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
];

function pixelStats(buffer) {
  const png = PNG.sync.read(buffer);
  let min = 255;
  let max = 0;
  const buckets = new Set();
  let samples = 0;
  const stride = Math.max(1, Math.floor((png.width * png.height) / 8192));

  for (let pixel = 0; pixel < png.width * png.height; pixel += stride) {
    const offset = pixel * 4;
    const r = png.data[offset];
    const g = png.data[offset + 1];
    const b = png.data[offset + 2];
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    buckets.add(`${r >> 4},${g >> 4},${b >> 4}`);
    samples += 1;
  }

  return {
    width: png.width,
    height: png.height,
    variance: max - min,
    colorBuckets: buckets.size,
    dominantShare: Number((1 / Math.max(1, buckets.size)).toFixed(3)),
    samples,
    nonBlank: max - min > 8 || buckets.size > 3,
  };
}

async function readDiagnostics(page, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = await page.evaluate(() => window.__ANIMAL_CHESS_DIAGNOSTICS__ ?? null);
    if (info) return info;
    await page.waitForTimeout(100);
  }
  throw new Error(`诊断信息在 ${timeoutMs}ms 内未出现`);
}

async function clickCell(page, row, col) {
  const pos = await page.evaluate(([r, c]) => {
    const game = window.animalChessGame;
    if (!game) throw new Error('window.animalChessGame 未暴露');
    const point = game.projectCell(r, c);
    const rect = document.querySelector('canvas').getBoundingClientRect();
    return { x: rect.left + point.x, y: rect.top + point.y };
  }, [row, col]);
  await page.mouse.click(pos.x, pos.y);
  return pos;
}

async function runViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const result = {
    viewport: viewport.name,
    url: URL_ARG,
    screenshot: null,
    pixels: null,
    initial: null,
    interaction: null,
    consoleErrors,
    pageErrors,
    ok: false,
  };

  try {
    await page.goto(URL_ARG, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('canvas', { state: 'visible', timeout: 15000 });

    const initial = await readDiagnostics(page);
    result.initial = {
      turn: initial.turn,
      pieceCount: initial.pieceCount,
      redCount: initial.redCount,
      blueCount: initial.blueCount,
      mode: initial.mode,
      renderer: initial.renderer,
      canvas: initial.canvas,
    };

    await mkdir(OUT, { recursive: true });
    const shotPath = path.join(OUT, `${viewport.name}.png`);
    const buffer = await page.screenshot({ path: shotPath, fullPage: true });
    result.screenshot = shotPath;
    result.pixels = pixelStats(buffer);

    // 只在桌面视口做一次真实交互验证
    if (viewport.name === 'desktop') {
      await clickCell(page, 6, 6); // 红方鼠
      await page.waitForTimeout(250);
      const afterSelect = await readDiagnostics(page);

      await clickCell(page, 5, 6); // 前进一格
      await page.waitForTimeout(2500); // 等 AI 回手（含 220ms 思考延时）
      const afterMove = await readDiagnostics(page);

      const mouseAfter = afterMove.pieces.find(
        (piece) => piece.color === 'red' && piece.name === '鼠',
      );

      result.interaction = {
        selectedAfterFirstClick: afterSelect.selected,
        turnAfterMove: afterMove.turn,
        mousePosition: mouseAfter ?? null,
        pieceCountAfterMove: afterMove.pieceCount,
        aiMoved: afterMove.pieceCount === initial.pieceCount && afterMove.turn === initial.turn,
        selectionCleared: afterMove.selected === null,
      };
    }

    result.ok =
      initial.pieceCount === 16 &&
      initial.redCount === 8 &&
      initial.blueCount === 8 &&
      result.pixels.nonBlank &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    await context.close();
  }

  return result;
}

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const reports = [];
  try {
    for (const viewport of VIEWPORTS) {
      reports.push(await runViewport(browser, viewport));
    }
  } finally {
    await browser.close();
  }

  await mkdir(OUT, { recursive: true });
  const reportPath = path.join(OUT, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(reports, null, 2)}\n`);

  for (const report of reports) {
    const parts = [report.ok ? 'PASS' : 'FAIL', report.viewport];
    if (report.pixels) {
      parts.push(`pixels=${report.pixels.width}x${report.pixels.height}`,
        `variance=${report.pixels.variance}`, `buckets=${report.pixels.colorBuckets}`);
    }
    if (report.initial) {
      parts.push(`pieces=${report.initial.pieceCount}`, `turn=${report.initial.turn}`);
      if (report.initial.renderer) {
        parts.push(`calls=${report.initial.renderer.calls}`,
          `tris=${report.initial.renderer.triangles}`);
      }
    }
    if (report.interaction) {
      parts.push(`mouse=${JSON.stringify(report.interaction.mousePosition)}`,
        `aiMoved=${report.interaction.aiMoved}`);
    }
    if (report.error) parts.push(`error=${JSON.stringify(report.error.slice(0, 240))}`);
    if (report.consoleErrors.length) {
      parts.push(`consoleErrors=${report.consoleErrors.length} first=${JSON.stringify(report.consoleErrors[0].slice(0, 160))}`);
    }
    if (report.pageErrors.length) {
      parts.push(`pageErrors=${report.pageErrors.length} first=${JSON.stringify(report.pageErrors[0].slice(0, 160))}`);
    }
    if (report.screenshot) parts.push(`png=${report.screenshot}`);
    console.log(parts.join(' '));
  }

  console.log(`report=${reportPath}`);
  if (reports.some((report) => !report.ok)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});