import {
  SIDES,
  GAME_CONFIG,
  createInitialState,
  applyMove,
  getLegalMoves,
  indexToCoord,
  ADJACENCY
} from './adugo-engine.js';
import { thinkAndPickAIMove, opposite } from './adugo-ai.js';
import { MODE, computeUndoResult } from './adugo-session.js';

const state = {
  game: createInitialState(),
  selected: null,
  mode: MODE.HVH,
  humanSide: SIDES.JAGUAR,
  difficulty: 'Medium',
  isThinking: false,
  snapshots: []
};

const boardEl = document.querySelector('[data-adugo-board]');
const shellEl = document.querySelector('.adugo-shell');
const turnEl = document.querySelector('[data-turn]');
const capturedEl = document.querySelector('[data-captured]');
const remainingEl = document.querySelector('[data-remaining]');
const captureProgressEl = document.querySelector('[data-capture-progress]');
const captureRemainingEl = document.querySelector('[data-capture-remaining]');
const objectiveEl = document.querySelector('[data-objective]');
const statusEl = document.querySelector('[data-status]');
const thinkingEl = document.querySelector('[data-thinking]');
const historyEl = document.querySelector('[data-history]');
const bannerEl = document.querySelector('[data-win-banner]');
const modeEl = document.querySelector('[data-mode]');
const sideEl = document.querySelector('[data-side]');
const diffEl = document.querySelector('[data-difficulty]');
const newGameEl = document.querySelector('[data-new-game]');
const undoEl = document.querySelector('[data-undo]');

function isHumanTurn() {
  if (state.game.winner) return false;
  if (state.mode === MODE.HVH) return true;
  return state.game.turn === state.humanSide;
}

function canUndoPair() {
  return state.snapshots.length > 0;
}

function pushSnapshot() {
  state.snapshots.push(structuredClone(state.game));
  if (state.snapshots.length > 200) state.snapshots.shift();
}

function prettySide(side) {
  return side === SIDES.JAGUAR ? 'Jaguar' : 'Dogs';
}

function buildBoard() {
  boardEl.innerHTML = '';
  for (let i = 0; i < GAME_CONFIG.size * GAME_CONFIG.size; i += 1) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'adugo-node';
    node.dataset.index = String(i);
    node.setAttribute('aria-label', `Node ${i + 1}`);
    boardEl.appendChild(node);
  }

  for (let i = 0; i < GAME_CONFIG.size * GAME_CONFIG.size; i += 1) {
    const { x, y } = indexToCoord(i);
    const left = `${(x / (GAME_CONFIG.size - 1)) * 100}%`;
    const top = `${(y / (GAME_CONFIG.size - 1)) * 100}%`;
    const node = boardEl.querySelector(`[data-index="${i}"]`);
    node.style.left = left;
    node.style.top = top;
  }

  const lineLayer = document.createElement('div');
  lineLayer.className = 'adugo-lines';
  boardEl.appendChild(lineLayer);

  const drawn = new Set();
  for (let i = 0; i < GAME_CONFIG.size * GAME_CONFIG.size; i += 1) {
    const from = indexToCoord(i);
    for (const n of ADJACENCY.get(i)) {
      const key = [i, n].sort((a, b) => a - b).join('-');
      if (drawn.has(key)) continue;
      drawn.add(key);
      const to = indexToCoord(n);
      const line = document.createElement('span');
      line.className = 'adugo-line';

      const x1 = (from.x / (GAME_CONFIG.size - 1)) * 100;
      const y1 = (from.y / (GAME_CONFIG.size - 1)) * 100;
      const x2 = (to.x / (GAME_CONFIG.size - 1)) * 100;
      const y2 = (to.y / (GAME_CONFIG.size - 1)) * 100;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      line.style.left = `${x1}%`;
      line.style.top = `${y1}%`;
      line.style.width = `${length}%`;
      line.style.transform = `rotate(${angle}deg)`;
      lineLayer.appendChild(line);
    }
  }
}

function annotateHistory() {
  historyEl.innerHTML = '';
  if (!state.game.history.length) {
    historyEl.innerHTML = '<li class="adugo-empty-history">No moves yet.</li>';
    return;
  }

  const recentHistory = state.game.history.slice(-220);
  const items = recentHistory.map((h, idx) => {
    const li = document.createElement('li');
    li.className = 'adugo-history-item';
    const capture = h.move.type === 'capture' ? ' ×' : '';
    const moveNo = state.game.history.length - recentHistory.length + idx + 1;
    li.textContent = `${moveNo}. ${prettySide(h.actorSide)} ${h.move.from + 1}→${h.move.to + 1}${capture}`;
    return li;
  });

  items.forEach((i) => historyEl.appendChild(i));
  historyEl.scrollTop = historyEl.scrollHeight;
}

function currentObjectiveText() {
  return `Jaguar objective: capture ${GAME_CONFIG.jaguarCaptureTarget} total dogs. Dogs objective: trap the jaguar (0 legal moves).`;
}

function highlightLegalTargets() {
  const nodes = boardEl.querySelectorAll('.adugo-node');
  nodes.forEach((n) => n.classList.remove('is-legal', 'is-selected', 'is-jaguar', 'is-dog', 'is-chain'));

  const moves = getLegalMoves(state.game, state.game.turn);
  const selectedMoves = state.selected
    ? moves.filter((m) => m.from === state.selected)
    : [];

  for (const node of nodes) {
    const idx = Number(node.dataset.index);
    if (idx === state.game.jaguar) {
      node.classList.add('is-jaguar');
      node.innerHTML = '<span class="piece jaguar" aria-hidden="true"></span>';
    } else if (state.game.dogs.includes(idx)) {
      node.classList.add('is-dog');
      node.innerHTML = '<span class="piece dog" aria-hidden="true"></span>';
    } else {
      node.innerHTML = '';
    }

    if (state.selected === idx) {
      node.classList.add('is-selected');
    }

    if (selectedMoves.some((m) => m.to === idx)) {
      node.classList.add('is-legal');
      if (selectedMoves.some((m) => m.type === 'capture' && m.to === idx)) {
        node.classList.add('is-chain');
      }
    }
  }
}

function updateStatusPanel() {
  const remaining = Math.max(0, GAME_CONFIG.jaguarCaptureTarget - state.game.capturedDogs);
  const progressPct = (Math.min(state.game.capturedDogs, GAME_CONFIG.jaguarCaptureTarget) / GAME_CONFIG.jaguarCaptureTarget) * 100;

  turnEl.textContent = prettySide(state.game.turn);
  capturedEl.textContent = String(state.game.capturedDogs);
  remainingEl.textContent = String(remaining);
  captureRemainingEl.textContent = `Remaining captures: ${remaining}`;
  captureProgressEl.style.width = `${progressPct}%`;
  objectiveEl.textContent = currentObjectiveText();

  shellEl.dataset.turn = state.game.turn;

  if (state.game.winner) {
    statusEl.textContent = `${prettySide(state.game.winner)} win!`;
    bannerEl.hidden = false;
    bannerEl.textContent = `${prettySide(state.game.winner)} win the game.`;
  } else if (state.game.chainCaptureFrom != null) {
    statusEl.textContent = 'Jaguar must continue the capture chain.';
    bannerEl.hidden = true;
  } else {
    statusEl.textContent = `${prettySide(state.game.turn)} to move.`;
    bannerEl.hidden = true;
  }

  thinkingEl.hidden = !(state.mode === MODE.HVC && state.isThinking);
  undoEl.disabled = !canUndoPair();
}

function syncControls() {
  modeEl.value = state.mode;
  sideEl.value = state.humanSide;
  diffEl.value = state.difficulty;
  sideEl.disabled = state.mode === MODE.HVH;
  diffEl.disabled = state.mode === MODE.HVH;
}

function render() {
  syncControls();
  highlightLegalTargets();
  updateStatusPanel();
  annotateHistory();
}

function selectNode(index) {
  if (!isHumanTurn() || state.isThinking) return;

  const occ = index === state.game.jaguar ? SIDES.JAGUAR : state.game.dogs.includes(index) ? SIDES.DOGS : null;
  const moves = getLegalMoves(state.game, state.game.turn);

  if (state.selected == null) {
    if (occ === state.game.turn) {
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

  const candidate = moves.find((m) => m.from === state.selected && m.to === index);
  if (candidate) {
    executeMove(candidate);
    return;
  }

  state.selected = occ === state.game.turn ? index : null;
  render();
}

async function maybeAIMove() {
  if (state.mode !== MODE.HVC || state.game.winner) return;
  const aiSide = opposite(state.humanSide);
  if (state.game.turn !== aiSide) return;

  state.isThinking = true;
  state.selected = null;
  render();

  const move = await thinkAndPickAIMove(state.game, aiSide, state.difficulty);
  state.isThinking = false;
  if (move) {
    executeMove(move, { triggerAI: false });
  } else {
    render();
  }
}

function executeMove(move, opts = { triggerAI: true }) {
  pushSnapshot();
  state.game = applyMove(state.game, move);
  if (state.game.chainCaptureFrom != null && state.game.turn === SIDES.JAGUAR) {
    state.selected = state.game.jaguar;
  } else {
    state.selected = null;
  }
  render();
  if (opts.triggerAI !== false) {
    maybeAIMove();
  }
}

function undoMove() {
  if (!canUndoPair()) return;

  const result = computeUndoResult({
    mode: state.mode,
    humanSide: state.humanSide,
    snapshots: state.snapshots,
    currentGame: state.game
  });

  state.game = result.game;
  state.snapshots = result.snapshots;
  state.selected = null;
  state.isThinking = false;
  render();
}

function resetGame() {
  state.game = createInitialState();
  state.selected = null;
  state.snapshots = [];
  state.isThinking = false;
  render();
  maybeAIMove();
}

function wireEvents() {
  boardEl.addEventListener('click', (event) => {
    const node = event.target.closest('.adugo-node');
    if (!node) return;
    selectNode(Number(node.dataset.index));
  });

  boardEl.addEventListener('keydown', (event) => {
    const node = event.target.closest('.adugo-node');
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

  diffEl.addEventListener('change', () => {
    state.difficulty = diffEl.value;
    render();
  });

  newGameEl.addEventListener('click', resetGame);
  undoEl.addEventListener('click', undoMove);
}

function setupHelpTabs() {
  const buttons = document.querySelectorAll('[data-tab-button]');
  const panels = document.querySelectorAll('[data-tab-panel]');

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tabButton;
      buttons.forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.tabPanel !== tab;
      });
    });
  });
}

function init() {
  buildBoard();
  wireEvents();
  setupHelpTabs();
  render();
}

init();
