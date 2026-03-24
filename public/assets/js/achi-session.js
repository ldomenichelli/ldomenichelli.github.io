import { opposite } from './achi-engine.js';

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
    return {
      game: nextSnapshots.pop() ?? currentGame,
      snapshots: nextSnapshots
    };
  }

  let game = nextSnapshots.pop() ?? currentGame;
  const aiSide = opposite(humanSide);

  while (game.turn === aiSide && nextSnapshots.length > 0) {
    game = nextSnapshots.pop() ?? game;
  }

  return { game, snapshots: nextSnapshots };
}
