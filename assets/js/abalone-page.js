import {
  BLACK,
  WHITE,
  DIRECTIONS,
  allCells,
  initialState,
  isValidSelection,
  getLegalMovesForSelection,
  applyMove,
  undoMove,
  keyOf,
  parseKey,
  moveDestinationCell
} from '/assets/js/abalone-engine.js';
import { chooseAIMove } from '/assets/js/abalone-ai.js';
import { setupTabs } from '/assets/js/game-tabs.js';

const R = 22;
const GAP = 3;
const STEP = R * 2 + GAP;
const SQRT3 = Math.sqrt(3);
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function axialToPixel(cell) {
  return {
    x: STEP * (SQRT3 * (cell.q + cell.r / 2)),
    y: STEP * (1.5 * cell.r)
  };
}

function boardGeometry(cells) {
  const points = cells.map(axialToPixel);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs) - 40;
  const maxX = Math.max(...xs) + 40;
  const minY = Math.min(...ys) - 40;
  const maxY = Math.max(...ys) + 40;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function playerName(player) {
  return player === BLACK ? 'Black' : 'White';
}

function opponentOf(player) {
  return player === BLACK ? WHITE : BLACK;
}

function renderBoard(svg, state, selected, legalTargets, onCellClick) {
  const cells = allCells();
  const geom = boardGeometry(cells);
  svg.setAttribute('viewBox', `${geom.minX} ${geom.minY} ${geom.width} ${geom.height}`);
  svg.innerHTML = `
    <defs>
      <radialGradient id="gradBlack" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#6f6f77"/><stop offset="52%" stop-color="#25252a"/><stop offset="100%" stop-color="#070709"/></radialGradient>
      <radialGradient id="gradWhite" cx="32%" cy="28%" r="74%"><stop offset="0%" stop-color="#ffffff"/><stop offset="55%" stop-color="#d8d8e2"/><stop offset="100%" stop-color="#9696a0"/></radialGradient>
    </defs>
  `;

  const selectedKeys = new Set(selected.map(keyOf));
  const legalMap = new Map(legalTargets.map((m) => [keyOf(m.target), m]));

  for (const cell of cells) {
    const p = axialToPixel(cell);
    const cellGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    const base = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    base.setAttribute('cx', p.x);
    base.setAttribute('cy', p.y);
    base.setAttribute('r', R);
    base.setAttribute('class', selectedKeys.has(keyOf(cell)) ? 'cell-base cell-selected' : 'cell-base');
    cellGroup.appendChild(base);

    const legal = legalMap.get(keyOf(cell));
    if (legal) {
      const target = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      target.setAttribute('cx', p.x);
      target.setAttribute('cy', p.y);
      target.setAttribute('r', R - 3);
      target.setAttribute('class', `cell-target ${legal.ejected ? 'cell-target-capture' : ''}`);
      target.addEventListener('click', () => onCellClick(cell, legal));
      cellGroup.appendChild(target);
    }

    const marble = state.board.get(keyOf(cell));
    if (marble) {
      const piece = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      piece.setAttribute('cx', p.x);
      piece.setAttribute('cy', p.y);
      piece.setAttribute('r', R - 4);
      piece.setAttribute('class', `marble ${marble === BLACK ? 'black' : 'white'}`);
      piece.addEventListener('click', () => onCellClick(cell, null));
      cellGroup.appendChild(piece);
    } else {
      base.addEventListener('click', () => onCellClick(cell, null));
    }

    svg.appendChild(cellGroup);
  }
}

function setupPlayableBoard() {
  const board = document.getElementById('abalone-board');
  const turn = document.getElementById('turn-indicator');
  const score = document.getElementById('capture-indicator');
  const status = document.getElementById('status-indicator');
  const historyEl = document.getElementById('move-history');
  const resetBtn = document.getElementById('reset-game');
  const undoBtn = document.getElementById('undo-move');
  const modeSelect = document.getElementById('mode-select');
  const sideSelect = document.getElementById('human-side-select');
  const difficultySelect = document.getElementById('difficulty-select');
  const sideStatus = document.getElementById('side-status');
  const historySummary = document.getElementById('history-summary');
  const thinking = document.getElementById('thinking-indicator');
  const gameOverBanner = document.getElementById('game-over-banner');

  let state = initialState();
  let selected = [];
  let aiThinking = false;

  const settings = {
    mode: 'hvh',
    humanSide: BLACK,
    difficulty: 'medium'
  };

  function isHumanTurn() {
    if (settings.mode === 'hvh') return true;
    return state.turn === settings.humanSide;
  }

  function aiSide() {
    return opponentOf(settings.humanSide);
  }

  function lockControls(locked) {
    board.classList.toggle('disabled-board', locked);
    thinking.classList.toggle('hidden', !locked);
  }

  function applyHumanMove(legal) {
    board.classList.add('move-flash');
    setTimeout(() => board.classList.remove('move-flash'), 160);
    state = applyMove(state, { selection: selected, direction: legal.direction });
    selected = [];
  }

  function attemptAIMove() {
    if (settings.mode !== 'hvc' || state.winner || isHumanTurn()) {
      aiThinking = false;
      lockControls(false);
      redraw();
      return;
    }

    aiThinking = true;
    lockControls(true);
    redraw();

    window.setTimeout(() => {
      const move = chooseAIMove(state, aiSide(), settings.difficulty);
      if (move) state = applyMove(state, move);
      aiThinking = false;
      lockControls(false);
      redraw();
    }, prefersReducedMotion ? 100 : 260);
  }

  function renderHistory() {
    historyEl.innerHTML = '';
    if (!state.history.length) {
      const li = document.createElement('li');
      li.className = 'history-empty';
      li.textContent = 'No moves yet.';
      historyEl.appendChild(li);
      return;
    }

    state.history.slice().reverse().forEach((h, idx) => {
      const li = document.createElement('li');
      const actor = settings.mode === 'hvc' && h.player !== settings.humanSide ? 'Computer' : playerName(h.player);
      const ejected = h.ejected ? ` · ejected ${h.ejected}` : '';
      li.textContent = `${state.history.length - idx}. ${actor}: ${h.text}${ejected}`;
      historyEl.appendChild(li);
    });
  }

  function redraw() {
    const moves = selected.length ? getLegalMovesForSelection(state, selected) : [];
    const legalTargets = moves.map((m) => ({ ...m, target: moveDestinationCell(m) }));

    renderBoard(board, state, selected, legalTargets, (cell, legal) => {
      if (state.winner || aiThinking || !isHumanTurn()) return;

      if (legal) {
        applyHumanMove(legal);
        redraw();
        attemptAIMove();
        return;
      }

      const owner = state.board.get(keyOf(cell));
      if (owner === state.turn) {
        const exists = selected.some((s) => keyOf(s) === keyOf(cell));
        const next = exists ? selected.filter((s) => keyOf(s) !== keyOf(cell)) : [...selected, cell];
        if (isValidSelection(state, next)) {
          selected = next;
        } else if (!exists) {
          selected = [cell];
        }
      } else {
        selected = [];
      }
      redraw();
    });

    const roleTurn = settings.mode === 'hvc' && state.turn !== settings.humanSide ? 'Computer' : playerName(state.turn);
    turn.textContent = state.winner
      ? `Winner: ${playerName(state.winner)}`
      : `Turn: ${roleTurn}${selected.length ? ` · selected ${selected.length}` : ''}`;

    score.textContent = `Captured — Black: ${state.captured[BLACK]} · White: ${state.captured[WHITE]}`;

    if (state.winner) {
      const winnerRole = settings.mode === 'hvc' && state.winner !== settings.humanSide ? 'Computer' : 'Human';
      const detail = settings.mode === 'hvc' ? `${winnerRole} (${playerName(state.winner)}) wins by 6 captures.` : `${playerName(state.winner)} wins by 6 captures.`;
      status.textContent = detail;
      gameOverBanner.textContent = detail;
      gameOverBanner.classList.remove('hidden');
    } else if (aiThinking) {
      status.textContent = 'Computer is evaluating legal responses…';
      gameOverBanner.classList.add('hidden');
    } else if (!isHumanTurn()) {
      status.textContent = 'Computer turn: input is locked until move resolves.';
      gameOverBanner.classList.add('hidden');
    } else {
      status.textContent = selected.length ? `${moves.length} legal move(s) highlighted.` : 'Select 1–3 aligned marbles to see legal moves.';
      gameOverBanner.classList.add('hidden');
    }

    sideSelect.disabled = settings.mode !== 'hvc' || aiThinking;
    difficultySelect.disabled = settings.mode !== 'hvc' || aiThinking;
    sideStatus.textContent = settings.mode === 'hvc'
      ? `You are ${playerName(settings.humanSide)} · Computer is ${playerName(aiSide())}`
      : 'Both sides are human-controlled.';
    historySummary.textContent = `Moves played: ${state.history.length}`;

    renderHistory();
  }

  function resetGame() {
    state = initialState();
    selected = [];
    aiThinking = false;
    lockControls(false);
    redraw();
    attemptAIMove();
  }

  modeSelect.addEventListener('change', () => {
    settings.mode = modeSelect.value;
    resetGame();
  });

  sideSelect.addEventListener('change', () => {
    settings.humanSide = sideSelect.value === WHITE ? WHITE : BLACK;
    if (settings.mode === 'hvc') resetGame();
    else redraw();
  });

  difficultySelect.addEventListener('change', () => {
    settings.difficulty = difficultySelect.value;
    redraw();
  });

  resetBtn.addEventListener('click', () => {
    resetGame();
  });

  undoBtn.addEventListener('click', () => {
    if (aiThinking) return;
    if (settings.mode === 'hvc') {
      state = undoMove(state);
      if (state.history.length && state.turn !== settings.humanSide) {
        state = undoMove(state);
      }
    } else {
      state = undoMove(state);
    }
    selected = [];
    redraw();
  });

  resetGame();
}

function setupExamples() {
  const examples = document.querySelectorAll('[data-example]');
  for (const el of examples) {
    const type = el.dataset.example;
    const svg = el.querySelector('svg');
    const dots = allCells().map((c) => ({ c, p: axialToPixel(c) }));
    const geom = boardGeometry(allCells());
    svg.setAttribute('viewBox', `${geom.minX} ${geom.minY} ${geom.width} ${geom.height}`);

    const frames = {
      inline: [
        [{ q: -2, r: 0, v: BLACK }, { q: -1, r: 0, v: BLACK }],
        [{ q: -1, r: 0, v: BLACK }, { q: 0, r: 0, v: BLACK }]
      ],
      broadside: [
        [{ q: -1, r: 1, v: WHITE }, { q: 0, r: 1, v: WHITE }, { q: 1, r: 1, v: WHITE }],
        [{ q: -1, r: 0, v: WHITE }, { q: 0, r: 0, v: WHITE }, { q: 1, r: 0, v: WHITE }]
      ],
      sumito: [
        [{ q: -1, r: 0, v: BLACK }, { q: 0, r: 0, v: BLACK }, { q: 1, r: 0, v: BLACK }, { q: 2, r: 0, v: WHITE }, { q: 3, r: 0, v: WHITE }],
        [{ q: 0, r: 0, v: BLACK }, { q: 1, r: 0, v: BLACK }, { q: 2, r: 0, v: BLACK }, { q: 3, r: 0, v: WHITE }, { q: 4, r: 0, v: WHITE }]
      ],
      illegal: [
        [{ q: -1, r: -1, v: BLACK }, { q: 0, r: -1, v: BLACK }, { q: 1, r: -1, v: WHITE }, { q: 2, r: -1, v: WHITE }],
        [{ q: -1, r: -1, v: BLACK }, { q: 0, r: -1, v: BLACK }, { q: 1, r: -1, v: WHITE }, { q: 2, r: -1, v: WHITE }]
      ]
    };

    let idx = 0;
    const draw = () => {
      svg.innerHTML = '';
      for (const d of dots) {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', d.p.x);
        c.setAttribute('cy', d.p.y);
        c.setAttribute('r', R - 2);
        c.setAttribute('fill', '#15151a');
        c.setAttribute('stroke', '#30303a');
        svg.appendChild(c);
      }
      for (const m of frames[type][idx]) {
        const p = axialToPixel(m);
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', p.x);
        c.setAttribute('cy', p.y);
        c.setAttribute('r', R - 5);
        c.setAttribute('fill', m.v === BLACK ? '#1f2937' : '#f3f4f6');
        c.setAttribute('stroke', m.v === BLACK ? '#9ca3af' : '#52525b');
        svg.appendChild(c);
      }
      idx = (idx + 1) % frames[type].length;
    };

    draw();
    if (!prefersReducedMotion) {
      setInterval(draw, 1000);
    }
  }
}

setupTabs({
  buttonSelector: '.seg-btn',
  panelSelector: '.tab-panel',
  buttonKey: 'tab',
  panelKey: 'panel',
  scrollPanel: false,
  setButtonState(button, active) {
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  },
  setPanelState(panel, active) {
    panel.classList.toggle('hidden', !active);
  }
});
setupPlayableBoard();
setupExamples();

const keyHints = document.getElementById('cell-count');
if (keyHints) keyHints.textContent = `${allCells().length}`;

window.abaloneDebug = { DIRECTIONS, parseKey };
