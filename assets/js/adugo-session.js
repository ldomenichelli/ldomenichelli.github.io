import { SIDES } from './adugo-engine.js';

export const MODE = Object.freeze({
  HVH: 'HUMAN_VS_HUMAN',
  HVC: 'HUMAN_VS_COMPUTER'
});

export function computeUndoResult({ mode, humanSide, snapshots, currentGame }) {
  if (!snapshots.length) {
    return { game: currentGame, snapshots };
  }

  const nextSnapshots = [...snapshots];

  if (mode === MODE.HVH) {
    const game = nextSnapshots.pop() ?? currentGame;
    return { game, snapshots: nextSnapshots };
  }

  // In HVC, try to revert to the last human-to-move state.
  let game = nextSnapshots.pop() ?? currentGame;
  const aiSide = humanSide === SIDES.JAGUAR ? SIDES.DOGS : SIDES.JAGUAR;

  while (game.turn === aiSide && nextSnapshots.length > 0) {
    game = nextSnapshots.pop() ?? game;
  }

  return { game, snapshots: nextSnapshots };
}
