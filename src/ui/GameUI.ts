/**
 * 斗兽棋 3D - 游戏用户界面系统
 */

import { CONFIG } from '../config';

export class GameUI {
  private container!: HTMLDivElement;
  private turnDisplay!: HTMLDivElement;
  private statusDisplay!: HTMLDivElement;
  private restartButton!: HTMLButtonElement;
  private modeButtons!: HTMLDivElement;
  private selectedInfo!: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'game-ui';
    
    this.createTurnDisplay();
    this.createStatusDisplay();
    this.createModeSelector();
    this.createRestartButton();
    this.createSelectedInfo();
  }

  private createTurnDisplay(): void {
    this.turnDisplay = document.createElement('div');
    this.turnDisplay.className = 'turn-display';
    this.turnDisplay.textContent = CONFIG.UI_TEXT.redTurn;
    this.container.appendChild(this.turnDisplay);
  }

  private createStatusDisplay(): void {
    this.statusDisplay = document.createElement('div');
    this.statusDisplay.className = 'status-display';
    this.statusDisplay.textContent = '';
    this.container.appendChild(this.statusDisplay);
  }

  private createModeSelector(): void {
    this.modeButtons = document.createElement('div');
    this.modeButtons.className = 'mode-selector';
    
    const pveBtn = document.createElement('button');
    pveBtn.className = 'mode-btn';
    pveBtn.textContent = CONFIG.UI_TEXT.pveBtn;
    pveBtn.addEventListener('click', () => this.selectMode('pve'));
    
    const pvpBtn = document.createElement('button');
    pvpBtn.className = 'mode-btn';
    pvpBtn.textContent = CONFIG.UI_TEXT.pvpBtn;
    pvpBtn.addEventListener('click', () => this.selectMode('pvp'));
    
    this.modeButtons.appendChild(pveBtn);
    this.modeButtons.appendChild(pvpBtn);
    this.container.appendChild(this.modeButtons);
  }

  private createRestartButton(): void {
    this.restartButton = document.createElement('button');
    this.restartButton.className = 'restart-btn';
    this.restartButton.textContent = CONFIG.UI_TEXT.restartBtn;
    this.restartButton.style.display = 'none';
    this.restartButton.addEventListener('click', () => this.onRestart());
    this.container.appendChild(this.restartButton);
  }

  private createSelectedInfo(): void {
    this.selectedInfo = document.createElement('div');
    this.selectedInfo.className = 'selected-info';
    this.selectedInfo.textContent = '选择一个棋子';
    this.container.appendChild(this.selectedInfo);
  }

  private selectMode(mode: string): void {
    console.log(`Mode selected: ${mode}`);
    // Emit event for game to handle
    this.container.dispatchEvent(new CustomEvent('mode-select', { detail: mode }));
  }

  private onRestart(): void {
    this.container.dispatchEvent(new CustomEvent('restart'));
  }

  /** Update turn display */
  updateTurn(turn: 'red' | 'blue'): void {
    if (turn === 'red') {
      this.turnDisplay.textContent = CONFIG.UI_TEXT.redTurn;
      this.turnDisplay.style.color = '#ff6b5e';
    } else {
      this.turnDisplay.textContent = CONFIG.UI_TEXT.blueTurn;
      this.turnDisplay.style.color = '#35c8f5';
    }
  }

  /** Show status message */
  showStatus(message: string): void {
    this.statusDisplay.textContent = message;
    // Auto-hide after 3 seconds
    setTimeout(() => {
      this.statusDisplay.textContent = '';
    }, 3000);
  }

  /** Show winner announcement */
  showWinner(winner: 'red' | 'blue' | 'draw'): void {
    if (winner === 'draw') {
      this.showStatus(CONFIG.UI_TEXT.drawTurn);
    } else {
      this.showStatus(`${winner}方获胜!`);
    }
    this.restartButton.style.display = 'block';
  }

  /** Update selected piece info */
  updateSelected(piece: { name: string; rank: number; color: string }): void {
    this.selectedInfo.textContent = `${piece.name} (${CONFIG.PIECES[piece.rank - 1].name}) - ${piece.color}`;
  }

  clearSelection(): void {
    this.selectedInfo.textContent = '选择一个棋子';
  }

  /** Get the UI container element */
  getContainer(): HTMLDivElement {
    return this.container;
  }
}

// Global CSS injection
const styleElement = document.createElement('style');
styleElement.textContent = `
  .game-ui {
    position: absolute;
    top: 20px;
    left: 20px;
    z-index: 100;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    color: white;
  }
  
  .turn-display {
    font-size: 24px;
    font-weight: bold;
    margin-bottom: 10px;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  }
  
  .status-display {
    font-size: 18px;
    margin-bottom: 10px;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
    min-height: 24px;
  }
  
  .mode-selector {
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
  }
  
  .mode-btn, .restart-btn {
    padding: 10px 20px;
    background: rgba(255, 255, 255, 0.1);
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    color: white;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.3s ease;
  }
  
  .mode-btn:hover, .restart-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.6);
  }
  
  .selected-info {
    font-size: 16px;
    margin-top: 10px;
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 6px;
    max-width: 200px;
  }
`;
document.head.appendChild(styleElement);
