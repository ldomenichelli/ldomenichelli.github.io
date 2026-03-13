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

const R = 22;
const GAP = 3;
const STEP = R * 2 + GAP;
const SQRT3 = Math.sqrt(3);

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
      target.setAttribute('class', 'cell-target');
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

  let state = initialState();
  let selected = [];

  const redraw = () => {
    const moves = selected.length ? getLegalMovesForSelection(state, selected) : [];
    const legalTargets = moves.map((m) => ({ ...m, target: moveDestinationCell(m) }));

    renderBoard(board, state, selected, legalTargets, (cell, legal) => {
      if (state.winner) return;

      if (legal) {
        board.classList.add('move-flash');
        setTimeout(() => board.classList.remove('move-flash'), 180);
        state = applyMove(state, { selection: selected, direction: legal.direction });
        selected = [];
        redraw();
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

    turn.textContent = state.winner
      ? `Winner: ${state.winner === BLACK ? 'Black' : 'White'}`
      : `Turn: ${state.turn === BLACK ? 'Black' : 'White'}${selected.length ? ` · selected ${selected.length}` : ''}`;
    score.textContent = `Captured — Black: ${state.captured[BLACK]} · White: ${state.captured[WHITE]}`;
    status.textContent = selected.length ? `${moves.length} legal move(s) highlighted.` : 'Select 1–3 aligned marbles to see legal moves.';

    historyEl.innerHTML = '';
    state.history.slice().reverse().forEach((h, idx) => {
      const li = document.createElement('li');
      li.textContent = `${state.history.length - idx}. ${h.player === BLACK ? 'Black' : 'White'}: ${h.text}${h.ejected ? ` · ejected ${h.ejected}` : ''}`;
      historyEl.appendChild(li);
    });
  };

  resetBtn.addEventListener('click', () => {
    state = initialState();
    selected = [];
    redraw();
  });

  undoBtn.addEventListener('click', () => {
    state = undoMove(state);
    selected = [];
    redraw();
  });

  redraw();
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
        c.setAttribute('cx', d.p.x); c.setAttribute('cy', d.p.y); c.setAttribute('r', R - 2);
        c.setAttribute('fill', '#15151a'); c.setAttribute('stroke', '#30303a');
        svg.appendChild(c);
      }
      for (const m of frames[type][idx]) {
        const p = axialToPixel(m);
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); c.setAttribute('r', R - 5);
        c.setAttribute('fill', m.v === BLACK ? '#1f2937' : '#f3f4f6');
        c.setAttribute('stroke', m.v === BLACK ? '#9ca3af' : '#52525b');
        svg.appendChild(c);
      }
      idx = (idx + 1) % frames[type].length;
    };
    draw();
    setInterval(draw, 1000);
  }
}

setupPlayableBoard();
setupExamples();

const keyHints = document.getElementById('cell-count');
if (keyHints) keyHints.textContent = `${allCells().length}`;

// expose for debugging
window.abaloneDebug = { DIRECTIONS, parseKey };
