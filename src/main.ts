import './styles.css';
import { AnimalChessGame } from './game/AnimalChessGame';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('Missing #game-canvas element.');
}

// Initialize game in PvE mode by default
const game = new AnimalChessGame(canvas, 'pve');

// Hot module replacement cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    // Cleanup handled by game.dispose()
  });
}

// Export for debugging
(window as any).animalChessGame = game;
