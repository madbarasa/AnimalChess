/**
 * 斗兽棋 3D - 霓虹战术主题 UI 系统
 */

import { CONFIG } from '../config';

export class GameUI {
  private container!: HTMLDivElement;
  private panel!: HTMLDivElement;
  private panelToggle!: HTMLButtonElement;
  private turnDisplay!: HTMLDivElement;
  private timerValue!: HTMLSpanElement;
  private redCount!: HTMLSpanElement;
  private blueCount!: HTMLSpanElement;
  private modeButtons!: HTMLDivElement;
  private pveBtn!: HTMLButtonElement;
  private pvpBtn!: HTMLButtonElement;
  private personalitySelect!: HTMLSelectElement;
  private restartButton!: HTMLButtonElement;
  private logContainer!: HTMLDivElement;
  private selectedInfo!: HTMLDivElement;
  private statusBanner!: HTMLDivElement;
  private victoryOverlay!: HTMLDivElement;
  private victoryTitle!: HTMLHeadingElement;
  private victoryMsg!: HTMLParagraphElement;
  private victoryRedCount!: HTMLSpanElement;
  private victoryBlueCount!: HTMLSpanElement;
  private victoryTime!: HTMLSpanElement;
  private restartWinBtn!: HTMLButtonElement;

  private statusTimeout: number | null = null;
  private collapsed = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'game-ui';
    
    this.createPanel();
    this.createSelectedInfo();
    this.createStatusBanner();
    this.createVictoryOverlay();
    this.injectStyles();

    // Mobile: default collapsed
    if (window.innerWidth < 960) {
      this.setCollapsed(true);
    }
  }

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'panel';

    // Toggle button for mobile
    this.panelToggle = document.createElement('button');
    this.panelToggle.className = 'panel-toggle';
    this.panelToggle.textContent = '☰';
    this.panelToggle.addEventListener('click', () => this.setCollapsed(!this.collapsed));
    this.panel.appendChild(this.panelToggle);

    // Status card
    const statusCard = document.createElement('div');
    statusCard.className = 'status-card';

    this.turnDisplay = document.createElement('div');
    this.turnDisplay.className = 'turn-display';
    this.turnDisplay.textContent = CONFIG.UI_TEXT.redTurn;
    statusCard.appendChild(this.turnDisplay);

    const timerRow = document.createElement('div');
    timerRow.className = 'timer-row';
    const timerLabel = document.createElement('span');
    timerLabel.className = 'timer-label';
    timerLabel.textContent = '用时';
    this.timerValue = document.createElement('span');
    this.timerValue.className = 'timer-value';
    this.timerValue.textContent = '00:00';
    timerRow.appendChild(timerLabel);
    timerRow.appendChild(this.timerValue);
    statusCard.appendChild(timerRow);

    const rosterRow = document.createElement('div');
    rosterRow.className = 'roster-row';
    const redBox = document.createElement('div');
    redBox.className = 'roster-box red';
    const redB = document.createElement('b');
    redB.textContent = '红';
    this.redCount = document.createElement('span');
    this.redCount.textContent = '8';
    redBox.appendChild(redB);
    redBox.appendChild(this.redCount);
    const rosterVs = document.createElement('div');
    rosterVs.className = 'roster-vs';
    rosterVs.textContent = 'VS';
    const blueBox = document.createElement('div');
    blueBox.className = 'roster-box blue';
    const blueB = document.createElement('b');
    blueB.textContent = '蓝';
    this.blueCount = document.createElement('span');
    this.blueCount.textContent = '8';
    blueBox.appendChild(blueB);
    blueBox.appendChild(this.blueCount);
    rosterRow.appendChild(redBox);
    rosterRow.appendChild(rosterVs);
    rosterRow.appendChild(blueBox);
    statusCard.appendChild(rosterRow);

    this.modeButtons = document.createElement('div');
    this.modeButtons.className = 'btn-group';
    this.pveBtn = document.createElement('button');
    this.pveBtn.textContent = CONFIG.UI_TEXT.pveBtn;
    this.pveBtn.addEventListener('click', () => this.selectMode('pve'));
    this.pvpBtn = document.createElement('button');
    this.pvpBtn.textContent = CONFIG.UI_TEXT.pvpBtn;
    this.pvpBtn.addEventListener('click', () => this.selectMode('pvp'));
    this.modeButtons.appendChild(this.pveBtn);
    this.modeButtons.appendChild(this.pvpBtn);
    statusCard.appendChild(this.modeButtons);

    const aiConfig = document.createElement('div');
    aiConfig.className = 'ai-config';
    const aiLabel = document.createElement('label');
    aiLabel.textContent = CONFIG.UI_TEXT.aiEngineLabel(CONFIG.VERSION);
    aiConfig.appendChild(aiLabel);
    this.personalitySelect = document.createElement('select');
    const aggressiveOpt = document.createElement('option');
    aggressiveOpt.value = 'aggressive';
    aggressiveOpt.textContent = CONFIG.UI_TEXT.aggressiveDesc;
    const conservativeOpt = document.createElement('option');
    conservativeOpt.value = 'conservative';
    conservativeOpt.textContent = CONFIG.UI_TEXT.conservativeDesc;
    this.personalitySelect.appendChild(aggressiveOpt);
    this.personalitySelect.appendChild(conservativeOpt);
    this.personalitySelect.addEventListener('change', () => this.onPersonalityChange());
    aiConfig.appendChild(this.personalitySelect);
    statusCard.appendChild(aiConfig);

    const kbdHint = document.createElement('div');
    kbdHint.className = 'kbd-hint';
    kbdHint.innerHTML = `
      <span><kbd>WASD</kbd> 移动预览</span>
      <span><kbd>Enter</kbd> 确认</span>
      <span><kbd>Esc</kbd> 取消</span>
    `;
    statusCard.appendChild(kbdHint);

    this.panel.appendChild(statusCard);

    this.restartButton = document.createElement('button');
    this.restartButton.className = 'restart-btn';
    this.restartButton.textContent = CONFIG.UI_TEXT.restartBtn;
    this.restartButton.addEventListener('click', () => this.onRestart());
    this.panel.appendChild(this.restartButton);

    this.logContainer = document.createElement('div');
    this.logContainer.className = 'log-container';
    this.panel.appendChild(this.logContainer);

    this.container.appendChild(this.panel);
  }

  private createSelectedInfo(): void {
    this.selectedInfo = document.createElement('div');
    this.selectedInfo.className = 'selected-info';
    this.selectedInfo.textContent = '选择一个棋子';
    this.container.appendChild(this.selectedInfo);
  }

  private createStatusBanner(): void {
    this.statusBanner = document.createElement('div');
    this.statusBanner.className = 'status-banner';
    this.statusBanner.style.display = 'none';
    this.container.appendChild(this.statusBanner);
  }

  private createVictoryOverlay(): void {
    this.victoryOverlay = document.createElement('div');
    this.victoryOverlay.className = 'victory-overlay hidden';

    const victoryCard = document.createElement('div');
    victoryCard.className = 'victory-card';

    this.victoryTitle = document.createElement('h1');
    this.victoryTitle.id = 'victory-title';
    this.victoryTitle.textContent = CONFIG.UI_TEXT.victoryTitle;
    victoryCard.appendChild(this.victoryTitle);

    this.victoryMsg = document.createElement('p');
    this.victoryMsg.id = 'victory-msg';
    this.victoryMsg.textContent = '--';
    victoryCard.appendChild(this.victoryMsg);

    const victoryStats = document.createElement('div');
    victoryStats.className = 'victory-stats';

    const rosterRow = document.createElement('div');
    rosterRow.className = 'roster-row';
    const redBox = document.createElement('div');
    redBox.className = 'roster-box red';
    const redB = document.createElement('b');
    redB.textContent = '红';
    this.victoryRedCount = document.createElement('span');
    this.victoryRedCount.textContent = '--';
    redBox.appendChild(redB);
    redBox.appendChild(this.victoryRedCount);
    const rosterVs = document.createElement('div');
    rosterVs.className = 'roster-vs';
    rosterVs.textContent = 'VS';
    const blueBox = document.createElement('div');
    blueBox.className = 'roster-box blue';
    const blueB = document.createElement('b');
    blueB.textContent = '蓝';
    this.victoryBlueCount = document.createElement('span');
    this.victoryBlueCount.textContent = '--';
    blueBox.appendChild(blueB);
    blueBox.appendChild(this.victoryBlueCount);
    rosterRow.appendChild(redBox);
    rosterRow.appendChild(rosterVs);
    rosterRow.appendChild(blueBox);
    victoryStats.appendChild(rosterRow);

    this.victoryTime = document.createElement('span');
    this.victoryTime.id = 'victory-time';
    this.victoryTime.textContent = '--';
    victoryStats.appendChild(this.victoryTime);

    victoryCard.appendChild(victoryStats);

    this.restartWinBtn = document.createElement('button');
    this.restartWinBtn.id = 'btn-restart-win';
    this.restartWinBtn.textContent = CONFIG.UI_TEXT.restartWinBtn;
    this.restartWinBtn.addEventListener('click', () => this.onRestart());
    victoryCard.appendChild(this.restartWinBtn);

    this.victoryOverlay.appendChild(victoryCard);
    this.container.appendChild(this.victoryOverlay);
  }

  private selectMode(mode: string): void {
    this.container.dispatchEvent(new CustomEvent('mode-select', { detail: mode }));
  }

  private onPersonalityChange(): void {
    this.container.dispatchEvent(new CustomEvent('personality-change', { detail: this.personalitySelect.value }));
  }

  private onRestart(): void {
    this.container.dispatchEvent(new CustomEvent('restart'));
  }

  private setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    if (collapsed) {
      this.panel.classList.add('collapsed');
      this.panelToggle.textContent = '☰';
    } else {
      this.panel.classList.remove('collapsed');
      this.panelToggle.textContent = '✕';
    }
  }

  /** Update turn display */
  updateTurn(turn: 'red' | 'blue', aiThinking = false): void {
    if (aiThinking) {
      this.turnDisplay.textContent = CONFIG.UI_TEXT.aiThinking;
      this.turnDisplay.style.color = '#5dff6a';
    } else if (turn === 'red') {
      this.turnDisplay.textContent = CONFIG.UI_TEXT.redTurn;
      this.turnDisplay.style.color = '#ff6b5e';
    } else {
      this.turnDisplay.textContent = CONFIG.UI_TEXT.blueTurn;
      this.turnDisplay.style.color = '#35c8f5';
    }
  }

  /** Update timer display */
  updateTimer(text: string): void {
    this.timerValue.textContent = text;
  }

  /** Update roster counts */
  updateRoster(red: number, blue: number): void {
    this.redCount.textContent = String(red);
    this.blueCount.textContent = String(blue);
  }

  /** Set active mode button */
  setActiveMode(mode: string): void {
    this.pveBtn.classList.toggle('active', mode === 'pve');
    this.pvpBtn.classList.toggle('active', mode === 'pvp');
  }

  /** Add log entry */
  log(msg: string, type: 'red' | 'blue' | 'system' = 'system'): void {
    const div = document.createElement('div');
    div.className = `log-entry log-${type}`;
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    div.textContent = `[${time}] ${msg}`;
    this.logContainer.prepend(div);
    while (this.logContainer.children.length > 200) {
      this.logContainer.removeChild(this.logContainer.lastChild!);
    }
  }

  /** Clear log */
  clearLog(): void {
    this.logContainer.innerHTML = '';
  }

  /** Show transient status banner */
  showStatus(message: string): void {
    if (this.statusTimeout) {
      clearTimeout(this.statusTimeout);
    }
    this.statusBanner.textContent = message;
    this.statusBanner.style.display = 'block';
    this.statusTimeout = window.setTimeout(() => {
      this.statusBanner.style.display = 'none';
      this.statusTimeout = null;
    }, 3000);
  }

  /** Show winner announcement */
  showWinner(winner: 'red' | 'blue', redCount: number, blueCount: number, time: string): void {
    const sideText = winner === 'red' ? CONFIG.UI_TEXT.redSide : CONFIG.UI_TEXT.blueSide;
    this.victoryTitle.textContent = CONFIG.UI_TEXT.victoryTitle;
    this.victoryTitle.style.background = winner === 'red'
      ? 'linear-gradient(to bottom, #ff8a7a, #ff4d4d)'
      : 'linear-gradient(to bottom, #7fdcff, #35c8f5)';
    this.victoryTitle.style.webkitBackgroundClip = 'text';
    this.victoryTitle.style.webkitTextFillColor = 'transparent';
    this.victoryMsg.textContent = CONFIG.UI_TEXT.victory(sideText);
    this.victoryMsg.style.color = winner === 'red' ? '#ff6b5e' : '#35c8f5';
    this.victoryRedCount.textContent = String(redCount);
    this.victoryBlueCount.textContent = String(blueCount);
    this.victoryTime.textContent = time;
    this.victoryOverlay.classList.remove('hidden');
  }

  /** Show draw announcement */
  showDraw(stuckSide: 'red' | 'blue', redCount: number, blueCount: number, time: string): void {
    const sideText = stuckSide === 'red' ? CONFIG.UI_TEXT.redSide : CONFIG.UI_TEXT.blueSide;
    this.victoryTitle.textContent = CONFIG.UI_TEXT.drawTitle;
    this.victoryTitle.style.background = 'linear-gradient(to bottom, #ffd166, #f77f00)';
    this.victoryTitle.style.webkitBackgroundClip = 'text';
    this.victoryTitle.style.webkitTextFillColor = 'transparent';
    this.victoryMsg.textContent = CONFIG.UI_TEXT.drawReason(sideText);
    this.victoryMsg.style.color = '#5dff6a';
    this.victoryRedCount.textContent = String(redCount);
    this.victoryBlueCount.textContent = String(blueCount);
    this.victoryTime.textContent = time;
    this.victoryOverlay.classList.remove('hidden');
  }

  /** Hide victory overlay */
  hideVictoryOverlay(): void {
    this.victoryOverlay.classList.add('hidden');
  }

  /** Update selected piece info */
  updateSelected(piece: { name: string; rank: number; color: string }): void {
    this.selectedInfo.textContent = `${piece.name} (${CONFIG.PIECES[piece.rank - 1].name}) - ${piece.color}`;
  }

  clearSelection(): void {
    this.selectedInfo.textContent = '选择一个棋子';
  }

  /** Trigger shake effect on canvas */
  shakeCanvas(): void {
    const canvas = document.querySelector('#game-canvas');
    if (canvas) {
      canvas.classList.add('shake');
      setTimeout(() => canvas.classList.remove('shake'), 400);
    }
  }

  /** Get the UI container element */
  getContainer(): HTMLDivElement {
    return this.container;
  }

  /** Get current personality */
  getPersonality(): string {
    return this.personalitySelect.value;
  }

  private injectStyles(): void {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      :root {
        --neon-red: #ff6b5e;
        --neon-blue: #35c8f5;
        --neon-green: #5dff6a;
        --neon-gold: #ffd166;
        --panel-bg: #141a30;
        --card-bg: #1d2542;
        --card-border: #35406e;
        --text-main: #d8e0ff;
        --text-dim: #8a95c4;
      }

      .game-ui {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 100;
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        color: var(--text-main);
      }

      .panel {
        position: absolute;
        top: 16px;
        right: 16px;
        bottom: 16px;
        width: 320px;
        display: flex;
        flex-direction: column;
        gap: 20px;
        pointer-events: auto;
        transition: transform 0.3s ease;
      }

      .panel.collapsed {
        transform: translateX(calc(100% + 16px));
      }

      .panel-toggle {
        position: absolute;
        top: 0;
        right: calc(100% + 8px);
        width: 44px;
        height: 44px;
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 10px;
        color: var(--text-main);
        font-size: 20px;
        cursor: pointer;
        display: none;
      }

      @media (max-width: 960px) {
        .panel-toggle {
          display: block;
        }
      }

      .status-card {
        background: var(--card-bg);
        border-radius: 20px;
        padding: 20px;
        border: 1px solid var(--card-border);
      }

      .turn-display {
        font-size: 30px;
        font-weight: 900;
        text-align: center;
        letter-spacing: 2px;
        margin-bottom: 14px;
        text-shadow: 0 0 18px rgba(53, 200, 245, 0.35);
      }

      .timer-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        margin-bottom: 14px;
      }

      .timer-label {
        font-size: 12px;
        letter-spacing: 3px;
        color: var(--text-dim);
      }

      .timer-value {
        font-size: 20px;
        font-weight: 700;
        font-family: 'Consolas', 'Monaco', monospace;
        font-variant-numeric: tabular-nums;
        color: var(--text-main);
        background: #10142a;
        border: 1px solid var(--card-border);
        border-radius: 8px;
        padding: 4px 14px;
        min-width: 78px;
        text-align: center;
      }

      .roster-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 16px;
      }

      .roster-box {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 10px;
        background: #10142a;
        border: 1px solid var(--card-border);
      }

      .roster-box b {
        font-size: 18px;
      }

      .roster-box span {
        font-size: 26px;
        font-weight: 900;
        font-family: 'Consolas', 'Monaco', monospace;
        font-variant-numeric: tabular-nums;
        min-width: 30px;
        text-align: center;
      }

      .roster-box.red { border-left: 3px solid var(--neon-red); }
      .roster-box.red b { color: var(--neon-red); }
      .roster-box.red span { color: var(--neon-red); }

      .roster-box.blue { border-right: 3px solid var(--neon-blue); }
      .roster-box.blue b { color: var(--neon-blue); }
      .roster-box.blue span { color: var(--neon-blue); }

      .roster-vs {
        font-size: 13px;
        font-weight: 900;
        color: var(--text-dim);
        letter-spacing: 2px;
      }

      .btn-group {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      button {
        padding: 14px;
        background: #242e54;
        border: 1px solid #3a4680;
        color: var(--text-main);
        border-radius: 10px;
        cursor: pointer;
        font-weight: bold;
        font-size: 15px;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }

      button:hover {
        background: #2e3a68;
        color: white;
        border-color: var(--neon-blue);
        box-shadow: 0 0 14px rgba(53, 200, 245, 0.25);
      }

      button:active {
        transform: scale(0.97);
      }

      button:focus-visible {
        outline: 2px solid var(--neon-blue);
        outline-offset: 2px;
      }

      button.active {
        border-color: var(--neon-green);
        color: var(--neon-green);
        background: rgba(93, 255, 106, 0.1);
      }

      .ai-config {
        margin-top: 15px;
      }

      .ai-config label {
        font-size: 12px;
        color: var(--text-dim);
        display: block;
        margin-bottom: 5px;
      }

      .ai-config select {
        width: 100%;
        padding: 8px;
        background: #242e54;
        border: 1px solid #3a4680;
        color: var(--text-main);
        border-radius: 8px;
        outline: none;
      }

      .kbd-hint {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: center;
        padding: 10px 14px;
        margin-top: 15px;
        background: #10142a;
        border: 1px solid var(--card-border);
        border-radius: 10px;
      }

      .kbd-hint span {
        font-size: 11px;
        color: var(--text-dim);
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .kbd-hint kbd {
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 10px;
        background: #242e54;
        border: 1px solid #3a4680;
        border-radius: 4px;
        padding: 1px 6px;
        color: var(--text-main);
      }

      .restart-btn {
        border-color: rgba(255, 107, 94, 0.45);
        color: #ff8a7a;
      }

      .log-container {
        flex: 1;
        background: #10142a;
        border-radius: 15px;
        padding: 15px;
        font-size: 13px;
        overflow-y: auto;
        border: 1px solid var(--card-border);
        font-family: 'Consolas', 'Monaco', monospace;
      }

      .log-entry {
        margin-bottom: 10px;
        border-left: 3px solid #3a4680;
        padding-left: 12px;
        color: var(--text-dim);
        animation: fadeIn 0.3s ease-out;
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateX(-10px); }
        to { opacity: 1; transform: translateX(0); }
      }

      .log-red { border-color: var(--neon-red); color: #ffb0a3; }
      .log-blue { border-color: var(--neon-blue); color: #a5e6ff; }
      .log-system { border-color: var(--neon-gold); color: var(--neon-gold); }

      .selected-info {
        position: absolute;
        top: 20px;
        left: 20px;
        font-size: 16px;
        padding: 8px 12px;
        background: rgba(0, 0, 0, 0.7);
        border: 1px solid var(--card-border);
        border-radius: 6px;
        max-width: 200px;
        pointer-events: auto;
      }

      .status-banner {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 24px;
        font-weight: bold;
        padding: 20px 40px;
        background: rgba(0, 0, 0, 0.85);
        border: 2px solid var(--neon-green);
        border-radius: 12px;
        text-shadow: 0 0 10px rgba(93, 255, 106, 0.5);
        pointer-events: none;
        animation: fadeIn 0.3s ease-out;
      }

      .victory-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(10, 14, 32, 0.85);
        backdrop-filter: blur(15px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.5s ease;
      }

      .victory-overlay:not(.hidden) {
        opacity: 1;
        pointer-events: auto;
      }

      .victory-card {
        background: linear-gradient(135deg, #1d2542 0%, #10142a 100%);
        padding: 60px 80px;
        border-radius: 40px;
        border: 2px solid var(--neon-blue);
        box-shadow: 0 0 80px rgba(53, 200, 245, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06);
        text-align: center;
        transform: scale(0.8);
        transition: transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }

      .victory-overlay:not(.hidden) .victory-card {
        transform: scale(1);
      }

      #victory-title {
        font-size: 72px;
        font-weight: 900;
        margin: 0;
        background: linear-gradient(to bottom, #ffffff, #9db1ff);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        text-shadow: 0 0 30px rgba(157, 177, 255, 0.5);
        letter-spacing: 10px;
      }

      #victory-msg {
        font-size: 24px;
        color: var(--neon-blue);
        margin: 20px 0 40px;
        letter-spacing: 2px;
        text-transform: uppercase;
      }

      .victory-stats {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        margin-bottom: 30px;
        font-size: 18px;
        color: var(--text-dim);
      }

      #victory-time {
        font-family: 'Consolas', 'Monaco', monospace;
        font-variant-numeric: tabular-nums;
        color: var(--text-main);
        background: #10142a;
        border: 1px solid var(--card-border);
        border-radius: 8px;
        padding: 6px 16px;
        min-width: 90px;
        text-align: center;
      }

      #btn-restart-win {
        background: var(--neon-blue);
        color: #081420;
        border: none;
        padding: 18px 50px;
        font-size: 20px;
        border-radius: 100px;
        box-shadow: 0 0 30px rgba(53, 200, 245, 0.55);
        cursor: pointer;
        font-weight: bold;
        transition: all 0.3s ease;
      }

      #btn-restart-win:hover {
        transform: scale(1.05);
        box-shadow: 0 0 50px rgba(53, 200, 245, 0.8);
      }

      #btn-restart-win:active {
        transform: scale(0.98);
      }

      @keyframes shake {
        0%, 100% { transform: translateX(0) rotate(0); }
        25% { transform: translateX(-8px) rotate(-1deg); }
        75% { transform: translateX(8px) rotate(1deg); }
      }

      #game-canvas.shake {
        animation: shake 0.2s ease-in-out 2;
      }

      @media (max-width: 960px) {
        .panel {
          top: auto;
          right: 16px;
          bottom: 16px;
          left: 16px;
          width: auto;
          max-height: 45vh;
          overflow-y: auto;
        }

        .panel.collapsed {
          transform: translateY(calc(100% + 16px));
        }

        .panel-toggle {
          top: auto;
          bottom: calc(100% + 8px);
          right: 0;
        }
      }

      @media (max-width: 600px) {
        .panel {
          max-height: 40vh;
        }

        .btn-group {
          grid-template-columns: 1fr;
        }

        .roster-row {
          flex-direction: column;
          align-items: stretch;
        }

        .roster-vs {
          display: none;
        }

        .roster-box.red {
          border-left: 3px solid var(--neon-red);
          border-right: 1px solid var(--card-border);
        }

        .roster-box.blue {
          border-left: 3px solid var(--neon-blue);
        }

        .turn-display {
          font-size: 24px;
        }

        .timer-value {
          font-size: 16px;
          min-width: 64px;
        }

        .victory-card {
          padding: 40px 24px;
        }

        #victory-title {
          font-size: 48px;
          letter-spacing: 6px;
        }

        button {
          min-height: 44px;
        }
      }
    `;
    document.head.appendChild(styleElement);
  }
}
