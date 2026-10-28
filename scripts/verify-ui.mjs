import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile', width: 375, height: 667 },
];

async function main() {
  console.log('🎮 Starting UI verification...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect console errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  // Start preview server
  console.log('📦 Starting preview server...');
  const serverProcess = spawn('npm', ['run', 'preview', '--', '--port', '4188'], {
    cwd: join(__dirname, '..'),
    shell: true,
    stdio: 'pipe',
  });

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    // Navigate to the game
    console.log('🌐 Navigating to http://127.0.0.1:4188\n');
    await page.goto('http://127.0.0.1:4188', { waitUntil: 'networkidle' });

    // Wait for game to initialize
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Test 1: UI elements presence
    console.log('📋 Checking UI elements...');
    const uiChecks = await page.evaluate(() => {
      const checks = {
        turnDisplay: !!document.querySelector('.turn-display'),
        timerValue: !!document.querySelector('.timer-value'),
        rosterRow: !!document.querySelector('.roster-row'),
        modeButtons: !!document.querySelector('.btn-group'),
        personalitySelect: !!document.querySelector('.ai-config select'),
        restartButton: !!document.querySelector('.restart-btn'),
        logContainer: !!document.querySelector('.log-container'),
        selectedInfo: !!document.querySelector('.selected-info'),
      };
      return checks;
    });

    let allUiPresent = true;
    for (const [name, present] of Object.entries(uiChecks)) {
      const status = present ? '✅' : '❌';
      console.log(`  ${status} ${name}: ${present}`);
      if (!present) allUiPresent = false;
    }

    if (!allUiPresent) {
      console.log('\n❌ Some UI elements are missing!');
    } else {
      console.log('\n✅ All UI elements present\n');
    }

    // Test 2: Capture color regression test
    console.log('🔬 Testing capture color bug fix...');
    
    // Manipulate game state to create a capture scenario
    const captureTest = await page.evaluate(() => {
      const game = window.animalChessGame;
      if (!game) return { error: 'Game instance not found' };

      const gameState = game.gameState;
      const pieceRenderer = game.pieceRenderer;

      // Find a red piece and a blue piece
      let redPiece = null;
      let bluePiece = null;
      
      for (const piece of gameState.pieces.values()) {
        if (piece.color === 'red' && !redPiece) redPiece = piece;
        if (piece.color === 'blue' && !bluePiece) bluePiece = piece;
        if (redPiece && bluePiece) break;
      }

      if (!redPiece || !bluePiece) {
        return { error: 'Could not find pieces for test' };
      }

      // Teleport blue piece adjacent to red piece
      const blueOldPos = { row: bluePiece.row, col: bluePiece.col };
      const redPos = { row: redPiece.row, col: redPiece.col };
      
      // Move blue piece to red's position (will be captured)
      // First, remove from old position
      const blueKey = `${blueOldPos.col}_${blueOldPos.row}`;
      gameState.board[blueOldPos.col][blueOldPos.row].animal = null;
      gameState.pieces.delete(blueKey);

      // Place at position adjacent to red
      const targetRow = redPos.row;
      const targetCol = redPos.col;
      bluePiece.row = targetRow;
      bluePiece.col = targetCol;
      bluePiece.visualX = targetCol * 1.2;
      bluePiece.visualY = targetRow * 1.2;
      bluePiece.targetX = targetCol * 1.2;
      bluePiece.targetY = targetRow * 1.2;
      
      gameState.board[targetCol][targetRow].animal = {
        rank: bluePiece.rank,
        color: bluePiece.color,
        row: targetRow,
        col: targetCol,
      };
      gameState.pieces.set(`${targetCol}_${targetRow}`, bluePiece);

      // Now red piece captures blue piece
      const redKey = `${redPos.col}_${redPos.row}`;
      gameState.board[redPos.col][redPos.row].animal = null;
      gameState.pieces.delete(redKey);

      redPiece.row = targetRow;
      redPiece.col = targetCol;
      redPiece.visualX = redPos.col * 1.2;
      redPiece.visualY = redPos.row * 1.2;
      redPiece.targetX = targetCol * 1.2;
      redPiece.targetY = targetRow * 1.2;

      gameState.board[targetCol][targetRow].animal = {
        rank: redPiece.rank,
        color: redPiece.color,
        row: targetRow,
        col: targetCol,
      };
      gameState.pieces.set(`${targetCol}_${targetRow}`, redPiece);

      // Update renderer
      pieceRenderer.updatePieces(gameState.pieces);

      // Check the mesh at target position
      const mesh = pieceRenderer.pieceMeshes.get(redPiece);
      if (!mesh) {
        return { error: 'Mesh not found for red piece' };
      }

      // Find the body material (cylinder)
      let bodyMaterial = null;
      mesh.traverse(child => {
        if (child.type === 'Mesh' && child.geometry.type === 'CylinderGeometry') {
          bodyMaterial = child.material;
        }
      });

      if (!bodyMaterial) {
        return { error: 'Body material not found' };
      }

      const colorHex = '#' + bodyMaterial.color.getHexString();
      const isRed = colorHex.toLowerCase() === '#cc5544';

      return {
        success: true,
        pieceColor: redPiece.color,
        meshColor: colorHex,
        expectedRed: '#cc5544',
        isCorrect: isRed,
      };
    });

    if (captureTest.error) {
      console.log(`  ❌ Capture test failed: ${captureTest.error}\n`);
    } else if (captureTest.success) {
      console.log(`  Piece color: ${captureTest.pieceColor}`);
      console.log(`  Mesh color: ${captureTest.meshColor}`);
      console.log(`  Expected: ${captureTest.expectedRed}`);
      console.log(`  Result: ${captureTest.isCorrect ? '✅ PASS' : '❌ FAIL'}\n`);
    }

    // Test 3: Take screenshots
    console.log('📸 Taking screenshots...');
    
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(1000);
      
      const screenshotPath = `artifacts/verification/${viewport.name}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  ✅ Saved ${viewport.name} screenshot: ${screenshotPath}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('UI Verification Complete');
    console.log('='.repeat(60));
    console.log(`Console errors: ${errors.length}`);
    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    }

  } finally {
    // Cleanup
    serverProcess.kill('SIGTERM');
    await browser.close();
    console.log('\n✅ Verification complete\n');
  }
}

import { spawn } from 'child_process';
main().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
