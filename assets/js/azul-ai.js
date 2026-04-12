import {
  PHASES,
  TILE_COLORS,
  getLegalMoves,
  applyMove,
  getWallColumnForColor,
  scoreWallPlacement,
  computeEndgameBonus,
  getSupplyCounts,
  serializeState
} from './azul-engine.js';

const WIN_SCORE = 100000;

const DIFFICULTY = Object.freeze({
  Easy: Object.freeze({
    candidateLimit: 6,
    depth: 1,
    noise: 10,
    previewChildren: false
  }),
  Medium: Object.freeze({
    candidateLimit: 8,
    depth: 2,
    noise: 3,
    previewChildren: true
  }),
  Hard: Object.freeze({
    candidateLimit: 12,
    depth: 3,
    noise: 0,
    previewChildren: true
  })
});

function pseudoNoiseFromMove(move) {
  const sourceIndex = move.draft.source.index ?? 17;
  const row = move.destination.row ?? 7;
  const colorWeight = move.draft.color.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
  const raw = (sourceIndex + 3) * 31 + (row + 5) * 17 + colorWeight;
  return ((raw % 19) - 9) / 9;
}

function countWallTiles(player) {
  return player.wall.reduce((total, row) => total + row.filter(Boolean).length, 0);
}

function rowCounts(player) {
  return player.wall.map((row) => row.filter(Boolean).length);
}

function columnCounts(player) {
  return Array.from({ length: 5 }, (_, column) =>
    player.wall.reduce((total, row) => total + (row[column] ? 1 : 0), 0)
  );
}

function colorCounts(player) {
  return TILE_COLORS.map((color) =>
    player.wall.reduce((total, _row, rowIndex) => total + (player.wall[rowIndex][getWallColumnForColor(rowIndex, color)] ? 1 : 0), 0)
  );
}

function estimatePatternLineValue(player, supplyCounts) {
  let value = 0;

  player.patternLines.forEach((line, row) => {
    if (!line.color || !line.filled) {
      value += 0.6;
      return;
    }

    const column = getWallColumnForColor(row, line.color);
    const shadowWall = player.wall.map((wallRow) => [...wallRow]);

    if (!shadowWall[row][column]) {
      shadowWall[row][column] = line.color;
    }

    const preview = scoreWallPlacement(shadowWall, row, column);
    const completionRatio = line.filled / line.capacity;
    const remaining = line.capacity - line.filled;
    const availability = supplyCounts[line.color] ?? 0;

    value += line.filled * (2.5 + row * 0.55);
    value += completionRatio * 7.5;
    value += remaining === 0 ? 10 + preview.points * 2.4 : preview.points * completionRatio * 1.6;
    value += Math.min(availability, 10) * 0.24;
    value -= remaining * 1.9;
  });

  return value;
}

function floorRisk(player) {
  return Math.abs(player.floor.slice(0, 7).reduce((total, _token, index) => total + [-1, -1, -2, -2, -2, -3, -3][index], 0));
}

function rowColumnBonusPressure(player) {
  const rows = rowCounts(player).reduce((total, count) => total + count * count * 1.7 + (count === 4 ? 6 : 0), 0);
  const columns = columnCounts(player).reduce((total, count) => total + count * count * 2 + (count === 4 ? 8 : 0), 0);
  const colors = colorCounts(player).reduce((total, count) => total + count * count * 1.5 + (count === 4 ? 7 : 0), 0);
  return rows + columns + colors;
}

function evaluatePlayerBoard(state, playerIndex, perspective) {
  const player = state.players[playerIndex];
  const supplyCounts = getSupplyCounts(state);
  const bonusPreview = computeEndgameBonus(player);
  let value = player.score * 22;

  value += countWallTiles(player) * 5.5;
  value += rowColumnBonusPressure(player);
  value += estimatePatternLineValue(player, supplyCounts);
  value += bonusPreview.rows * 3.5 + bonusPreview.columns * 7 + bonusPreview.colors * 8.5;
  value -= floorRisk(player) * 6.5;
  value += state.nextStartPlayer === playerIndex ? 3.2 : 0;
  value += player.patternLines.filter((line) => !line.color).length * 0.85;

  if (state.phase === PHASES.GAME_OVER && state.winnerIndices.includes(playerIndex)) {
    value += playerIndex === perspective && state.winnerIndices.length === 1 ? WIN_SCORE : WIN_SCORE * 0.55;
  }

  return value;
}

export function evaluateState(state, perspective) {
  if (state.phase === PHASES.GAME_OVER) {
    if (state.winnerIndices.includes(perspective)) {
      return state.winnerIndices.length === 1 ? WIN_SCORE + state.players[perspective].score : WIN_SCORE * 0.55 + state.players[perspective].score;
    }
    return -WIN_SCORE + state.players[perspective].score;
  }

  const ownValue = evaluatePlayerBoard(state, perspective, perspective);
  const opponentValue = state.players.reduce((total, _player, index) => {
    if (index === perspective) return total;
    return total + evaluatePlayerBoard(state, index, perspective);
  }, 0);

  const turnBias = state.turn === perspective ? 1.6 : -1.6;
  return ownValue - opponentValue + turnBias;
}

function candidateMoves(state, perspective, config) {
  const moves = getLegalMoves(state, state.turn);

  const ordered = moves.map((move) => {
    const child = config.previewChildren
      ? applyMove(state, move, { recordHistory: false })
      : null;
    const previewScore = child ? evaluateState(child, perspective) : 0;
    const tacticalScore =
      move.placedCount * 4.2 +
      (move.completesLine ? 8 + (move.destination.row ?? 0) * 1.3 : 0) -
      move.floorCount * 7.8 +
      (move.draft.takesStartMarker ? 2.6 : 0) +
      pseudoNoiseFromMove(move) * config.noise;

    return {
      move,
      score: tacticalScore + previewScore * 0.12
    };
  }).sort((left, right) => {
    if (state.turn === perspective) {
      return right.score - left.score;
    }
    return left.score - right.score;
  });

  if (ordered.length <= config.candidateLimit) {
    return ordered.map((entry) => entry.move);
  }

  return ordered.slice(0, config.candidateLimit).map((entry) => entry.move);
}

function searchDepth(state, difficulty) {
  const config = DIFFICULTY[difficulty] ?? DIFFICULTY.Medium;
  const moveOptions = getLegalMoves(state, state.turn).length;

  if (difficulty === 'Easy') {
    return moveOptions <= 5 ? 2 : config.depth;
  }

  if (difficulty === 'Medium') {
    return moveOptions <= 6 ? 3 : config.depth;
  }

  if (moveOptions <= 4) return 5;
  if (moveOptions <= 7) return 4;
  return config.depth;
}

function minimax(state, depth, alpha, beta, perspective, startRound, config, table) {
  const cacheKey = `${depth}|${perspective}|${serializeState(state)}`;
  if (table.has(cacheKey)) {
    return table.get(cacheKey);
  }

  if (state.phase === PHASES.GAME_OVER || depth <= 0 || state.round !== startRound) {
    const value = evaluateState(state, perspective);
    table.set(cacheKey, value);
    return value;
  }

  const moves = candidateMoves(state, perspective, config);
  if (!moves.length) {
    const value = evaluateState(state, perspective);
    table.set(cacheKey, value);
    return value;
  }

  const maximizing = state.turn === perspective;
  let best = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    const child = applyMove(state, move, { recordHistory: false });
    const value = minimax(child, depth - 1, alpha, beta, perspective, startRound, config, table);

    if (maximizing) {
      if (value > best) best = value;
      if (best > alpha) alpha = best;
    } else {
      if (value < best) best = value;
      if (best < beta) beta = best;
    }

    if (beta <= alpha) break;
  }

  table.set(cacheKey, best);
  return best;
}

export function chooseAIMove(state, playerIndex, difficulty = 'Medium') {
  const config = DIFFICULTY[difficulty] ?? DIFFICULTY.Medium;
  const legalMoves = getLegalMoves(state, playerIndex);

  if (!legalMoves.length) {
    return null;
  }

  if (difficulty === 'Easy') {
    return candidateMoves(state, playerIndex, config)[0] ?? legalMoves[0];
  }

  const depth = searchDepth(state, difficulty);
  const table = new Map();
  const startRound = state.round;
  let bestMove = legalMoves[0];
  let bestScore = -Infinity;

  for (const move of candidateMoves(state, playerIndex, config)) {
    const child = applyMove(state, move, { recordHistory: false });
    const score = minimax(child, depth - 1, -Infinity, Infinity, playerIndex, startRound, config, table);

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}
