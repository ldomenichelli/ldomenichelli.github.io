import {
  PLAYERS,
  ORIENTATIONS,
  MOVE_TYPES,
  createInitialState,
  cloneState,
  getBoardVariant,
  getLegalMoves,
  isMoveLegal,
  applyMove,
  countSwitches,
  otherPlayer,
  nextOrientation,
  orientationGlyph
} from './alta-engine.js';
import { chooseAIMove } from './alta-ai.js';
import { MODE, computeUndoResult } from './alta-session.js';
import { setupTabs } from './game-tabs.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const variant = getBoardVariant();

const state = {
  game: createInitialState(),
  mode: MODE.HVH,
  humanSide: PLAYERS.BLUE,
  difficulty: 'Medium',
  selectedCell: null,
  isThinking: false,
  snapshots: [],
  aiRequestId: 0
};

const boardEl = document.querySelector('[data-alta-board]');
const boardStageEl = document.querySelector('[data-alta-stage]');
const turnEl = document.querySelector('[data-turn]');
const statusEl = document.querySelector('[data-status]');
const sideStatusEl = document.querySelector('[data-side-status]');
const bannerEl = document.querySelector('[data-banner]');
const thinkingEl = document.querySelector('[data-thinking]');
const historyEl = document.querySelector('[data-history]');
const modeEl = document.querySelector('[data-mode]');
const sideEl = document.querySelector('[data-side]');
const difficultyEl = document.querySelector('[data-difficulty]');
const undoEl = document.querySelector('[data-undo]');
const newGameEl = document.querySelector('[data-new-game]');
const redCountEl = document.querySelector('[data-red-count]');
const blueCountEl = document.querySelector('[data-blue-count]');
const legalCountEl = document.querySelector('[data-legal-count]');
const historySummaryEl = document.querySelector('[data-history-summary]');
const turnSummaryEl = document.querySelector('[data-turn-summary]');
const placementHelpEl = document.querySelector('[data-placement-help]');

function playerLabel(player) {
  return player === PLAYERS.RED ? 'Red' : 'Blue';
}

function roleLabel(player) {
  if (state.mode === MODE.HVC && player !== state.humanSide) {
    return 'Computer';
  }
  return playerLabel(player);
}

function canUndo() {
  return state.snapshots.length > 0;
}

function isHumanTurn() {
  if (state.game.winner) return false;
  if (state.mode === MODE.HVH) return true;
  return state.game.turn === state.humanSide;
}

function cancelPendingAI() {
  state.aiRequestId += 1;
  state.isThinking = false;
}

function pushSnapshot() {
  state.snapshots.push(cloneState(state.game));
  if (state.snapshots.length > 240) state.snapshots.shift();
}

function legalMovesForTurn() {
  return getLegalMoves(state.game, state.game.turn);
}

function moveBelongsToCell(move, cell) {
  return move.cell === cell;
}

function renderBoard() {
  const winningCells = new Set(state.game.winningPath ?? []);
  const legalMoves = legalMovesForTurn();
  const cellMoves = new Map();

  legalMoves.forEach((move) => {
    if (!cellMoves.has(move.cell)) cellMoves.set(move.cell, []);
    cellMoves.get(move.cell).push(move);
  });

  boardEl.classList.toggle('is-disabled', !isHumanTurn() || state.isThinking || Boolean(state.game.winner));

  boardEl.innerHTML = variant.cells.map((cellData) => {
    const piece = state.game.board.get(cellData.key) ?? null;
    const moves = cellMoves.get(cellData.key) ?? [];
    const isSelected = state.selectedCell === cellData.key;
    const isLastMove = state.game.lastMove?.cell === cellData.key;
    const classes = [
      'alta-cell',
      piece ? `is-owned-${piece.owner.toLowerCase()}` : 'is-empty',
      isSelected ? 'is-selected' : '',
      winningCells.has(cellData.key) ? 'is-winning' : '',
      isLastMove ? 'is-last-move' : '',
      piece && isHumanTurn() && piece.owner === state.game.turn && !state.isThinking ? 'is-togglable' : ''
    ].filter(Boolean).join(' ');

    const style = `grid-column:${cellData.gridCol};grid-row:${cellData.gridRow};`;

    if (piece) {
      const toggleMove = moves.find((move) => move.type === MOVE_TYPES.TOGGLE);
      const mainSwitch = `
        <span class="alta-switch alta-switch-${piece.orientation === ORIENTATIONS.FW ? 'fw' : 'bw'} alta-owner-${piece.owner.toLowerCase()}" aria-hidden="true"></span>
      `;
      const preview = toggleMove ? `
        <span class="alta-switch alta-switch-preview alta-switch-${toggleMove.orientation === ORIENTATIONS.FW ? 'fw' : 'bw'}" aria-hidden="true"></span>
      ` : '';
      const action = toggleMove
        ? `<button type="button" class="alta-toggle-hit" data-action="toggle" data-cell="${cellData.key}" data-orientation="${toggleMove.orientation}" aria-label="Toggle ${playerLabel(piece.owner)} switch at ${cellData.key} to ${orientationGlyph(toggleMove.orientation)}"></button>`
        : '<div class="alta-cell-static" aria-hidden="true"></div>';
      return `<div class="${classes}" style="${style}">${action}${preview}${mainSwitch}</div>`;
    }

    const selectable = moves.length > 0 && isHumanTurn() && !state.isThinking && !state.game.winner;
    const baseAction = selectable
      ? `<button type="button" class="alta-empty-hit" data-action="select" data-cell="${cellData.key}" aria-expanded="${String(isSelected)}" aria-label="Choose a switch orientation for ${cellData.key}"></button>`
      : '<div class="alta-cell-static" aria-hidden="true"></div>';

    const choices = selectable && isSelected
      ? `
        <button type="button" class="alta-choice alta-choice-fw alta-choice--${state.game.turn.toLowerCase()}" data-action="place" data-cell="${cellData.key}" data-orientation="${ORIENTATIONS.FW}" aria-label="Place ${playerLabel(state.game.turn)} ${orientationGlyph(ORIENTATIONS.FW)} switch at ${cellData.key}"></button>
        <button type="button" class="alta-choice alta-choice-bw alta-choice--${state.game.turn.toLowerCase()}" data-action="place" data-cell="${cellData.key}" data-orientation="${ORIENTATIONS.BW}" aria-label="Place ${playerLabel(state.game.turn)} ${orientationGlyph(ORIENTATIONS.BW)} switch at ${cellData.key}"></button>
      `
      : '';

    return `<div class="${classes}" style="${style}">${baseAction}${choices}</div>`;
  }).join('');
}

function renderHistory() {
  historyEl.innerHTML = '';

  if (!state.game.history.length) {
    historyEl.innerHTML = '<li class="game-shell-history-empty">No moves yet.</li>';
    return;
  }

  state.game.history.slice().forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'alta-history-item';
    li.dataset.player = entry.player;
    li.textContent = `${entry.moveNumber}. ${roleLabel(entry.player)}: ${entry.notation}`;
    historyEl.appendChild(li);
  });

  historyEl.scrollTop = historyEl.scrollHeight;
}

function renderStatus() {
  const legalMoves = legalMovesForTurn();
  const redCount = countSwitches(state.game, PLAYERS.RED);
  const blueCount = countSwitches(state.game, PLAYERS.BLUE);

  turnEl.textContent = state.game.winner
    ? `Winner: ${playerLabel(state.game.winner)}`
    : `Turn: ${roleLabel(state.game.turn)}`;

  redCountEl.textContent = String(redCount);
  blueCountEl.textContent = String(blueCount);
  legalCountEl.textContent = String(legalMoves.length);
  historySummaryEl.textContent = `Moves played: ${state.game.history.length}`;
  turnSummaryEl.textContent = state.mode === MODE.HVC
    ? `You are ${playerLabel(state.humanSide)} · Computer is ${playerLabel(otherPlayer(state.humanSide))}`
    : 'Both sides are human-controlled.';
  sideStatusEl.textContent = state.mode === MODE.HVC
    ? `${playerLabel(state.humanSide)} keeps manual control. ${playerLabel(otherPlayer(state.humanSide))} is computer-controlled.`
    : 'Both players can place or toggle locally on the same board.';

  if (state.game.winner) {
    const winnerText = `${playerLabel(state.game.winner)} win by connecting their goal nodes.`;
    statusEl.textContent = winnerText;
    bannerEl.textContent = winnerText;
    bannerEl.classList.remove('hidden');
    placementHelpEl.textContent = 'Winning path highlighted. Start a new game or undo to continue exploring.';
  } else if (state.isThinking) {
    statusEl.textContent = 'Computer is evaluating placements and toggles…';
    bannerEl.classList.add('hidden');
    placementHelpEl.textContent = 'Input is temporarily locked while the computer is thinking.';
  } else if (!isHumanTurn()) {
    statusEl.textContent = 'Computer turn: the board will unlock after the move resolves.';
    bannerEl.classList.add('hidden');
    placementHelpEl.textContent = 'The AI can either place a new switch or toggle one of its own.';
  } else if (state.selectedCell) {
    statusEl.textContent = `Choose the diagonal for ${state.selectedCell}.`;
    bannerEl.classList.add('hidden');
    placementHelpEl.textContent = 'Click one of the two diagonals in the selected square, or click the square again to cancel.';
  } else {
    statusEl.textContent = `${playerLabel(state.game.turn)} to move. Place on an empty square or toggle one of your own switches.`;
    bannerEl.classList.add('hidden');
    placementHelpEl.textContent = 'Click an empty square to choose between / and \\, or click one of your own switches to flip it.';
  }

  thinkingEl.classList.toggle('hidden', !(state.mode === MODE.HVC && state.isThinking));
  sideEl.disabled = state.mode !== MODE.HVC || state.isThinking;
  difficultyEl.disabled = state.mode !== MODE.HVC || state.isThinking;
  undoEl.disabled = !canUndo();

  boardStageEl.dataset.turn = state.game.turn;
  boardStageEl.dataset.winner = state.game.winner ?? '';
}

function render() {
  modeEl.value = state.mode;
  sideEl.value = state.humanSide;
  difficultyEl.value = state.difficulty;
  renderBoard();
  renderStatus();
  renderHistory();
}

function executeMove(move, { triggerAI = true } = {}) {
  pushSnapshot();
  state.game = applyMove(state.game, move);
  state.selectedCell = null;
  render();

  if (triggerAI) {
    maybeAIMove();
  }
}

function maybeAIMove() {
  if (state.mode !== MODE.HVC || state.game.winner) return;

  const aiSide = otherPlayer(state.humanSide);
  if (state.game.turn !== aiSide) return;

  state.selectedCell = null;
  state.isThinking = true;
  const requestId = state.aiRequestId + 1;
  state.aiRequestId = requestId;
  render();

  const snapshot = cloneState(state.game);

  window.setTimeout(() => {
    let move = null;

    try {
      move = chooseAIMove(snapshot, aiSide, state.difficulty);
    } catch (error) {
      console.error('Alta AI move failed.', error);
    }

    if (requestId !== state.aiRequestId) return;

    state.isThinking = false;

    if (move && isMoveLegal(state.game, move, aiSide)) {
      executeMove(move, { triggerAI: false });
      return;
    }

    render();
  }, prefersReducedMotion ? 70 : 220);
}

function resetGame() {
  cancelPendingAI();
  state.game = createInitialState();
  state.selectedCell = null;
  state.snapshots = [];
  render();
  maybeAIMove();
}

function undoMove() {
  if (!canUndo()) return;

  cancelPendingAI();
  const result = computeUndoResult({
    mode: state.mode,
    humanSide: state.humanSide,
    snapshots: state.snapshots,
    currentGame: state.game
  });

  state.game = result.game;
  state.snapshots = result.snapshots;
  state.selectedCell = null;
  render();
}

function handleBoardAction(actionEl) {
  if (!actionEl || state.isThinking || !isHumanTurn()) return;

  const { action, cell, orientation } = actionEl.dataset;
  if (!cell) return;

  if (action === 'select') {
    state.selectedCell = state.selectedCell === cell ? null : cell;
    render();
    return;
  }

  if (action === 'place') {
    executeMove({
      type: MOVE_TYPES.PLACE,
      cell,
      orientation
    });
    return;
  }

  if (action === 'toggle') {
    executeMove({
      type: MOVE_TYPES.TOGGLE,
      cell,
      orientation
    });
  }
}

function setupHelpTabs() {
  setupTabs({
    buttonSelector: '[data-tab-button]',
    panelSelector: '[data-tab-panel]',
    buttonKey: 'tabButton',
    panelKey: 'tabPanel',
    setButtonState(button, active) {
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    },
    setPanelState(panel, active) {
      panel.classList.toggle('hidden', !active);
    }
  });
}

function wireEvents() {
  boardEl.addEventListener('click', (event) => {
    const actionEl = event.target.closest('[data-action]');
    handleBoardAction(actionEl);
  });

  modeEl.addEventListener('change', () => {
    state.mode = modeEl.value;
    resetGame();
  });

  sideEl.addEventListener('change', () => {
    state.humanSide = sideEl.value;
    resetGame();
  });

  difficultyEl.addEventListener('change', () => {
    state.difficulty = difficultyEl.value;
    render();
  });

  undoEl.addEventListener('click', undoMove);
  newGameEl.addEventListener('click', resetGame);
}

function init() {
  boardEl.style.gridTemplateColumns = `repeat(${variant.gridSize}, minmax(0, 1fr))`;
  boardEl.style.gridTemplateRows = `repeat(${variant.gridSize}, minmax(0, 1fr))`;
  wireEvents();
  setupHelpTabs();
  render();
}

init();
