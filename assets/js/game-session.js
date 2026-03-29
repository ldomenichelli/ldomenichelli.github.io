export const MODE = Object.freeze({
  HVH: 'HUMAN_VS_HUMAN',
  HVC: 'HUMAN_VS_COMPUTER'
});

export function computeUndoResult({
  mode,
  humanSide,
  snapshots,
  currentGame,
  getOpponentSide
}) {
  if (!snapshots.length) {
    return { game: currentGame, snapshots };
  }

  const nextSnapshots = [...snapshots];

  if (mode === MODE.HVH) {
    const game = nextSnapshots.pop() ?? currentGame;
    return { game, snapshots: nextSnapshots };
  }

  const opponentSide = typeof getOpponentSide === 'function'
    ? getOpponentSide(humanSide)
    : null;

  let game = nextSnapshots.pop() ?? currentGame;

  while (opponentSide != null && game.turn === opponentSide && nextSnapshots.length > 0) {
    game = nextSnapshots.pop() ?? game;
  }

  return { game, snapshots: nextSnapshots };
}
