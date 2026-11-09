import {
  BLACK, WHITE, DIRECTIONS, allCells, initialState, isValidSelection,
  getLegalMovesForSelection, applyMove, undoMove, keyOf, parseKey, moveDestinationCell
} from '/assets/js/abalone-engine.js';
import { chooseAIMove, enumerateLegalMoves } from '/assets/js/abalone-ai.js';
import { setupTabs } from '/assets/js/game-tabs.js';

const R = 22;
const STEP = 48;
const SQRT3 = Math.sqrt(3);
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const directionLabels = ['east', 'northeast', 'northwest', 'west', 'southwest', 'southeast'];
const directionArrows = ['→', '↗', '↖', '←', '↙', '↘'];

function axialToPixel(cell) {
  return { x: STEP * (cell.q + cell.r / 2), y: STEP * SQRT3 / 2 * cell.r };
}

function boardGeometry(cells) {
  const points = cells.map(axialToPixel);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs) - 34;
  const maxX = Math.max(...xs) + 34;
  const minY = Math.min(...ys) - 34;
  const maxY = Math.max(...ys) + 34;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function playerName(player) { return player === BLACK ? 'Black' : 'White'; }
function opponentOf(player) { return player === BLACK ? WHITE : BLACK; }

function renderBoard(svg, state, selected, legalTargets, onCellClick, interactive) {
  const cells = allCells();
  const geom = boardGeometry(cells);
  const activeCell = svg.contains(document.activeElement) ? document.activeElement.dataset.cell : null;
  const focusedCell = activeCell || svg.dataset.focusCell || keyOf(cells.find((cell) => state.board.get(keyOf(cell)) === state.turn));
  svg.setAttribute('viewBox', `${geom.minX} ${geom.minY} ${geom.width} ${geom.height}`);
  svg.setAttribute('aria-disabled', String(!interactive));
  svg.innerHTML = `<defs>
    <radialGradient id="gradBlack" cx="32%" cy="25%" r="75%"><stop offset="0%" stop-color="#66746a"/><stop offset="48%" stop-color="#2b3932"/><stop offset="100%" stop-color="#111e18"/></radialGradient>
    <radialGradient id="gradWhite" cx="30%" cy="25%" r="75%"><stop offset="0%" stop-color="#fffef9"/><stop offset="60%" stop-color="#eee9dc"/><stop offset="100%" stop-color="#bebcae"/></radialGradient>
  </defs>`;
  const selectedKeys = new Set(selected.map(keyOf));
  const legalMap = new Map(legalTargets.map((move) => [keyOf(move.target), move]));
  const lastMove = state.history.at(-1)?.snapshot.historyEntry;
  const lastTargets = new Set((lastMove?.selection || []).map((cell) => keyOf({ q: cell.q + lastMove.direction.q, r: cell.r + lastMove.direction.r })));
  const ns = 'http://www.w3.org/2000/svg';

  for (const cell of cells) {
    const point = axialToPixel(cell);
    const key = keyOf(cell);
    const owner = state.board.get(key);
    const legal = legalMap.get(key);
    const group = document.createElementNS(ns, 'g');
    group.dataset.cell = key;
    group.setAttribute('role', 'button');
    group.setAttribute('tabindex', key === focusedCell ? '0' : '-1');
    group.setAttribute('aria-pressed', String(selectedKeys.has(key)));
    group.setAttribute('aria-label', `${owner ? `${playerName(owner)} marble` : 'Empty space'} at ${key}${selectedKeys.has(key) ? ', selected' : ''}${legal ? `, move ${directionLabels[DIRECTIONS.findIndex((d) => keyOf(d) === keyOf(legal.direction))]}${legal.pushCount ? `, push ${legal.pushCount}` : ''}` : ''}`);
    group.setAttribute('class', `abalone-cell ${selectedKeys.has(key) ? 'is-selected' : ''} ${legal ? 'is-target' : ''} ${lastTargets.has(key) ? 'is-last-move' : ''}`);
    const circle = (radius, className) => {
      const node = document.createElementNS(ns, 'circle');
      node.setAttribute('cx', point.x); node.setAttribute('cy', point.y);
      node.setAttribute('r', radius); node.setAttribute('class', className);
      group.appendChild(node);
      return node;
    };
    circle(R + 2, 'cell-hit');
    circle(R, 'cell-base');
    if (owner) circle(R - 3, `marble ${owner === BLACK ? 'black' : 'white'}`);
    if (legal) {
      circle(owner ? R : 8, `cell-target ${owner ? 'cell-push-target' : ''} ${legal.ejected ? 'cell-target-capture' : ''}`);
      if (owner) {
        const arrow = document.createElementNS(ns, 'text');
        arrow.setAttribute('x', point.x); arrow.setAttribute('y', point.y + 6);
        arrow.setAttribute('class', 'cell-push-arrow');
        arrow.textContent = directionArrows[DIRECTIONS.findIndex((d) => keyOf(d) === keyOf(legal.direction))];
        group.appendChild(arrow);
      }
    }
    circle(R + 1, 'cell-focus-ring');
    group.addEventListener('click', () => { svg.dataset.focusCell = key; onCellClick(cell, legal); });
    group.addEventListener('focus', () => { svg.dataset.focusCell = key; });
    svg.appendChild(group);
  }
  if (activeCell) svg.querySelector(`[data-cell="${activeCell}"]`)?.focus({ preventScroll: true });
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
  const clearBtn = document.getElementById('clear-selection');
  const selectionLabel = document.getElementById('selection-label');
  const selectionHelp = document.getElementById('selection-help');
  const directionButtons = [...document.querySelectorAll('[data-direction]')];
  let state = initialState();
  let selected = [];
  let aiThinking = false;
  let aiTimer = null;
  let aiRequest = 0;
  const settings = { mode: 'hvc', humanSide: BLACK, difficulty: 'medium' };
  const isHumanTurn = () => !state.winner && (settings.mode === 'hvh' || state.turn === settings.humanSide);
  const aiSide = () => opponentOf(settings.humanSide);

  function cancelAI() { window.clearTimeout(aiTimer); aiRequest += 1; aiThinking = false; }

  function playMove(move) {
    if (!move || !isHumanTurn() || aiThinking) return;
    state = applyMove(state, move);
    selected = [];
    redraw();
    attemptAIMove();
  }

  function attemptAIMove() {
    if (settings.mode !== 'hvc' || state.winner || isHumanTurn()) return;
    aiThinking = true;
    const request = ++aiRequest;
    redraw();
    aiTimer = window.setTimeout(() => {
      if (request !== aiRequest) return;
      let move;
      try { move = chooseAIMove(state, aiSide(), settings.difficulty); }
      catch (error) { console.error('Abalone computer move failed.', error); }
      move ||= enumerateLegalMoves(state, aiSide())[0];
      if (move) state = applyMove(state, move);
      aiThinking = false;
      redraw();
    }, prefersReducedMotion ? 70 : 240);
  }

  function renderHistory() {
    historyEl.innerHTML = '';
    if (!state.history.length) {
      historyEl.innerHTML = '<li class="history-empty">Your first move starts the story.</li>';
      return;
    }
    state.history.slice().reverse().forEach((entry, index) => {
      const li = document.createElement('li');
      const move = entry.snapshot.historyEntry;
      const direction = DIRECTIONS.findIndex((dir) => keyOf(dir) === keyOf(move.direction));
      const actor = settings.mode === 'hvc' && entry.player !== settings.humanSide ? 'Computer' : playerName(entry.player);
      li.textContent = `${state.history.length - index}. ${actor} · ${move.selection.length} marble${move.selection.length === 1 ? '' : 's'} ${directionArrows[direction]}${entry.ejected ? ' · captured 1' : move.pushCount ? ` · pushed ${move.pushCount}` : ''}`;
      historyEl.appendChild(li);
    });
  }

  function redraw() {
    const moves = selected.length ? getLegalMovesForSelection(state, selected) : [];
    const legalTargets = moves.map((move) => ({ ...move, target: moveDestinationCell(move) }));
    renderBoard(board, state, selected, legalTargets, (cell, legal) => {
      if (!isHumanTurn() || aiThinking) return;
      if (legal) { playMove(legal); return; }
      if (state.board.get(keyOf(cell)) === state.turn) {
        const exists = selected.some((item) => keyOf(item) === keyOf(cell));
        const next = exists ? selected.filter((item) => keyOf(item) !== keyOf(cell)) : [...selected, cell];
        if (!next.length || isValidSelection(state, next)) selected = next;
        else if (!exists) selected = [cell];
      } else selected = [];
      redraw();
    }, isHumanTurn() && !aiThinking);

    turn.textContent = state.winner ? `${playerName(state.winner)} wins!` : aiThinking ? 'Computer’s turn' : settings.mode === 'hvc' ? `Your turn · ${playerName(state.turn)}` : `${playerName(state.turn)} to move`;
    turn.dataset.player = state.turn;
    score.innerHTML = [BLACK, WHITE].map((side) => `<div class="abalone-score ${state.turn === side ? 'is-current' : ''}"><span class="abalone-score-name"><i class="score-marble ${side === BLACK ? 'black' : 'white'}"></i>${playerName(side)}</span><span class="capture-pips" aria-hidden="true">${Array.from({length:6}, (_,i) => `<i class="${i < state.captured[side] ? 'is-filled' : ''}"></i>`).join('')}</span><strong>${state.captured[side]}<small> / 6</small></strong></div>`).join('');
    if (state.winner) {
      status.textContent = `${playerName(state.winner)} has captured six marbles. Well played.`;
      gameOverBanner.textContent = status.textContent;
    } else if (aiThinking) status.textContent = 'Finding the next move…';
    else if (selected.length) status.textContent = moves.length ? 'Choose a glowing space or use a direction below.' : 'This group is blocked. Try another marble or a larger group.';
    else status.textContent = 'Select 1–3 neighbouring marbles in a straight line.';
    gameOverBanner.classList.toggle('hidden', !state.winner);
    thinking.classList.toggle('hidden', !aiThinking);
    board.classList.toggle('disabled-board', aiThinking || Boolean(state.winner));
    modeSelect.value = settings.mode;
    sideSelect.value = settings.humanSide;
    sideSelect.disabled = settings.mode !== 'hvc';
    difficultySelect.disabled = settings.mode !== 'hvc';
    undoBtn.disabled = !state.history.length || (settings.mode === 'hvc' && settings.humanSide === WHITE && state.history.length === 1 && !aiThinking);
    clearBtn.disabled = !selected.length;
    selectionLabel.textContent = selected.length ? `${selected.length} marble${selected.length === 1 ? '' : 's'} selected` : 'Choose your marbles';
    selectionHelp.textContent = selected.length ? `${moves.length} available direction${moves.length === 1 ? '' : 's'}.` : 'Tap up to 3 in a straight line.';
    directionButtons.forEach((button) => {
      const index = Number(button.dataset.direction);
      const move = moves.find((item) => keyOf(item.direction) === keyOf(DIRECTIONS[index]));
      button.disabled = !move || !isHumanTurn() || aiThinking;
      button.title = `Move ${directionLabels[index]}${move?.pushCount ? ` · push ${move.pushCount}` : ''}${move?.ejected ? ' · capture 1' : ''}`;
    });
    sideStatus.textContent = settings.mode === 'hvc' ? `You play ${playerName(settings.humanSide)}. The computer plays ${playerName(aiSide())}.` : 'Pass the board between turns.';
    historySummary.textContent = `${state.history.length} moves played`;
    renderHistory();
  }

  function resetGame() { cancelAI(); state = initialState(); selected = []; redraw(); attemptAIMove(); }
  modeSelect.addEventListener('change', () => { settings.mode = modeSelect.value; resetGame(); });
  sideSelect.addEventListener('change', () => { settings.humanSide = sideSelect.value; resetGame(); });
  difficultySelect.addEventListener('change', () => { settings.difficulty = difficultySelect.value; });
  resetBtn.addEventListener('click', resetGame);
  clearBtn.addEventListener('click', () => { selected = []; redraw(); });
  directionButtons.forEach((button) => button.addEventListener('click', () => {
    const direction = DIRECTIONS[Number(button.dataset.direction)];
    playMove(getLegalMovesForSelection(state, selected).find((move) => keyOf(move.direction) === keyOf(direction)));
  }));
  undoBtn.addEventListener('click', () => {
    cancelAI();
    state = undoMove(state);
    if (settings.mode === 'hvc' && state.history.length && state.turn !== settings.humanSide) state = undoMove(state);
    selected = [];
    redraw();
  });
  board.addEventListener('keydown', (event) => {
    const current = event.target.closest('[data-cell]');
    if (!current) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); current.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
    if (event.key === 'Escape') { event.preventDefault(); selected = []; redraw(); return; }
    const offsets = { ArrowLeft: {q:-1,r:0}, ArrowRight: {q:1,r:0}, ArrowUp: {q:0,r:-1}, ArrowDown: {q:0,r:1} };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const cell = parseKey(current.dataset.cell);
    let next = board.querySelector(`[data-cell="${cell.q + offset.q},${cell.r + offset.r}"]`);
    if (!next && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) next = board.querySelector(`[data-cell="${cell.q - offset.r},${cell.r + offset.r}"]`);
    if (next) { current.setAttribute('tabindex','-1'); next.setAttribute('tabindex','0'); next.focus({preventScroll:true}); }
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
        c.setAttribute('fill', '#d4dfcc');
        c.setAttribute('stroke', '#bccbb5');
        svg.appendChild(c);
      }
      for (const m of frames[type][idx]) {
        const p = axialToPixel(m);
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', p.x);
        c.setAttribute('cy', p.y);
        c.setAttribute('r', R - 5);
        c.setAttribute('fill', m.v === BLACK ? '#293e33' : '#fffdf1');
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
