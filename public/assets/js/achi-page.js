import {
  PLAYERS,
  PHASES,
  GAME_CONFIG,
  WINNING_LINES,
  ADJACENCY,
  createInitialState,
  cloneState,
  getPhase,
  pieceCount,
  totalPiecesPlaced,
  applyMove,
  getLegalMoves,
  isMoveLegal,
  indexToCoord,
  coordLabel,
  opposite
} from './achi-engine.js';
import { thinkAndPickAIMove } from './achi-ai.js';
import { MODE, computeUndoResult } from './achi-session.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  game: createInitialState(),
  selected: null,
  mode: MODE.HVH,
  humanSide: PLAYERS.WHITE,
  difficulty: 'Medium',
  isThinking: false,
  snapshots: [],
  aiRequestId: 0
};

const BOARD_LAYOUT = Object.freeze({
  insetPct: 16,
  spanPct: 68
});

const boardEl = document.querySelector('[data-achi-board]');
const shellEl = document.querySelector('.achi-shell');
const phaseEl = document.querySelector('[data-phase]');
const turnEl = document.querySelector('[data-turn]');
const whiteCountEl = document.querySelector('[data-white-count]');
const blackCountEl = document.querySelector('[data-black-count]');
const placementProgressEl = document.querySelector('[data-placement-progress]');
const placementRemainingEl = document.querySelector('[data-placement-remaining]');
const objectiveEl = document.querySelector('[data-objective]');
const statusEl = document.querySelector('[data-status]');
const thinkingEl = document.querySelector('[data-thinking]');
const historyEl = document.querySelector('[data-history]');
const bannerEl = document.querySelector('[data-win-banner]');
const modeEl = document.querySelector('[data-mode]');
const sideEl = document.querySelector('[data-side]');
const difficultyEl = document.querySelector('[data-difficulty]');
const newGameEl = document.querySelector('[data-new-game]');
const undoEl = document.querySelector('[data-undo]');

let winLineEl = null;

function boardPercentAt(coord) {
  return BOARD_LAYOUT.insetPct + (coord / (GAME_CONFIG.size - 1)) * BOARD_LAYOUT.spanPct;
}

function prettyPlayer(player) {
  return player === PLAYERS.WHITE ? 'White' : 'Black';
}

function prettyPhase(phase) {
  return phase === PHASES.PLACEMENT ? 'Placement' : 'Movement';
}

function isHumanTurn() {
  if (state.game.winner) return false;
  if (state.mode === MODE.HVH) return true;
  return state.game.turn === state.humanSide;
}

function canUndo() {
  return state.snapshots.length > 0;
}

function cancelPendingAI() {
  state.aiRequestId += 1;
  state.isThinking = false;
}

function pushSnapshot() {
  state.snapshots.push(cloneState(state.game));
  if (state.snapshots.length > 200) state.snapshots.shift();
}

function buildBoard() {
  boardEl.innerHTML = '';

  for (let index = 0; index < GAME_CONFIG.size * GAME_CONFIG.size; index += 1) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'achi-node';
    node.dataset.index = String(index);
    node.setAttribute('aria-label', `Intersection ${coordLabel(index)}`);

    const { x, y } = indexToCoord(index);
    node.style.left = `${boardPercentAt(x)}%`;
    node.style.top = `${boardPercentAt(y)}%`;
    boardEl.appendChild(node);
  }

  const lineLayer = document.createElement('div');
  lineLayer.className = 'achi-lines';
  boardEl.appendChild(lineLayer);

  const drawn = new Set();
  for (let index = 0; index < GAME_CONFIG.size * GAME_CONFIG.size; index += 1) {
    const from = indexToCoord(index);
    for (const neighbor of ADJACENCY.get(index)) {
      const key = [index, neighbor].sort((a, b) => a - b).join('-');
      if (drawn.has(key)) continue;
      drawn.add(key);

      const to = indexToCoord(neighbor);
      const x1 = boardPercentAt(from.x);
      const y1 = boardPercentAt(from.y);
      const x2 = boardPercentAt(to.x);
      const y2 = boardPercentAt(to.y);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      const line = document.createElement('span');
      line.className = 'achi-line';
      line.style.left = `${x1}%`;
      line.style.top = `${y1}%`;
      line.style.width = `${length}%`;
      line.style.transform = `rotate(${angle}deg)`;
      lineLayer.appendChild(line);
    }
  }

  winLineEl = document.createElement('div');
  winLineEl.className = 'achi-win-line';
  winLineEl.hidden = true;
  boardEl.appendChild(winLineEl);
}

function updateWinLine() {
  if (!winLineEl) return;
  if (!state.game.winner || !state.game.winningLine) {
    winLineEl.hidden = true;
    return;
  }

  const [startIndex, , endIndex] = state.game.winningLine;
  const start = indexToCoord(startIndex);
  const end = indexToCoord(endIndex);
  const x1 = boardPercentAt(start.x);
  const y1 = boardPercentAt(start.y);
  const x2 = boardPercentAt(end.x);
  const y2 = boardPercentAt(end.y);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  winLineEl.hidden = false;
  winLineEl.style.left = `${x1}%`;
  winLineEl.style.top = `${y1}%`;
  winLineEl.style.width = `${length}%`;
  winLineEl.style.transform = `rotate(${angle}deg)`;
}

function currentObjectiveText() {
  return 'First player to align three of their own pieces horizontally, vertically, or diagonally wins. Movement begins only after all 8 pieces have been placed.';
}

function renderHistory() {
  historyEl.innerHTML = '';
  if (!state.game.history.length) {
    historyEl.innerHTML = '<li class="achi-empty-history">No moves yet.</li>';
    return;
  }

  state.game.history.forEach((entry, index) => {
    const li = document.createElement('li');
    li.className = 'achi-history-item';
    const actor = prettyPlayer(entry.actor);
    if (entry.move.kind === 'place') {
      li.textContent = `${index + 1}. ${actor} place ${coordLabel(entry.move.to)}`;
    } else {
      li.textContent = `${index + 1}. ${actor} ${coordLabel(entry.move.from)}→${coordLabel(entry.move.to)}`;
    }
    historyEl.appendChild(li);
  });

  historyEl.scrollTop = historyEl.scrollHeight;
}

function renderBoardState() {
  const phase = getPhase(state.game);
  const nodes = boardEl.querySelectorAll('.achi-node');
  const legalMoves = getLegalMoves(state.game, state.game.turn);
  const legalTargets = phase === PHASES.PLACEMENT
    ? new Set(legalMoves.map((move) => move.to))
    : new Set(legalMoves.filter((move) => move.from === state.selected).map((move) => move.to));
  const selectableSources = phase === PHASES.MOVEMENT
    ? new Set(legalMoves.map((move) => move.from))
    : new Set();

  nodes.forEach((node) => {
    const index = Number(node.dataset.index);
    const occupant = state.game.board[index];

    node.className = 'achi-node';
    node.innerHTML = '';

    if (occupant) {
      node.classList.add(occupant === PLAYERS.WHITE ? 'is-white' : 'is-black');
      node.innerHTML = `<span class="piece ${occupant === PLAYERS.WHITE ? 'white' : 'black'}" aria-hidden="true"></span>`;
    }

    if (state.selected === index) {
      node.classList.add('is-selected');
    }

    if (state.game.winningLine?.includes(index)) {
      node.classList.add('is-winning');
    }

    if (!state.game.winner && phase === PHASES.PLACEMENT && legalTargets.has(index)) {
      node.classList.add('is-legal');
    }

    if (!state.game.winner && phase === PHASES.MOVEMENT && state.selected == null && selectableSources.has(index)) {
      node.classList.add('is-source');
    }

    if (!state.game.winner && phase === PHASES.MOVEMENT && state.selected != null && legalTargets.has(index)) {
      node.classList.add('is-legal');
    }
  });

  updateWinLine();
}

function updateStatus() {
  const phase = getPhase(state.game);
  const whiteCount = pieceCount(state.game, PLAYERS.WHITE);
  const blackCount = pieceCount(state.game, PLAYERS.BLACK);
  const placed = totalPiecesPlaced(state.game);
  const placementPct = (placed / (GAME_CONFIG.piecesPerPlayer * 2)) * 100;

  phaseEl.textContent = prettyPhase(phase);
  turnEl.textContent = prettyPlayer(state.game.turn);
  whiteCountEl.textContent = `${whiteCount} / ${GAME_CONFIG.piecesPerPlayer}`;
  blackCountEl.textContent = `${blackCount} / ${GAME_CONFIG.piecesPerPlayer}`;
  placementProgressEl.style.width = `${placementPct}%`;
  placementRemainingEl.textContent = phase === PHASES.PLACEMENT
    ? `${GAME_CONFIG.piecesPerPlayer * 2 - placed} placements remaining`
    : 'Placement complete'
  ;
  objectiveEl.textContent = currentObjectiveText();

  shellEl.dataset.activeTurn = state.game.turn;
  shellEl.dataset.activePhase = phase;

  if (state.game.winner) {
    statusEl.textContent = `${prettyPlayer(state.game.winner)} wins with three in a row.`;
    bannerEl.hidden = false;
    bannerEl.textContent = `${prettyPlayer(state.game.winner)} wins the game.`;
  } else if (state.mode === MODE.HVC && state.isThinking) {
    statusEl.textContent = 'Computer is evaluating its next move.';
    bannerEl.hidden = true;
  } else if (phase === PHASES.PLACEMENT) {
    statusEl.textContent = `${prettyPlayer(state.game.turn)} to place a piece.`;
    bannerEl.hidden = true;
  } else if (state.selected != null) {
    statusEl.textContent = `Selected ${coordLabel(state.selected)}. Choose an adjacent empty intersection.`;
    bannerEl.hidden = true;
  } else {
    statusEl.textContent = `${prettyPlayer(state.game.turn)} to move.`;
    bannerEl.hidden = true;
  }

  thinkingEl.hidden = !(state.mode === MODE.HVC && state.isThinking);
  undoEl.disabled = !canUndo();
}

function syncControls() {
  modeEl.value = state.mode;
  sideEl.value = state.humanSide;
  difficultyEl.value = state.difficulty;
  sideEl.disabled = state.mode === MODE.HVH;
  difficultyEl.disabled = state.mode === MODE.HVH;
}

function render() {
  syncControls();
  renderBoardState();
  updateStatus();
  renderHistory();
}

function executeMove(move, options = { triggerAI: true }) {
  pushSnapshot();
  state.game = applyMove(state.game, move);
  state.selected = null;
  render();
  if (options.triggerAI !== false) {
    maybeAIMove();
  }
}

async function maybeAIMove() {
  if (state.mode !== MODE.HVC || state.game.winner) return;
  const aiSide = opposite(state.humanSide);
  if (state.game.turn !== aiSide) return;

  const requestId = state.aiRequestId + 1;
  state.aiRequestId = requestId;
  state.isThinking = true;
  state.selected = null;
  render();

  let move = null;

  try {
    move = await thinkAndPickAIMove(cloneState(state.game), aiSide, state.difficulty, prefersReducedMotion ? 100 : 260);
  } catch (error) {
    if (requestId !== state.aiRequestId) return;
    state.isThinking = false;
    render();
    console.error('Achi AI move failed.', error);
    return;
  }

  if (requestId !== state.aiRequestId) return;

  state.isThinking = false;

  if (state.mode !== MODE.HVC || state.game.winner || state.game.turn !== aiSide) {
    render();
    return;
  }

  if (move && isMoveLegal(state.game, move, aiSide)) {
    executeMove(move, { triggerAI: false });
    return;
  }

  render();
}

function selectNode(index) {
  if (!isHumanTurn() || state.isThinking || state.game.winner) return;

  const phase = getPhase(state.game);
  const legalMoves = getLegalMoves(state.game, state.game.turn);
  const occupant = state.game.board[index];

  if (phase === PHASES.PLACEMENT) {
    const candidate = legalMoves.find((move) => move.to === index);
    if (candidate) executeMove(candidate);
    return;
  }

  if (state.selected == null) {
    if (occupant === state.game.turn && legalMoves.some((move) => move.from === index)) {
      state.selected = index;
    }
    render();
    return;
  }

  if (state.selected === index) {
    state.selected = null;
    render();
    return;
  }

  const candidate = legalMoves.find((move) => move.from === state.selected && move.to === index);
  if (candidate) {
    executeMove(candidate);
    return;
  }

  state.selected = occupant === state.game.turn && legalMoves.some((move) => move.from === index)
    ? index
    : null;
  render();
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
  state.selected = null;
  render();
}

function resetGame() {
  cancelPendingAI();
  state.game = createInitialState();
  state.selected = null;
  state.snapshots = [];
  render();
  maybeAIMove();
}

function setupHelpTabs() {
  const buttons = document.querySelectorAll('[data-tab-button]');
  const panels = document.querySelectorAll('[data-tab-panel]');

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tabButton;
      let activePanel = null;
      buttons.forEach((candidate) => candidate.setAttribute('aria-selected', String(candidate === button)));
      panels.forEach((panel) => {
        const active = panel.dataset.tabPanel === tab;
        panel.hidden = !active;
        if (active) activePanel = panel;
      });

      activePanel?.scrollIntoView({
        block: 'nearest',
        behavior: prefersReducedMotion ? 'auto' : 'smooth'
      });
    });
  });
}

function wireEvents() {
  boardEl.addEventListener('click', (event) => {
    const node = event.target.closest('.achi-node');
    if (!node) return;
    selectNode(Number(node.dataset.index));
  });

  boardEl.addEventListener('keydown', (event) => {
    const node = event.target.closest('.achi-node');
    if (!node) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectNode(Number(node.dataset.index));
    }
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

  newGameEl.addEventListener('click', resetGame);
  undoEl.addEventListener('click', undoMove);
}

function init() {
  buildBoard();
  wireEvents();
  setupHelpTabs();
  render();
}

init();
