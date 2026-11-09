import { SIDES } from './adugo-engine.js';
import { MODE, computeUndoResult as computeSharedUndoResult } from './game-session.js';

export { MODE };

export function computeUndoResult({ mode, humanSide, snapshots, currentGame }) {
  return computeSharedUndoResult({
    mode,
    humanSide,
    snapshots,
    currentGame,
    getOpponentSide(side) {
      return side === SIDES.JAGUAR ? SIDES.DOGS : SIDES.JAGUAR;
    }
  });
}
