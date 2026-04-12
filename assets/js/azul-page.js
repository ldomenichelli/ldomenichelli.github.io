import {
  TILE_COLORS,
  WALL_PATTERN,
  START_MARKER,
  PHASES,
  COLOR_META,
  createInitialState,
  cloneState,
  getDraftOptions,
  getPlacementOptions,
  applyMove,
  isMoveLegal,
  playerLabel,
  formatDraftHistory,
  formatRoundSummary
} from './azul-engine.js';
import { chooseAIMove } from './azul-ai.js';
import { MODE, computeUndoResult } from './azul-session.js';
import { setupTabs } from './game-tabs.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  game: createInitialState({ seed: makeSeed() }),
  mode: MODE.HVH,
  humanSide: 0,
  difficulty: 'Medium',
  selectedDraftKey: null,
  isThinking: false,
  snapshots: [],
  aiRequestId: 0,
  reasonMessage: ''
};

const arenaEl = document.querySelector('[data-azul-arena]');
const factoriesEl = document.querySelector('[data-factories]');
const centerEl = document.querySelector('[data-center]');
const boardsEl = document.querySelector('[data-boards]');
const historyEl = document.querySelector('[data-history]');
const turnEl = document.querySelector('[data-turn]');
const statusEl = document.querySelector('[data-status]');
const substatusEl = document.querySelector('[data-substatus]');
const thinkingEl = document.querySelector('[data-thinking]');
const bannerEl = document.querySelector('[data-banner]');
const roundEl = document.querySelector('[data-round]');
const phaseEl = document.querySelector('[data-phase]');
const currentPlayerEl = document.querySelector('[data-current-player]');
const nextStarterEl = document.querySelector('[data-next-starter]');
const roundSummaryEl = document.querySelector('[data-round-summary]');
const seatSummaryEl = document.querySelector('[data-seat-summary]');
const selectionSummaryEl = document.querySelector('[data-selection-summary]');
const reasonSummaryEl = document.querySelector('[data-reason-summary]');
const bagCountEl = document.querySelector('[data-bag-count]');
const discardCountEl = document.querySelector('[data-discard-count]');
const modeEl = document.querySelector('[data-mode]');
const seatEl = document.querySelector('[data-seat]');
const difficultyEl = document.querySelector('[data-difficulty]');
const undoEl = document.querySelector('[data-undo]');
const newGameEl = document.querySelector('[data-new-game]');

function makeSeed() {
  return ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0) || 1;
}

function draftKey(draft) {
  return [
    draft.source.kind,
    draft.source.index ?? 'CENTER',
    draft.color
  ].join(':');
}

function otherSeat(index) {
  return index === 0 ? 1 : 0;
}

function roleLabel(index) {
  if (state.mode === MODE.HVC) {
    if (index === state.humanSide) return 'You';
    return 'Computer';
  }
  return playerLabel(index);
}

function boardSubtitle(index) {
  if (state.mode === MODE.HVC) {
    return index === state.humanSide ? 'Human-controlled' : 'Computer-controlled';
  }
  return 'Local seat';
}

function winnerText() {
  if (!state.game.winnerIndices.length) return '';

  const winners = state.game.winnerIndices.map((index) => roleLabel(index));
  if (state.game.tieBreak === 'shared' && winners.length > 1) {
    return `${winners.join(' and ')} share the win.`;
  }
  return `${winners[0]} win${winners[0] === 'You' ? '' : 's'} the mosaic duel.`;
}

function phaseLabel() {
  return state.game.phase === PHASES.GAME_OVER ? 'Game over' : 'Factory offer';
}

function isHumanTurn() {
  if (state.game.phase === PHASES.GAME_OVER) return false;
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
  if (state.snapshots.length > 180) {
    state.snapshots.shift();
  }
}

function selectedDraft() {
  const options = getDraftOptions(state.game);
  return options.find((draft) => draftKey(draft) === state.selectedDraftKey) ?? null;
}

function sourceLabel(draft) {
  if (draft.source.kind === 'CENTER') return 'Center';
  return `Factory ${draft.source.index + 1}`;
}

function tileClass(color) {
  return `tile-${color.toLowerCase()}`;
}

function tileMarkup(color, ariaLabel = COLOR_META[color]?.label ?? 'Marker') {
  return `<span class="azul-tile ${tileClass(color)}" aria-label="${ariaLabel}"></span>`;
}

function summarizeDestination(option) {
  if (!option) return '';
  if (!option.isLegal) return 'blocked';
  if (option.destination.kind === 'FLOOR') return `all ${option.floorCount} to floor`;
  if (option.floorCount > 0) return `fit ${option.placedCount} / +${option.floorCount} floor`;
  return option.completesLine ? `fit ${option.placedCount} / complete` : `fit ${option.placedCount}`;
}

function renderFactories() {
  const draftOptions = getDraftOptions(state.game);

  factoriesEl.innerHTML = state.game.factories.map((factory, index) => {
    const groups = draftOptions.filter((draft) => draft.source.kind === 'FACTORY' && draft.source.index === index);
    const empty = groups.length === 0;

    return `
      <section class="azul-factory ${empty ? 'is-empty' : ''}" aria-label="Factory ${index + 1}">
        <div class="azul-factory-header">
          <h4>Factory ${index + 1}</h4>
          <span class="azul-count">${factory.length}</span>
        </div>
        <div class="azul-factory-body">
          ${groups.map((draft) => `
            <button
              type="button"
              class="azul-source-button ${state.selectedDraftKey === draftKey(draft) ? 'is-selected' : ''}"
              data-source-kind="${draft.source.kind}"
              data-source-index="${draft.source.index}"
              data-color="${draft.color}"
              ${!isHumanTurn() || state.isThinking ? 'disabled' : ''}
            >
              <span class="azul-source-label">
                ${tileMarkup(draft.color)}
                <span class="azul-source-copy">
                  <strong>${COLOR_META[draft.color].label}</strong>
                  <small>Take ${draft.count}</small>
                </span>
              </span>
              <span class="azul-count">${draft.count}</span>
            </button>
          `).join('')}
          ${empty ? '<p class="azul-selection-note">Empty display.</p>' : ''}
        </div>
      </section>
    `;
  }).join('');

  const centerGroups = draftOptions.filter((draft) => draft.source.kind === 'CENTER');
  const centerSelected = centerGroups.some((draft) => state.selectedDraftKey === draftKey(draft));
  const centerEmpty = centerGroups.length === 0;

  centerEl.classList.toggle('is-selected', centerSelected);
  centerEl.innerHTML = `
    <div class="azul-center-header">
      <h4>Center</h4>
      <span class="azul-count">${state.game.center.tiles.length}</span>
    </div>
    <div class="azul-center-body">
      ${centerGroups.map((draft) => `
        <button
          type="button"
          class="azul-source-button ${state.selectedDraftKey === draftKey(draft) ? 'is-selected' : ''}"
          data-source-kind="CENTER"
          data-color="${draft.color}"
          ${!isHumanTurn() || state.isThinking ? 'disabled' : ''}
        >
          <span class="azul-source-label">
            ${tileMarkup(draft.color)}
            <span class="azul-source-copy">
              <strong>${COLOR_META[draft.color].label}</strong>
              <small>${draft.takesStartMarker ? 'Includes first-player marker' : 'Center draft'}</small>
            </span>
          </span>
          <span class="azul-count">${draft.count}</span>
        </button>
      `).join('')}
      ${centerEmpty ? '<p class="azul-selection-note">No colored tiles in the center.</p>' : ''}
      ${state.game.center.hasStartMarker ? '<span class="azul-marker-pill">First-player marker available</span>' : ''}
    </div>
  `;
}

function lineSlotsMarkup(line) {
  const slots = Array.from({ length: line.capacity }, (_, slotIndex) => {
    const filledStart = line.capacity - line.filled;
    if (slotIndex < filledStart || !line.color) {
      return '<span class="azul-slot is-empty"></span>';
    }
    return `<span class="azul-slot ${tileClass(line.color)}">${tileMarkup(line.color)}</span>`;
  }).join('');

  return `<div class="azul-slot-row" data-capacity="${line.capacity}">${slots}</div>`;
}

function wallMarkup(playerIndex, lastPlacementLookup) {
  return WALL_PATTERN.flatMap((rowColors, rowIndex) =>
    rowColors.map((color, columnIndex) => {
      const placed = Boolean(state.game.players[playerIndex].wall[rowIndex][columnIndex]);
      const isLastPlacement = lastPlacementLookup.has(`${playerIndex}:${rowIndex}:${columnIndex}`);
      return `
        <span class="azul-wall-cell ${tileClass(color)} ${placed ? 'is-filled' : ''} ${isLastPlacement ? 'is-last-placement' : ''}">
          ${placed ? tileMarkup(color) : ''}
        </span>
      `;
    })
  ).join('');
}

function floorMarkup(player) {
  const tokens = [...player.floor];
  while (tokens.length < 7) tokens.push(null);

  const penalties = [-1, -1, -2, -2, -2, -3, -3]
    .map((penalty) => `<span class="azul-floor-penalty">${penalty}</span>`)
    .join('');

  const slots = tokens.map((token) => {
    if (!token) {
      return '<span class="azul-floor-slot is-empty"></span>';
    }
    const tile = token === START_MARKER ? 'MARKER' : token;
    return `<span class="azul-floor-slot ${tileClass(tile)}">${tileMarkup(tile, token === START_MARKER ? 'First-player marker' : COLOR_META[token].label)}</span>`;
  }).join('');

  return `
    <div class="azul-floor-wrap">
      <div class="azul-floor-penalties">${penalties}</div>
      <div class="azul-floor-grid">${slots}</div>
    </div>
  `;
}

function renderBoards() {
  const draft = selectedDraft();
  const interactivePlayer = isHumanTurn() ? state.game.turn : null;
  const lastPlacementLookup = new Set(
    (state.game.lastRoundSummary?.playerSummaries ?? []).flatMap((summary) =>
      summary.placements.map((placement) => `${summary.player}:${placement.row}:${placement.column}`)
    )
  );

  boardsEl.innerHTML = state.game.players.map((player, playerIndex) => {
    const isCurrent = playerIndex === state.game.turn && state.game.phase !== PHASES.GAME_OVER;
    const isInteractive = interactivePlayer === playerIndex && !state.isThinking;
    const placements = draft ? getPlacementOptions(state.game, playerIndex, draft) : [];
    const placementByKey = new Map(placements.map((option) => [
      `${option.destination.kind}:${option.destination.row ?? 'FLOOR'}`,
      option
    ]));

    const patternLines = player.patternLines.map((line, row) => {
      const option = placementByKey.get(`PATTERN_LINE:${row}`) ?? null;
      const reason = option?.reason ?? (draft ? 'Blocked.' : 'Choose a draft source first.');
      const className = [
        'azul-pattern-line',
        option?.isLegal ? 'is-legal' : '',
        draft && !option?.isLegal ? 'is-invalid' : '',
        line.filled === line.capacity && line.filled > 0 ? 'is-complete' : ''
      ].filter(Boolean).join(' ');
      const lineStatus = draft
        ? summarizeDestination(option)
        : line.color
          ? `${line.filled}/${line.capacity}`
          : `0/${line.capacity}`;

      return `
        <button
          type="button"
          class="${className}"
          data-player="${playerIndex}"
          data-destination-kind="PATTERN_LINE"
          data-row="${row}"
          data-reason="${reason}"
          aria-disabled="${String(!isInteractive || (draft && !option?.isLegal))}"
        >
          <span class="azul-line-label">Line ${row + 1}</span>
          ${lineSlotsMarkup(line)}
          <span class="azul-line-status"><strong>${lineStatus}</strong>${line.color ? COLOR_META[line.color].label : 'Any color'}</span>
        </button>
      `;
    }).join('');

    const floorOption = draft ? placementByKey.get('FLOOR:FLOOR') ?? null : null;
    const floorStatus = draft ? summarizeDestination(floorOption) : `${player.floor.length}/7`;
    const floorReason = draft ? '' : 'Choose a draft source first.';

    return `
      <section class="azul-player-board ${isCurrent ? 'is-current' : ''} ${playerIndex === state.humanSide && state.mode === MODE.HVC ? 'is-human' : ''} ${state.game.firstPlayerClaimedBy === playerIndex ? 'is-awaiting' : ''}" aria-label="${playerLabel(playerIndex)} board">
        <div class="azul-player-header">
          <div class="azul-player-title">
            ${playerLabel(playerIndex)}
            <small>${boardSubtitle(playerIndex)}</small>
          </div>
          <div class="azul-player-meta">
            <span class="azul-score-pill"><small>Score</small><strong>${player.score}</strong></span>
            <span class="azul-player-chip ${isCurrent ? 'is-active' : ''}">${isCurrent ? 'Current turn' : roleLabel(playerIndex)}</span>
            ${state.game.nextStartPlayer === playerIndex ? '<span class="azul-player-chip">Next starter</span>' : ''}
          </div>
        </div>

        <div class="azul-player-grid">
          <div class="azul-board-column">
            <p class="azul-column-title">Pattern lines</p>
            <div class="azul-pattern-lines">${patternLines}</div>
          </div>

          <div class="azul-board-column">
            <p class="azul-column-title">Wall</p>
            <div class="azul-wall">${wallMarkup(playerIndex, lastPlacementLookup)}</div>
          </div>
        </div>

        <div class="azul-board-column">
          <p class="azul-column-title">Floor line</p>
          <button
            type="button"
            class="azul-pattern-line is-floor ${draft ? 'is-legal' : ''}"
            data-player="${playerIndex}"
            data-destination-kind="FLOOR"
            data-reason="${floorReason}"
            aria-disabled="${String(!isInteractive)}"
          >
            <span class="azul-line-label">Floor</span>
            ${floorMarkup(player)}
            <span class="azul-line-status"><strong>${floorStatus}</strong>Penalty row</span>
          </button>
        </div>
      </section>
    `;
  }).join('');
}

function renderHistory() {
  historyEl.innerHTML = '';

  if (!state.game.history.length) {
    historyEl.innerHTML = '<li class="game-shell-history-empty">No moves yet.</li>';
    return;
  }

  state.game.history.forEach((entry, index) => {
    const li = document.createElement('li');

    if (entry.type === 'draft') {
      li.dataset.player = String(entry.player);
      li.textContent = `${index + 1}. ${formatDraftHistory(entry, {
        humanPlayerIndex: state.mode === MODE.HVC ? state.humanSide : null,
        computerPlayerIndex: state.mode === MODE.HVC ? otherSeat(state.humanSide) : null
      })}`;
    } else if (entry.type === 'round') {
      li.dataset.type = 'round';
      li.textContent = `${index + 1}. Round ${entry.round} wall-tiling: ${formatRoundSummary(entry.summary, {
        humanPlayerIndex: state.mode === MODE.HVC ? state.humanSide : null,
        computerPlayerIndex: state.mode === MODE.HVC ? otherSeat(state.humanSide) : null
      })}`;
    } else if (entry.type === 'gameover') {
      li.dataset.type = 'gameover';
      const leaders = entry.winners.map((winner) => roleLabel(winner)).join(' and ');
      li.textContent = `${index + 1}. Final scoring: ${leaders}${entry.tieBreak === 'shared' ? ' share the win.' : ' finish ahead.'}`;
    }

    historyEl.appendChild(li);
  });

  historyEl.scrollTop = historyEl.scrollHeight;
}

function statusText(draft) {
  if (state.game.phase === PHASES.GAME_OVER) {
    return winnerText();
  }

  if (state.isThinking) {
    return 'Computer is evaluating draft, denial, and floor-pressure options…';
  }

  if (!isHumanTurn()) {
    return 'Computer turn: human input unlocks once the move is applied.';
  }

  if (draft) {
    return `Selected ${draft.count} ${COLOR_META[draft.color].label.toLowerCase()} from ${sourceLabel(draft)}. Choose exactly one destination on ${playerLabel(state.game.turn)}'s board.`;
  }

  return `${roleLabel(state.game.turn)} to draft from the factories or the center.`;
}

function renderStatus() {
  const draft = selectedDraft();
  const lastSummary = state.game.lastRoundSummary;

  turnEl.textContent = state.game.phase === PHASES.GAME_OVER
    ? `Result: ${winnerText()}`
    : `Turn: ${roleLabel(state.game.turn)} (${playerLabel(state.game.turn)})`;
  statusEl.textContent = statusText(draft);
  substatusEl.textContent = lastSummary
    ? `Latest wall-tiling: ${formatRoundSummary(lastSummary, {
      humanPlayerIndex: state.mode === MODE.HVC ? state.humanSide : null,
      computerPlayerIndex: state.mode === MODE.HVC ? otherSeat(state.humanSide) : null
    })}`
    : 'Completed pattern lines will score automatically at the end of the draft round.';

  roundEl.textContent = String(state.game.round);
  phaseEl.textContent = phaseLabel();
  currentPlayerEl.textContent = roleLabel(state.game.turn);
  nextStarterEl.textContent = playerLabel(state.game.nextStartPlayer);
  roundSummaryEl.textContent = `Factories: ${state.game.factories.length} displays in play · Center tiles: ${state.game.center.tiles.length}`;
  seatSummaryEl.textContent = state.mode === MODE.HVC
    ? `You are ${playerLabel(state.humanSide)}. ${playerLabel(otherSeat(state.humanSide))} is computer-controlled.`
    : 'Both player boards are controlled locally on the same device.';
  selectionSummaryEl.textContent = draft
    ? `${sourceLabel(draft)} selected: ${draft.count} ${COLOR_META[draft.color].label.toLowerCase()}${draft.takesStartMarker ? ' plus the first-player marker' : ''}.`
    : 'Choose a factory or the center.';
  reasonSummaryEl.textContent = state.reasonMessage || (draft ? 'Legal rows show fit and overflow hints.' : '');
  bagCountEl.textContent = String(state.game.bag.length);
  discardCountEl.textContent = String(state.game.discard.length);

  thinkingEl.classList.toggle('hidden', !(state.mode === MODE.HVC && state.isThinking));
  bannerEl.classList.toggle('hidden', !(lastSummary || state.game.phase === PHASES.GAME_OVER));
  bannerEl.textContent = state.game.phase === PHASES.GAME_OVER
    ? winnerText()
    : lastSummary
      ? `Round ${lastSummary.round} wall-tiling resolved. ${formatRoundSummary(lastSummary, {
        humanPlayerIndex: state.mode === MODE.HVC ? state.humanSide : null,
        computerPlayerIndex: state.mode === MODE.HVC ? otherSeat(state.humanSide) : null
      })}`
      : '';

  modeEl.value = state.mode;
  seatEl.value = String(state.humanSide);
  difficultyEl.value = state.difficulty;
  seatEl.disabled = state.mode !== MODE.HVC || state.isThinking;
  difficultyEl.disabled = state.mode !== MODE.HVC || state.isThinking;
  undoEl.disabled = !canUndo();
}

function render() {
  renderFactories();
  renderBoards();
  renderHistory();
  renderStatus();
  arenaEl.dataset.turn = String(state.game.turn);
}

function clearSelection() {
  state.selectedDraftKey = null;
}

function executeMove(move, { triggerAI = true } = {}) {
  pushSnapshot();
  state.game = applyMove(state.game, move);
  clearSelection();
  state.reasonMessage = '';
  render();

  if (triggerAI) {
    maybeAIMove();
  }
}

function maybeAIMove() {
  if (state.mode !== MODE.HVC || state.game.phase === PHASES.GAME_OVER) return;
  if (state.game.turn === state.humanSide) return;

  cancelPendingAI();
  const requestId = state.aiRequestId;
  state.isThinking = true;
  clearSelection();
  state.reasonMessage = '';
  render();

  window.setTimeout(() => {
    if (requestId !== state.aiRequestId) return;

    let move = null;

    try {
      move = chooseAIMove(state.game, state.game.turn, state.difficulty);
    } catch (error) {
      state.isThinking = false;
      render();
      console.error('Azul AI move failed.', error);
      return;
    }

    if (requestId !== state.aiRequestId) return;
    state.isThinking = false;

    if (move && isMoveLegal(state.game, move, state.game.turn)) {
      executeMove(move, { triggerAI: false });
      return;
    }

    render();
  }, prefersReducedMotion ? 110 : 240);
}

function resetGame() {
  cancelPendingAI();
  state.game = createInitialState({ seed: makeSeed() });
  state.snapshots = [];
  state.reasonMessage = '';
  clearSelection();
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
  state.reasonMessage = '';
  clearSelection();
  render();
}

function handleSourceSelection(button) {
  if (!isHumanTurn() || state.isThinking) return;

  const options = getDraftOptions(state.game);
  const key = [
    button.dataset.sourceKind,
    button.dataset.sourceIndex ?? 'CENTER',
    button.dataset.color
  ].join(':');
  const draft = options.find((option) => draftKey(option) === key);

  if (!draft) return;

  state.reasonMessage = '';
  state.selectedDraftKey = state.selectedDraftKey === key ? null : key;
  render();
}

function handleDestinationSelection(button) {
  if (!isHumanTurn() || state.isThinking) return;

  const playerIndex = Number(button.dataset.player);
  if (playerIndex !== state.game.turn) {
    state.reasonMessage = 'Only the active player board can receive tiles right now.';
    render();
    return;
  }

  const draft = selectedDraft();
  if (!draft) {
    state.reasonMessage = 'Choose a factory or the center before selecting a destination.';
    render();
    return;
  }

  const placementOptions = getPlacementOptions(state.game, playerIndex, draft);
  const row = button.dataset.row ? Number(button.dataset.row) : null;
  const placement = placementOptions.find((option) =>
    option.destination.kind === button.dataset.destinationKind &&
    (option.destination.row ?? null) === row
  );

  if (!placement?.isLegal) {
    state.reasonMessage = placement?.reason || button.dataset.reason || 'That destination is blocked.';
    render();
    return;
  }

  executeMove({
    draft,
    destination: { ...placement.destination }
  });
}

function wireEvents() {
  factoriesEl.addEventListener('click', (event) => {
    const button = event.target.closest('.azul-source-button');
    if (!button) return;
    handleSourceSelection(button);
  });

  centerEl.addEventListener('click', (event) => {
    const button = event.target.closest('.azul-source-button');
    if (!button) return;
    handleSourceSelection(button);
  });

  boardsEl.addEventListener('click', (event) => {
    const button = event.target.closest('.azul-pattern-line');
    if (!button) return;
    handleDestinationSelection(button);
  });

  modeEl.addEventListener('change', () => {
    state.mode = modeEl.value;
    resetGame();
  });

  seatEl.addEventListener('change', () => {
    state.humanSide = Number(seatEl.value);
    resetGame();
  });

  difficultyEl.addEventListener('change', () => {
    state.difficulty = difficultyEl.value;
    state.reasonMessage = '';
    render();
  });

  newGameEl.addEventListener('click', resetGame);
  undoEl.addEventListener('click', undoMove);
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

function init() {
  wireEvents();
  setupHelpTabs();
  render();
  maybeAIMove();
}

init();

window.azulDebug = {
  state,
  resetGame,
  undoMove
};
