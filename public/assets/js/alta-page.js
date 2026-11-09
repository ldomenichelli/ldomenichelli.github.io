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
  orientationGlyph
} from './alta-engine.js';
import { chooseAIMove } from './alta-ai.js';
import { MODE, computeUndoResult } from './alta-session.js';
import { setupTabs } from './game-tabs.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const variant = getBoardVariant();

const state = {
  game: createInitialState(),
  mode: MODE.HVC,
  humanSide: PLAYERS.BLUE,
  difficulty: 'Medium',
  selectedCell: null,
  focusedCell: 'e5',
  isThinking: false,
  snapshots: [],
  aiTimer: null,
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
const placementLabelEl = document.querySelector('[data-placement-label]');
const placementBarEl = document.querySelector('[data-placement-bar]');
const placementButtons = [...document.querySelectorAll('[data-place-orientation]')];
const cancelSelectionEl = document.querySelector('[data-cancel-selection]');

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
  return state.snapshots.length > 0 && (state.mode === MODE.HVH || state.game.history.some((entry) => entry.player === state.humanSide));
}

function isHumanTurn() {
  if (state.game.winner) return false;
  if (state.mode === MODE.HVH) return true;
  return state.game.turn === state.humanSide;
}

function cancelPendingAI() {
  window.clearTimeout(state.aiTimer);
  state.aiTimer = null;
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

function renderBoard() {
  const activeCell = boardEl.contains(document.activeElement) ? document.activeElement.dataset.cell : null;
  if (activeCell) state.focusedCell = activeCell;
  const winningCells = new Set(state.game.winningPath ?? []);
  const cellMoves = new Map();
  legalMovesForTurn().forEach((move) => {
    if (!cellMoves.has(move.cell)) cellMoves.set(move.cell, []);
    cellMoves.get(move.cell).push(move);
  });
  const interactive = isHumanTurn() && !state.isThinking;
  boardEl.classList.toggle('is-disabled', !interactive);
  boardEl.setAttribute('aria-disabled', String(!interactive));
  boardEl.innerHTML = variant.cells.map((cellData) => {
    const piece = state.game.board.get(cellData.key) ?? null;
    const moves = cellMoves.get(cellData.key) ?? [];
    const isSelected = state.selectedCell === cellData.key;
    const toggleMove = moves.find((move) => move.type === MOVE_TYPES.TOGGLE);
    const selectable = interactive && moves.length > 0;
    const restricted = !piece && variant.forbiddenCellsByPlayer[state.game.turn].includes(cellData.key);
    const classes = ['alta-cell', piece ? `is-owned-${piece.owner.toLowerCase()}` : 'is-empty',
      isSelected ? 'is-selected' : '', winningCells.has(cellData.key) ? 'is-winning' : '',
      state.game.lastMove?.cell === cellData.key ? 'is-last-move' : '',
      toggleMove && interactive ? 'is-togglable' : '', restricted ? 'is-restricted' : ''
    ].filter(Boolean).join(' ');
    const action = piece ? 'toggle' : 'select';
    const label = piece
      ? `${cellData.key}: ${playerLabel(piece.owner)} ${orientationGlyph(piece.orientation)} switch${toggleMove && interactive ? '. Activate to flip it' : ''}`
      : `${cellData.key}: ${restricted ? 'reserved for the other player’s goal' : `empty square${selectable ? '. Activate to choose a diagonal' : ''}`}`;
    const hit = `<button type="button" class="${piece ? 'alta-toggle-hit' : 'alta-empty-hit'}" data-action="${action}" data-cell="${cellData.key}" ${toggleMove ? `data-orientation="${toggleMove.orientation}"` : ''} tabindex="${cellData.key === state.focusedCell ? '0' : '-1'}" aria-disabled="${String(!selectable)}" aria-pressed="${String(isSelected)}" aria-label="${label}"></button>`;
    const mainSwitch = piece ? `<span class="alta-switch alta-switch-${piece.orientation === ORIENTATIONS.FW ? 'fw' : 'bw'} alta-owner-${piece.owner.toLowerCase()}" aria-hidden="true"></span>` : '';
    const preview = toggleMove && interactive ? `<span class="alta-switch alta-switch-preview alta-switch-${toggleMove.orientation === ORIENTATIONS.FW ? 'fw' : 'bw'}" aria-hidden="true"></span>` : '';
    const marker = isSelected ? '<span class="alta-cell-marker" aria-hidden="true">+</span>' : '';
    return `<div class="${classes}" style="grid-column:${cellData.gridCol};grid-row:${cellData.gridRow};">${hit}${preview}${mainSwitch}${marker}</div>`;
  }).join('');
  if (activeCell) boardEl.querySelector(`[data-cell="${activeCell}"]`)?.focus({ preventScroll: true });
}

function renderHistory() {
  historyEl.innerHTML = '';

  if (!state.game.history.length) {
    historyEl.innerHTML = '<li class="game-shell-history-empty">No moves yet. Your connection starts here.</li>';
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
    ? `${playerLabel(state.game.winner)} wins!`
    : state.isThinking ? 'Computer’s turn' : state.mode === MODE.HVC ? `Your turn · ${playerLabel(state.game.turn)}` : `${playerLabel(state.game.turn)} to move`;

  redCountEl.textContent = String(redCount);
  blueCountEl.textContent = String(blueCount);
  legalCountEl.textContent = String(legalMoves.length);
  historySummaryEl.textContent = `Moves played: ${state.game.history.length}`;
  turnSummaryEl.textContent = state.mode === MODE.HVC
    ? `You are ${playerLabel(state.humanSide)} · Computer is ${playerLabel(otherPlayer(state.humanSide))}`
    : 'Both sides are human-controlled.';
  sideStatusEl.textContent = state.mode === MODE.HVC
    ? `You play ${playerLabel(state.humanSide)}. ${state.humanSide === PLAYERS.BLUE ? 'Connect the top and bottom edges.' : 'Connect the left and right edges.'}`
    : 'Pass the board between turns.';

  if (state.game.winner) {
    const winnerText = `${playerLabel(state.game.winner)} wins by connecting both goal edges.`;
    statusEl.textContent = winnerText;
    bannerEl.textContent = winnerText;
    bannerEl.classList.remove('hidden');
    placementHelpEl.textContent = 'Winning path highlighted. Start a new game or undo to continue exploring.';
  } else if (state.isThinking) {
    statusEl.textContent = 'Computer is evaluating placements and toggles…';
    bannerEl.classList.add('hidden');
    placementHelpEl.textContent = 'A new connection is taking shape.';
  } else if (!isHumanTurn()) {
    statusEl.textContent = 'Computer turn: the board will unlock after the move resolves.';
    bannerEl.classList.add('hidden');
    placementHelpEl.textContent = 'The computer is choosing its next switch.';
  } else if (state.selectedCell) {
    statusEl.textContent = `Choose the diagonal for ${state.selectedCell}.`;
    bannerEl.classList.add('hidden');
    placementHelpEl.textContent = 'Choose Rising / or Falling \\ to place your switch.';
  } else {
    statusEl.textContent = `${playerLabel(state.game.turn)} to move. Place on an empty square or toggle one of your own switches.`;
    bannerEl.classList.add('hidden');
    placementHelpEl.textContent = 'Then pick a diagonal, or tap your own switch to flip it.';
  }

  thinkingEl.classList.toggle('hidden', !(state.mode === MODE.HVC && state.isThinking));
  sideEl.disabled = state.mode !== MODE.HVC;
  difficultyEl.disabled = state.mode !== MODE.HVC;
  undoEl.disabled = !canUndo();

  placementLabelEl.textContent = state.selectedCell ? `Place a switch at ${state.selectedCell}` : state.game.winner ? 'A connection completed' : state.isThinking ? 'Over to the computer' : 'Choose an empty square';
  placementBarEl.classList.toggle('has-selection', Boolean(state.selectedCell));
  placementBarEl.dataset.player = state.game.turn;
  cancelSelectionEl.disabled = !state.selectedCell;
  placementButtons.forEach((button) => {
    button.disabled = !state.selectedCell || !isHumanTurn() || state.isThinking;
    button.dataset.cell = state.selectedCell || '';
    button.dataset.action = 'place';
    button.dataset.orientation = button.dataset.placeOrientation;
  });
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
  if (!isMoveLegal(state.game, move, state.game.turn)) return;
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

  state.aiTimer = window.setTimeout(() => {
    if (requestId !== state.aiRequestId) return;
    let move = null;

    try {
      move = chooseAIMove(snapshot, aiSide, state.difficulty);
    } catch (error) {
      console.error('Alta AI move failed.', error);
    }

    if (requestId !== state.aiRequestId) return;

    state.isThinking = false;

    if (!move || !isMoveLegal(state.game, move, aiSide)) move = getLegalMoves(state.game, aiSide)[0];
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
  if (!actionEl || actionEl.getAttribute('aria-disabled') === 'true' || state.isThinking || !isHumanTurn()) return;

  const { action, cell, orientation } = actionEl.dataset;
  if (!cell) return;
  state.focusedCell = cell;

  if (action === 'select') {
    state.selectedCell = state.selectedCell === cell ? null : cell;
    render();
    if (state.selectedCell) placementBarEl.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion ? 'auto' : 'smooth' });
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

  placementButtons.forEach((button) => button.addEventListener('click', () => handleBoardAction(button)));
  cancelSelectionEl.addEventListener('click', () => { state.selectedCell = null; render(); });
  boardEl.addEventListener('focusin', (event) => {
    if (event.target.dataset.cell) state.focusedCell = event.target.dataset.cell;
  });
  const keyboardAction = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault(); state.selectedCell = null; render();
      boardEl.querySelector(`[data-cell="${state.focusedCell}"]`)?.focus({preventScroll:true});
      return;
    }
    if ((event.key === '/' || event.key === '\\') && state.selectedCell && isHumanTurn() && !state.isThinking) {
      event.preventDefault();
      executeMove({ type: MOVE_TYPES.PLACE, cell: state.selectedCell, orientation: event.key === '/' ? ORIENTATIONS.FW : ORIENTATIONS.BW });
      boardEl.querySelector(`[data-cell="${state.focusedCell}"]`)?.focus({preventScroll:true});
      return;
    }
    const deltas = {ArrowLeft:[0,-1], ArrowRight:[0,1], ArrowUp:[-1,0], ArrowDown:[1,0]};
    const delta = deltas[event.key];
    const current = event.target.closest('[data-cell]');
    if (!delta || !current || !boardEl.contains(current)) return;
    event.preventDefault();
    const cell = variant.cellMap[current.dataset.cell];
    const nextCell = variant.cells.find((candidate) => candidate.row === cell.row + delta[0] && candidate.col === cell.col + delta[1]);
    if (!nextCell) return;
    current.tabIndex = -1;
    const next = boardEl.querySelector(`[data-cell="${nextCell.key}"]`);
    next.tabIndex = 0;
    next.focus({preventScroll:true});
  };
  boardEl.addEventListener('keydown', keyboardAction);
  placementBarEl.addEventListener('keydown', keyboardAction);

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
