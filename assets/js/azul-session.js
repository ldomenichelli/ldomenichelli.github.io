import { MODE, computeUndoResult as computeSharedUndoResult } from './game-session.js';

export { MODE };

export function computeUndoResult({ mode, humanSide, snapshots, currentGame }) {
  return computeSharedUndoResult({
    mode,
    humanSide,
    snapshots,
    currentGame,
    getOpponentSide(side) {
      return side === 0 ? 1 : 0;
    }
  });
}
