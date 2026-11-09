import { opposite } from './achi-engine.js';
import { MODE, computeUndoResult as computeSharedUndoResult } from './game-session.js';

export { MODE };

export function computeUndoResult({ mode, humanSide, snapshots, currentGame }) {
  return computeSharedUndoResult({
    mode,
    humanSide,
    snapshots,
    currentGame,
    getOpponentSide: opposite
  });
}
