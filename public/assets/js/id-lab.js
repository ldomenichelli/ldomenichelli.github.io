import { estimateAll, estimateCorrelation, essStatistic, estimateEssDimension, expectedSimplexSkewness, essPairTerms } from './id-estimator.js';
import { ID_DATASETS, ID_DEFAULTS, generateIdData } from './id-data.js';

const METHODS = {
  mle: { name: 'Levina–Bickel MLE', short: 'MLE', scope: 'Local distance ratios', diagnostic: 'Local estimates, across the sample' },
  ess: { name: 'Expected Simplex Skewness', short: 'ESSa', scope: 'Local angles', diagnostic: 'From simplex skewness to dimension' },
  twonn: { name: 'Two nearest neighbours', short: 'TwoNN', scope: 'First / second neighbour ratio', diagnostic: 'The TwoNN log-CDF fit' },
  correlation: { name: 'Correlation dimension', short: 'Correlation', scope: 'Pair counts across scales', diagnostic: 'The correlation integral' },
  pca: { name: 'PCA participation ratio', short: 'PCA', scope: 'Effective linear dimension', diagnostic: 'Where the variance lives' }
};
const COLORS = { ink: '#253b35', muted: '#626f68', sage: '#597a62', light: '#d9e3d6', orange: '#c67d4d', grid: '#e5e6dc', red: '#a2554b', cream: '#fcfbf6' };
const LIMITS = { n: [80, 480], k: [4, 48], noise: [0, 0.12], outliers: [0, 0.3], boundary: [0, 0.18], duplicates: [0, 0.15], dimension: [2, 8], seed: [1, 2147483646], correlationLow: [0.005, 0.15], correlationHigh: [0.02, 0.5] };
const DATA_KEYS = new Set(['dataset', 'n', 'noise', 'outliers', 'boundary', 'duplicates', 'dimension', 'seed']);
const INTEGERS = new Set(['n', 'k', 'dimension', 'seed']);
const KEYS = Object.keys(ID_DEFAULTS);
const NS = 'http://www.w3.org/2000/svg';
const number = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const percent = value => `${Math.round(value * 100)}%`;
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

export function readIdState(search = location.search) {
  const params = new URLSearchParams(search);
  const state = { ...ID_DEFAULTS };
  for (const key of KEYS) {
    if (!params.has(key)) continue;
    if (key === 'dataset') {
      if (Object.hasOwn(ID_DATASETS, params.get(key))) state.dataset = params.get(key);
      continue;
    }
    const value = Number(params.get(key));
    if (!Number.isFinite(value)) continue;
    const [min, max] = LIMITS[key];
    state[key] = Math.min(max, Math.max(min, INTEGERS.has(key) ? Math.round(value) : value));
  }
  if (state.correlationLow >= state.correlationHigh) state.correlationLow = state.correlationHigh - 0.005;
  return state;
}

function rangeControl(name, label, min, max, step, hint = '') {
  return `<label class="id-control" for="id-${name}"><span class="id-control-heading"><span>${label}</span><output class="id-control-value" data-output="${name}" for="id-${name}"></output></span><input id="id-${name}" name="${name}" type="range" min="${min}" max="${max}" step="${step}">${hint ? `<small class="id-small">${hint}</small>` : ''}</label>`;
}

function svgNode(tag, attrs = {}, content = '') {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  if (content) element.textContent = content;
  return element;
}

function chart(svg, { xmin = 0, xmax = 1, ymin = 0, ymax = 1, xlabel, ylabel, integerX = false, xticks = null }) {
  svg.replaceChildren();
  if (xmin === xmax) xmax = xmin + 1;
  if (ymin === ymax) ymax = ymin + 1;
  const width = Number(svg.getAttribute('viewBox').split(' ')[2]);
  const bounds = { left: 49, right: width - 20, top: 26, bottom: 204 };
  const x = value => bounds.left + (value - xmin) / (xmax - xmin) * (bounds.right - bounds.left);
  const y = value => bounds.bottom - (value - ymin) / (ymax - ymin) * (bounds.bottom - bounds.top);
  for (let i = 0; i <= 4; i += 1) {
    const yv = ymin + (ymax - ymin) * i / 4;
    svg.append(svgNode('line', { x1: bounds.left, x2: bounds.right, y1: y(yv), y2: y(yv), stroke: COLORS.grid }));
    svg.append(svgNode('text', { x: bounds.left - 10, y: y(yv) + 4, 'text-anchor': 'end', fill: COLORS.muted, 'font-size': 11 }, Math.abs(yv) > 99 ? number(yv, 0) : number(yv, 1)));
  }
  for (const xv of xticks || Array.from({ length: 5 }, (_, i) => xmin + (xmax - xmin) * i / 4)) svg.append(svgNode('text', { x: x(xv), y: bounds.bottom + 20, 'text-anchor': 'middle', fill: COLORS.muted, 'font-size': 11 }, number(xv, integerX ? 0 : 1)));
  svg.append(svgNode('text', { x: bounds.left, y: 13, fill: COLORS.muted, 'font-size': 11 }, ylabel || ''));
  svg.append(svgNode('text', { x: (bounds.left + bounds.right) / 2, y: 251, 'text-anchor': 'middle', fill: COLORS.muted, 'font-size': 12 }, xlabel || ''));
  return { x, y, bounds };
}

function plotLine(svg, points, { x, y }, color = COLORS.sage, width = 2, dashed = false) {
  if (!points.length) return;
  svg.append(svgNode('path', { d: points.map((point, index) => `${index ? 'L' : 'M'}${x(point[0])},${y(point[1])}`).join(' '), fill: 'none', stroke: color, 'stroke-width': width, ...(dashed ? { 'stroke-dasharray': '5 4' } : {}) }));
}

export class IdLab {
  constructor(root) {
    this.root = root;
    this.method = Object.hasOwn(METHODS, root.dataset.method) ? root.dataset.method : 'compare';
    this.state = readIdState();
    this.selected = 0;
    this.view = 'perspective';
    this.generation = 0;
    this.resultCache = new Map();
    this.pairA = 0;
    this.pairB = 1;
    this.renderShell();
    this.bindEvents();
    this.update(true);
    this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { this.drawScatter(); if (this.results) this.renderDiagnostic(); }) : null;
    this.resizeObserver?.observe(this.canvas);
  }

  renderShell() {
    const isLocal = ['compare', 'mle', 'ess'].includes(this.method);
    this.root.classList.add('id-lab');
    this.root.innerHTML = `
      <div class="id-lab-toolbar">
        <label class="id-dataset-label" for="id-dataset"><span class="id-small">Choose a geometry</span><select id="id-dataset" name="dataset">${Object.entries(ID_DATASETS).map(([key, data]) => `<option value="${key}">${data.name}</option>`).join('')}</select></label>
        <div class="id-toolbar-actions"><button class="id-button" type="button" data-action="regenerate">New sample <span aria-hidden="true">↻</span></button><button class="id-button id-button-secondary" type="button" data-action="reset">Reset</button><button class="id-button id-button-secondary" type="button" data-action="share">Copy experiment link</button></div>
      </div>
      <div class="id-lab-grid">
        <aside class="id-control-panel" aria-label="Experiment parameters">
          <div class="id-panel-heading"><h3>Shape the experiment</h3><span class="id-chip" data-seed></span></div>
          <p class="id-small" data-dataset-description></p>
          <label class="id-control" data-dimension-control hidden><span class="id-control-heading">Ball dimension</span><select name="dimension" aria-label="Ball dimension">${Array.from({ length: 7 }, (_, i) => `<option value="${i + 2}">${i + 2} dimensions</option>`).join('')}</select></label>
          ${rangeControl('n', 'Sample size', 80, 480, 20)}
          ${rangeControl('k', isLocal ? 'Neighbours · k' : 'Inspector neighbours · k', 4, 48, 1, isLocal ? 'MLE and ESS use k. Other estimators use the whole sample.' : 'Changes the selected neighbourhood, not this estimator.')}
          ${rangeControl('noise', 'Gaussian noise · σ', 0, 0.12, 0.005, 'Added independently to every ambient coordinate.')}
          <details class="id-advanced"><summary>Stress-test the assumptions</summary>
            ${rangeControl('outliers', 'Outlier probability', 0, 0.3, 0.01, 'Replace samples with a wider uniform cloud.')}
            ${rangeControl('boundary', 'Boundary cut', 0, 0.18, 0.01, 'Truncate the clean generator before noise or outliers; retain N.')}
            ${rangeControl('duplicates', 'Exact duplicates', 0, 0.15, 0.01, 'Copy existing points; zero distances can invalidate ratios.')}
            <label class="id-control"><span class="id-control-heading">Random seed</span><input name="seed" type="number" min="1" max="2147483646" step="1"><small class="id-small">Use the same seed to reproduce an experiment.</small></label>
          </details>
          ${['correlation', 'compare'].includes(this.method) ? `<details class="id-advanced"><summary>Correlation fit interval</summary>${rangeControl('correlationLow', 'Lower distance percentile', 0.005, 0.15, 0.005, 'Choose the scale range using all pair distances.')}${rangeControl('correlationHigh', 'Upper distance percentile', 0.02, 0.5, 0.005, 'The bounds stay ordered. Changing the fit preserves the sample.')}</details>` : ''}
          <p class="id-small id-reproducibility">The seed fixes the sample. Changing k keeps every point in place.</p>
        </aside>
        <div class="id-plot-panel">
          <div class="id-panel-heading"><div><span class="id-small">Explore the sample</span><h3 data-plot-title>One point, one neighbourhood</h3></div><div class="id-view-switch" aria-label="Projection">${['perspective', 'xy', 'xz', 'yz'].map((view, i) => `<button type="button" class="id-view-button" data-view="${view}" aria-pressed="${i === 0}">${view === 'perspective' ? '3D' : view.toUpperCase()}</button>`).join('')}</div></div>
          <div class="id-scatter-wrap"><canvas data-scatter tabindex="0" role="img" aria-label="Interactive projected sample. Click to select a point, or use arrow keys, Home and End."></canvas></div>
          <div class="id-plot-legend"><span><i style="background:${COLORS.orange}"></i>Selected point</span><span><i style="background:${COLORS.sage}"></i>Nearest neighbours</span><span><i style="background:#b4beb4"></i>Other samples</span></div>
          <p class="id-small" data-projection-note></p>
          <div class="id-selection-row"><button type="button" class="id-button id-button-secondary" data-action="previous" aria-label="Select previous point">←</button><p class="id-point-status" data-point-status aria-live="polite"></p><button type="button" class="id-button id-button-secondary" data-action="next" aria-label="Select next point">→</button></div>
        </div>
      </div>
      <div class="id-analysis-grid">
        <div class="id-result-panel"><span class="id-small" data-result-label></span><div class="id-estimate-value" data-estimate aria-live="polite">—</div><p class="id-result-meta" data-result-meta></p><div class="id-stat-grid" data-stat-grid></div><p class="id-notice" data-notice role="status"></p></div>
        <div class="id-diagnostic-panel"><div class="id-panel-heading"><h3 data-diagnostic-title></h3><span class="id-chip" data-diagnostic-tag></span></div><svg data-diagnostic class="id-diagnostic" viewBox="0 0 600 260" role="img" aria-label="Estimator diagnostic chart"></svg><p class="id-small" data-diagnostic-caption></p></div>
      </div>
      <div class="id-method-results"><div class="id-panel-heading"><div><span class="id-small">Five methods · exactly the same points</span><h3>Compare the estimates</h3></div></div><div class="id-table-wrap"><table><thead><tr><th scope="col">Estimator</th><th scope="col">Dimension</th><th scope="col">What it measures</th><th scope="col">Diagnostics</th></tr></thead><tbody data-method-results></tbody></table></div><p class="id-small">PCA measures global linear spread: a curved manifold can need more linear axes than its intrinsic dimension. These are point estimates, not confidence intervals.</p></div>
      <div data-inspector></div>
      <div class="id-export-row"><span class="id-small" data-sample-summary></span><button class="id-button id-button-secondary" type="button" data-action="export">Download results · CSV</button><span class="id-small" data-action-status aria-live="polite"></span></div>`;
    this.canvas = this.root.querySelector('[data-scatter]');
    this.svg = this.root.querySelector('[data-diagnostic]');
    this.root.querySelector('.id-lab-grid').prepend(this.root.querySelector('.id-plot-panel'));
  }

  bindEvents() {
    this.root.addEventListener('input', event => {
      const key = event.target.name;
      if (!KEYS.includes(key)) return;
      if (key === 'dataset') this.state[key] = event.target.value;
      else {
        const value = Number(event.target.value);
        if (event.target.value === '' || !Number.isFinite(value)) return;
        const [min, max] = LIMITS[key];
        this.state[key] = Math.min(max, Math.max(min, INTEGERS.has(key) ? Math.round(value) : value));
      }
      if (key === 'correlationLow' && this.state.correlationLow >= this.state.correlationHigh) this.state.correlationHigh = this.state.correlationLow + 0.005;
      if (key === 'correlationHigh' && this.state.correlationHigh <= this.state.correlationLow) this.state.correlationLow = this.state.correlationHigh - 0.005;
      this.syncControls();
      this.scheduleUpdate(DATA_KEYS.has(key));
    });
    this.root.addEventListener('change', event => {
      if (event.target.name === 'pairA' || event.target.name === 'pairB') {
        this[event.target.name] = Number(event.target.value);
        this.renderPairInspector();
        this.drawScatter();
      }
    });
    this.root.addEventListener('click', async event => {
      const view = event.target.closest('[data-view]');
      if (view) {
        this.view = view.dataset.view;
        this.root.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button === view)));
        this.drawScatter();
        return;
      }
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      if (action === 'regenerate') { this.state.seed = this.state.seed % 2147483646 + 1; this.flushUpdate(true); }
      if (action === 'reset') {
        this.state = { ...ID_DEFAULTS }; this.selected = 0; this.pairA = 0; this.pairB = 1; this.view = 'perspective';
        this.root.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === this.view)));
        this.flushUpdate(true);
      }
      if (action === 'previous' || action === 'next') this.select(this.selected + (action === 'next' ? 1 : -1));
      if (action === 'share') {
        this.flushPending();
        try {
          await navigator.clipboard.writeText(location.href);
          this.setText('[data-action-status]', 'Experiment link copied.');
        } catch {
          const field = document.createElement('input');
          field.type = 'text'; field.readOnly = true; field.value = location.href; field.setAttribute('aria-label', 'Experiment link to copy');
          this.root.querySelector('[data-action-status]').replaceChildren(field);
          field.select();
        }
      }
      if (action === 'export') { this.flushPending(); this.exportCsv(); }
    });
    this.canvas.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? this.data.points.length - 1 : this.selected + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1);
      this.select(next);
    });
    this.canvas.addEventListener('click', event => {
      if (!this.projected?.length) return;
      const rect = this.canvas.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      let nearest = 0;
      let distance = Infinity;
      this.projected.forEach((point, index) => {
        const candidate = Math.hypot(point.x - clickX, point.y - clickY);
        if (candidate < distance) { nearest = index; distance = candidate; }
      });
      this.select(nearest);
      this.canvas.focus({ preventScroll: true });
    });
    window.addEventListener('popstate', () => { this.state = readIdState(); this.flushUpdate(true); });
  }

  setText(selector, value) { this.root.querySelector(selector).textContent = value; }

  syncControls() {
    for (const key of KEYS) {
      const input = this.root.querySelector(`[name="${key}"]`);
      if (input) input.value = String(this.state[key]);
      const output = this.root.querySelector(`[data-output="${key}"]`);
      if (output) output.textContent = key.startsWith('correlation') ? `${number(this.state[key] * 100, 1)}%` : ['outliers', 'duplicates'].includes(key) ? percent(this.state[key]) : key === 'noise' ? number(this.state[key], 3) : key === 'boundary' ? number(this.state[key], 2) : String(this.state[key]);
    }
    this.root.querySelector('[data-dimension-control]').hidden = this.state.dataset !== 'ball';
    this.setText('[data-seed]', `Seed ${this.state.seed}`);
    this.setText('[data-dataset-description]', ID_DATASETS[this.state.dataset].description);
  }

  scheduleUpdate(regenerate) {
    clearTimeout(this.timer);
    this.pendingRegenerate = this.pendingRegenerate || regenerate;
    this.root.setAttribute('aria-busy', 'true');
    this.timer = setTimeout(() => this.flushPending(), 110);
  }

  flushPending() {
    if (!this.timer) return;
    clearTimeout(this.timer); this.timer = null;
    const regenerate = this.pendingRegenerate;
    this.pendingRegenerate = false;
    this.update(regenerate);
  }

  flushUpdate(regenerate) {
    clearTimeout(this.timer); this.timer = null;
    this.pendingRegenerate = false;
    this.update(regenerate);
  }

  update(regenerate) {
    this.syncControls();
    try {
      if (regenerate || !this.data) {
        this.data = generateIdData(this.state);
        this.resultCache.clear();
        this.cache = null;
        this.generation += 1;
      }
      const cacheKey = `${this.state.k}:${this.state.correlationLow}:${this.state.correlationHigh}`;
      if (!this.resultCache.has(cacheKey)) {
        const correlationOptions = { lowerQuantile: this.state.correlationLow, upperQuantile: this.state.correlationHigh };
        const priorForK = [...this.resultCache.entries()].find(([key]) => key.startsWith(`${this.state.k}:`))?.[1];
        const results = priorForK ? { ...priorForK, correlation: estimateCorrelation(this.data.points, { cache: this.cache, ...correlationOptions }) } : estimateAll(this.data.points, this.state.k, { ...(this.cache ? { cache: this.cache } : {}), correlation: correlationOptions });
        this.cache = results.cache;
        this.resultCache.set(cacheKey, results);
      }
      this.results = this.resultCache.get(cacheKey);
      this.selected = Math.min(this.selected, this.data.points.length - 1);
      this.updateUrl();
      this.renderResults();
      this.select(this.selected, false);
      this.root.dataset.ready = 'true';
      this.root.dataset.generation = String(this.generation);
      this.root.dispatchEvent(new CustomEvent('idlab:updated', { bubbles: true, detail: { state: { ...this.state }, pointCount: this.data.points.length, selected: this.selected, values: Object.fromEntries(Object.keys(METHODS).map(key => [key, this.results[key].value])) } }));
    } catch (error) {
      this.setText('[data-estimate]', '—');
      this.setText('[data-notice]', `This experiment could not be computed. Try resetting the controls. ${error.message}`);
      this.root.dataset.ready = 'error';
      console.error('Intrinsic dimension lab:', error);
    } finally {
      this.root.removeAttribute('aria-busy');
    }
  }

  updateUrl() {
    const url = new URL(location.href);
    for (const key of KEYS) url.searchParams.set(key, String(this.state[key]));
    history.replaceState(null, '', url);
    document.querySelectorAll('a[href]').forEach(link => {
      const destination = new URL(link.href, location.href);
      if (destination.origin !== location.origin || !/^\/projects\/intrinsic-dimensionality\/(?:mle\/|ess\/|twonn\/|correlation\/|pca\/)?$/.test(destination.pathname)) return;
      for (const key of KEYS) destination.searchParams.set(key, String(this.state[key]));
      link.href = destination.href;
    });
  }

  statusFor(result, key) {
    if (!result.valid || !Number.isFinite(result.value)) return 'No valid estimate';
    if (key === 'mle' || key === 'ess') {
      const valid = result.localValues?.filter(Number.isFinite).length ?? this.data.points.length;
      return `${valid} / ${this.data.points.length} valid local fits`;
    }
    if (key === 'twonn') return `${result.fitPoints?.filter(point => point.inFit !== false).length ?? 0} fitted ratios${result.excludedCount ? ` · ${result.excludedCount} invalid ratios excluded` : ''} · R² ${number(result.r2, 3)}`;
    if (key === 'correlation') return `R² ${number(result.r2, 3)} · selected scale range`;
    return `${result.rank95 ?? '—'} axes retain 95% variance`;
  }

  renderResults() {
    const selectedMethod = this.method === 'compare' ? 'mle' : this.method;
    const result = this.results[selectedMethod];
    this.setText('[data-result-label]', this.method === 'compare' ? 'Start with a local estimate · MLE' : selectedMethod === 'pca' ? 'Effective linear dimension' : 'Estimated intrinsic dimension');
    this.setText('[data-estimate]', result.valid ? number(result.value) : '—');
    this.setText('[data-result-meta]', selectedMethod === 'pca' ? 'PCA participation ratio · global covariance' : `${METHODS[selectedMethod].name} · ${this.statusFor(result, selectedMethod)}`);
    this.root.querySelector('[data-stat-grid]').innerHTML = `<div><span class="id-small">Underlying manifold</span><strong>${this.data.dimension}D</strong></div><div><span class="id-small">Ambient coordinates</span><strong>${this.data.ambientDimension}D</strong></div><div><span class="id-small">Sample size</span><strong>${this.data.points.length}</strong></div><div><span class="id-small">Neighbourhood</span><strong>k = ${this.state.k}</strong></div>`;
    const warnings = [];
    if (this.state.noise > 0) warnings.push('Noise adds variation in every ambient coordinate; the underlying manifold label describes the clean generator.');
    if (this.data.outlierIndices.size) warnings.push(`${this.data.outlierIndices.size} samples were replaced by outliers.`);
    if (this.data.duplicateIndices.size) warnings.push(`${this.data.duplicateIndices.size} exact copies create zero distances. Invalid local ratios are excluded; read each method’s valid count.`);
    if (this.state.boundary > 0) warnings.push(`The clean generator is cut at x₁ ≥ ${number(-1 + this.state.boundary * 6)} before noise and outliers, which can cross that boundary. Edge effects can bias local estimates.`);
    if (selectedMethod === 'ess' && result.aboveRangeCount) warnings.push(`${result.aboveRangeCount} local skewness values exceed the inverse curve’s 24D limit and are excluded, rather than clamped to 24.`);
    if (!result.valid) warnings.push('The current sample does not support a valid estimate for this method.');
    if (!warnings.length) warnings.push('Finite samples, curvature, boundaries and neighbourhood size can move an estimate away from the generating dimension.');
    this.setText('[data-notice]', warnings.join(' '));
    this.root.querySelector('[data-method-results]').innerHTML = Object.entries(METHODS).map(([key, method]) => `<tr${key === this.method ? ' class="is-current"' : ''}><th scope="row"><a href="/projects/intrinsic-dimensionality/${key}/">${method.short}${key === this.method ? ' <span aria-label="current method">↗</span>' : ''}</a></th><td class="id-table-number">${this.results[key].valid ? number(this.results[key].value) : '—'}</td><td>${method.scope}</td><td class="id-small">${escape(this.statusFor(this.results[key], key))}</td></tr>`).join('');
    this.setText('[data-sample-summary]', `Reproducible sample · seed ${this.state.seed} · all distances use ${this.data.ambientDimension} coordinates.`);
    this.updateUrl();
  }

  select(index, announce = true) {
    if (!this.data) return;
    this.selected = (index + this.data.points.length) % this.data.points.length;
    this.neighbours = this.cache[this.selected].slice(0, this.state.k);
    const radius = this.neighbours.at(-1)?.distance;
    const localMethod = this.method === 'ess' ? 'ess' : 'mle';
    const localValue = this.results[localMethod].localValues?.[this.selected];
    this.setText('[data-point-status]', `Point ${this.selected + 1} of ${this.data.points.length} · rₖ ${number(radius, 3)}${['mle', 'ess', 'compare'].includes(this.method) ? ` · local ${METHODS[localMethod].short} ${number(localValue)}` : ''}`);
    this.renderInspector();
    this.renderDiagnostic();
    this.drawScatter();
    if (announce) this.root.dispatchEvent(new CustomEvent('idlab:selection', { bubbles: true, detail: { selected: this.selected } }));
  }

  rawProject(point) {
    const [x = 0, y = 0, z = 0] = point;
    if (this.view === 'xy') return { x, y, z };
    if (this.view === 'xz') return { x, y: z, z: y };
    if (this.view === 'yz') return { x: y, y: z, z: x };
    const a = 0.7;
    const elevation = 0.35;
    return { x: x * Math.cos(a) + z * Math.sin(a), y: y * Math.cos(elevation) + (z * Math.cos(a) - x * Math.sin(a)) * Math.sin(elevation), z: z * Math.cos(a) - x * Math.sin(a) };
  }

  drawScatter() {
    if (!this.data || !this.neighbours) return;
    const context = this.canvas.getContext('2d');
    if (!context) return;
    const width = Math.max(240, this.canvas.getBoundingClientRect().width || 640);
    const height = Math.round(Math.max(270, Math.min(430, width / 1.55)));
    this.canvas.style.height = `${height}px`;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) { this.canvas.width = Math.round(width * ratio); this.canvas.height = Math.round(height * ratio); }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const projections = this.data.points.map(point => this.rawProject(point));
    const xs = projections.map(point => point.x);
    const ys = projections.map(point => point.y);
    const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
    const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
    const scale = Math.min((width - 80) / Math.max(xmax - xmin, 0.8), (height - 64) / Math.max(ymax - ymin, 0.8));
    const screen = point => { const projected = this.rawProject(point); return { x: width / 2 + (projected.x - cx) * scale, y: height / 2 - (projected.y - cy) * scale, z: projected.z }; };
    this.projected = this.data.points.map(screen);
    const origin = screen([0, 0, 0]);
    context.save();
    context.strokeStyle = COLORS.grid; context.lineWidth = 1;
    context.beginPath(); context.moveTo(22, origin.y); context.lineTo(width - 22, origin.y); context.moveTo(origin.x, 22); context.lineTo(origin.x, height - 22); context.stroke();
    // All three basis vectors use the same scale; a perspective view here is orthographic.
    const axisOrigin = { x: 42, y: height - 38 };
    ['x₁', 'x₂', 'x₃'].forEach((label, axis) => {
      const vector = [0, 0, 0]; vector[axis] = 1;
      const projected = this.rawProject(vector);
      if (Math.hypot(projected.x, projected.y) < 0.01) return;
      context.strokeStyle = COLORS.muted; context.fillStyle = COLORS.muted; context.lineWidth = 1;
      const end = { x: axisOrigin.x + projected.x * 24, y: axisOrigin.y - projected.y * 24 };
      context.beginPath(); context.moveTo(axisOrigin.x, axisOrigin.y); context.lineTo(end.x, end.y); context.stroke();
      context.font = '11px system-ui'; context.fillText(label, end.x + 3, end.y - 3);
    });
    const point = this.projected[this.selected];
    const neighbourSet = new Set(this.neighbours.map(item => item.index));
    context.strokeStyle = 'rgba(89, 122, 98, 0.23)'; context.lineWidth = 1;
    for (const neighbour of this.neighbours) {
      const projected = this.projected[neighbour.index];
      context.beginPath(); context.moveTo(point.x, point.y); context.lineTo(projected.x, projected.y); context.stroke();
    }
    const order = this.projected.map((projection, index) => ({ ...projection, index })).sort((a, b) => a.z - b.z);
    for (const projected of order) {
      if (projected.index === this.selected) continue;
      const isNeighbour = neighbourSet.has(projected.index);
      context.fillStyle = isNeighbour ? COLORS.sage : '#aebaae';
      context.globalAlpha = isNeighbour ? 1 : 0.65;
      context.beginPath(); context.arc(projected.x, projected.y, isNeighbour ? 4.2 : 3, 0, Math.PI * 2); context.fill();
      if (this.data.outlierIndices.has(projected.index)) { context.strokeStyle = COLORS.red; context.lineWidth = 1; context.beginPath(); context.arc(projected.x, projected.y, 5.5, 0, Math.PI * 2); context.stroke(); }
    }
    context.globalAlpha = 1;
    if (this.method === 'ess' && this.essLocal) {
      const centroid = screen(this.essLocal.centroid);
      const neighbourhood = [this.selected, ...this.neighbours.map(neighbour => neighbour.index)];
      [this.pairA, this.pairB].forEach((pairIndex, i) => {
        const target = this.projected[neighbourhood[pairIndex]];
        if (!target) return;
        context.strokeStyle = i ? '#64869b' : COLORS.orange; context.lineWidth = 2.5;
        context.beginPath(); context.moveTo(centroid.x, centroid.y); context.lineTo(target.x, target.y); context.stroke();
      });
      context.fillStyle = COLORS.ink; context.fillRect(centroid.x - 3, centroid.y - 3, 6, 6);
    }
    context.fillStyle = COLORS.cream; context.beginPath(); context.arc(point.x, point.y, 8.5, 0, Math.PI * 2); context.fill();
    context.fillStyle = COLORS.orange; context.beginPath(); context.arc(point.x, point.y, 5.5, 0, Math.PI * 2); context.fill();
    context.strokeStyle = COLORS.orange; context.lineWidth = 1.5; context.beginPath(); context.arc(point.x, point.y, 9, 0, Math.PI * 2); context.stroke();
    context.restore();
    const visible = this.view === 'perspective' ? 'Orthographic 3D view of coordinates 1–3' : `Projection onto coordinates ${this.view === 'xy' ? '1 and 2' : this.view === 'xz' ? '1 and 3' : '2 and 3'}`;
    this.setText('[data-projection-note]', `${visible}. Equal scale on displayed axes; neighbours are computed in all ${this.data.ambientDimension} coordinates.${this.data.ambientDimension > 3 ? ` ${this.data.ambientDimension - 3} coordinates are hidden in the 3D view.` : ''} Click a point or use arrow keys. Outliers have a rust outline.`);
    this.canvas.setAttribute('aria-label', `${ID_DATASETS[this.state.dataset].name}, ${this.data.points.length} samples. ${visible}. Point ${this.selected + 1} selected with ${this.neighbours.length} nearest neighbours in ${this.data.ambientDimension} dimensions. Click or use arrow keys, Home and End to select.`);
  }

  renderDiagnostic() {
    const width = Math.max(220, Math.round(this.svg.getBoundingClientRect().width || 600));
    this.svg.setAttribute('viewBox', `0 0 ${width} 260`);
    const method = this.method === 'compare' ? 'mle' : this.method;
    const result = this.results[method];
    this.setText('[data-diagnostic-title]', METHODS[method].diagnostic);
    this.setText('[data-diagnostic-tag]', method === 'ess' ? 'Selected neighbourhood' : 'Whole sample');
    this.svg.setAttribute('aria-label', METHODS[method].diagnostic);
    if (!result.valid && method !== 'ess') {
      this.svg.replaceChildren(svgNode('text', { x: width / 2, y: 130, 'text-anchor': 'middle', fill: COLORS.muted, 'font-size': 11 }, 'No valid diagnostic for this sample.'));
      this.setText('[data-diagnostic-caption]', 'Try fewer duplicates or a different sample.');
      return;
    }
    if (method === 'mle') this.drawMle(result);
    if (method === 'ess') this.drawEss();
    if (method === 'twonn') this.drawTwoNN(result);
    if (method === 'correlation') this.drawCorrelation(result);
    if (method === 'pca') this.drawPca(result);
  }

  drawMle(result) {
    const values = result.localValues.filter(Number.isFinite).sort((a, b) => a - b);
    if (!values.length) return;
    const xmax = Math.max(2, values[Math.floor((values.length - 1) * 0.97)] * 1.08);
    const bins = Array(22).fill(0);
    let overflow = 0;
    for (const value of values) {
      if (value > xmax) { overflow += 1; continue; }
      bins[Math.min(bins.length - 1, Math.floor(value / xmax * bins.length))] += 1;
    }
    const c = chart(this.svg, { xmax, ymax: Math.max(...bins, 1), xlabel: 'Local dimension estimate', ylabel: 'Number of samples' });
    bins.forEach((count, index) => this.svg.append(svgNode('rect', { x: c.x(index * xmax / bins.length) + 1, y: c.y(count), width: (c.bounds.right - c.bounds.left) / bins.length - 2, height: c.y(0) - c.y(count), rx: 2, fill: COLORS.light })));
    const local = result.localValues[this.selected];
    if (Number.isFinite(local) && local <= xmax) this.svg.append(svgNode('line', { x1: c.x(local), x2: c.x(local), y1: c.bounds.top, y2: c.bounds.bottom, stroke: COLORS.orange, 'stroke-width': 2 }));
    if (result.value <= xmax) this.svg.append(svgNode('line', { x1: c.x(result.value), x2: c.x(result.value), y1: c.bounds.top, y2: c.bounds.bottom, stroke: COLORS.sage, 'stroke-width': 2, 'stroke-dasharray': '4 4' }));
    this.setText('[data-diagnostic-caption]', `Each bar counts local MLE fits. Orange: selected sample. Dashed green: their arithmetic mean.${overflow ? ` ${overflow} extreme estimates beyond ${number(xmax)} are outside the displayed range, but remain in the mean.` : ''} Change k to see the bias–variance tradeoff.`);
  }

  drawEss() {
    const statistic = this.essLocal;
    const inversion = estimateEssDimension(statistic?.sHat, 24);
    const xmax = inversion.status === 'above-range' ? 24 : Number.isFinite(inversion.nHat) ? Math.min(24, Math.max(6, Math.ceil(inversion.nHat * 1.3))) : 12;
    const tickStep = xmax <= 8 ? 1 : xmax <= 16 ? 2 : 4;
    const xticks = [1, ...Array.from({ length: Math.floor(xmax / tickStep) }, (_, index) => (index + 1) * tickStep)].filter((value, index, values) => values.indexOf(value) === index);
    const curve = Array.from({ length: Math.ceil((xmax - 1) / 0.05) + 1 }, (_, index) => {
      const dimension = Math.min(xmax, 1 + index * 0.05);
      return [dimension, expectedSimplexSkewness(dimension)];
    });
    const c = chart(this.svg, { xmin: 1, xmax, ymin: 0, ymax: 1, xlabel: 'Dimension · d', ylabel: 'Expected skewness · S(d)', integerX: true, xticks });
    plotLine(this.svg, curve, c);
    if (Number.isFinite(statistic?.sHat)) {
      plotLine(this.svg, [[1, statistic.sHat], [xmax, statistic.sHat]], c, COLORS.orange, 1.5, true);
      if (Number.isFinite(inversion.nHat) && inversion.nHat <= xmax) this.svg.append(svgNode('circle', { cx: c.x(inversion.nHat), cy: c.y(statistic.sHat), r: 5, fill: COLORS.orange }));
    }
    this.setText('[data-diagnostic-caption]', `Selected neighbourhood: Ŝ = ${number(statistic?.sHat, 4)}; ${statistic?.pairs ?? 0} vector pairs. The orange line marks the selected skewness against the theoretical isotropic reference curve. The page estimate averages valid local inversions.${inversion.status && inversion.status !== 'ok' ? ` Inversion status: ${inversion.status.replaceAll('-', ' ')}.` : ''}`);
  }

  drawTwoNN(result) {
    const points = result.fitPoints.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
    const xmax = Math.max(...points.map(point => point.x), 0.1) * 1.04;
    const ymax = Math.max(...points.map(point => point.y), 0.1) * 1.04;
    const c = chart(this.svg, { xmax, ymax, xlabel: 'ln(r₂ / r₁)', ylabel: '−ln(1 − empirical CDF)' });
    plotLine(this.svg, [[0, 0], [Math.min(xmax, ymax / result.value), Math.min(xmax * result.value, ymax)]], c);
    points.forEach(point => this.svg.append(svgNode('circle', { cx: c.x(point.x), cy: c.y(point.y), r: 2.5, fill: point.inFit === false ? COLORS.light : COLORS.orange, opacity: 0.75 })));
    this.setText('[data-diagnostic-caption]', `The fitted line passes through the origin; its slope is ${number(result.value)}. The largest 10% of valid distance ratios are trimmed (pale dots); the final empirical-CDF point at F = 1 is omitted. R² = ${number(result.r2, 3)}. Zero first-neighbour distances are excluded; equal positive radii contribute a log-ratio of zero.`);
  }

  drawCorrelation(result) {
    const points = result.curve.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (!points.length) return;
    const c = chart(this.svg, { xmin: Math.min(...points.map(point => point.x)), xmax: Math.max(...points.map(point => point.x)), ymin: Math.min(...points.map(point => point.y)), ymax: Math.max(...points.map(point => point.y)), xlabel: 'ln(radius)', ylabel: 'ln C(radius)' });
    plotLine(this.svg, points.map(point => [point.x, point.y]), c, COLORS.light, 2);
    const fitted = points.filter(point => point.inFit);
    if (fitted.length) {
      const min = fitted[0].x, max = fitted.at(-1).x;
      plotLine(this.svg, [[min, result.value * min + result.intercept], [max, result.value * max + result.intercept]], c, COLORS.sage, 2.5);
    }
    points.forEach(point => this.svg.append(svgNode('circle', { cx: c.x(point.x), cy: c.y(point.y), r: point.inFit ? 3.5 : 2.5, fill: point.inFit ? COLORS.orange : COLORS.muted })));
    this.setText('[data-diagnostic-caption]', `C(r) is the fraction of unordered pairs separated by at most r. Orange points mark the fitted range ${number(result.range?.[0], 3)}–${number(result.range?.[1], 3)}; green line slope ${number(result.value)}. The range spans the ${number(this.state.correlationLow * 100, 1)}–${number(this.state.correlationHigh * 100, 1)} percentiles of all pair distances. Change it in “Correlation fit interval”; this heuristic need not identify an asymptotic scaling regime.`);
  }

  drawPca(result) {
    const variances = result.explainedVariance;
    const c = chart(this.svg, { xmin: 0.5, xmax: variances.length + 0.5, ymin: 0, ymax: 1, xlabel: 'Principal component', ylabel: 'Fraction of total variance', integerX: true, xticks: variances.map((_, index) => index + 1) });
    const width = Math.min(62, (c.bounds.right - c.bounds.left) / variances.length * 0.6);
    variances.forEach((variance, index) => {
      this.svg.append(svgNode('rect', { x: c.x(index + 1) - width / 2, y: c.y(variance), width, height: c.y(0) - c.y(variance), fill: index < result.rank95 ? COLORS.sage : COLORS.light, rx: 4 }));
      this.svg.append(svgNode('text', { x: c.x(index + 1), y: c.y(variance) - 6, 'text-anchor': 'middle', fill: COLORS.ink, 'font-size': 11 }, percent(variance)));
    });
    this.setText('[data-diagnostic-caption]', `Eigenvalues of the centred ${this.data.ambientDimension}D covariance, normalised to sum to one. Participation ratio: (Σλ)² / Σλ² = ${number(result.value)}. ${result.rank95} components retain 95% of variance. Curvature and unequal axis variances affect this global linear summary.`);
  }

  renderInspector() {
    const target = this.root.querySelector('[data-inspector]');
    const wasOpen = target.querySelector('details')?.open ?? false;
    if (['mle', 'compare'].includes(this.method)) {
      const radius = this.neighbours.at(-1)?.distance;
      const terms = this.neighbours.slice(0, -1).map((neighbour, index) => ({ rank: index + 1, ...neighbour, term: neighbour.distance > 0 && radius > 0 ? Math.log(radius / neighbour.distance) : NaN }));
      const valid = terms.every(term => Number.isFinite(term.term));
      const sum = valid ? terms.reduce((total, term) => total + term.term, 0) : NaN;
      target.innerHTML = `<details class="id-inspector"${wasOpen ? ' open' : ''}><summary>Open the calculation for point ${this.selected + 1}</summary><p>Local MLE = (k − 1) / Σⱼ ln(rₖ / rⱼ). Here rₖ = ${number(radius, 5)}, the sum is ${number(sum, 5)}, and the local estimate is <strong>${number(this.results.mle.localValues[this.selected])}</strong>.</p><div class="id-table-wrap"><table><thead><tr><th>Neighbour rank · j</th><th>Sample</th><th>Distance · rⱼ</th><th>ln(rₖ / rⱼ)</th></tr></thead><tbody>${terms.map(term => `<tr><td>${term.rank}</td><td>${term.index + 1}</td><td>${number(term.distance, 5)}</td><td>${number(term.term, 5)}</td></tr>`).join('')}</tbody></table></div><p class="id-small">The k-th radius is the reference. The sum uses the other k − 1 radii. Zero radii invalidate this local fit; no epsilon is substituted.</p></details>`;
    } else if (this.method === 'ess') {
      const neighbourhood = [this.selected, ...this.neighbours.map(neighbour => neighbour.index)];
      this.essLocal = essStatistic(neighbourhood.map(index => this.data.points[index]));
      this.pairA = Math.min(this.pairA, neighbourhood.length - 1);
      this.pairB = Math.min(this.pairB, neighbourhood.length - 1);
      target.innerHTML = `<details class="id-inspector"${wasOpen ? ' open' : ''}><summary>Inspect a simplex pair at point ${this.selected + 1}</summary><p>Each neighbourhood is centred at its own centroid. Inspect two of the ${neighbourhood.length} resulting vectors. Their orange and blue projections appear on the scatter plot; the dark square is the centroid.</p><div class="id-pair-controls">${['pairA', 'pairB'].map((name, i) => `<label class="id-control">Vector ${i ? 'b · blue' : 'a · orange'}<select name="${name}">${neighbourhood.map((index, local) => `<option value="${local}"${this[name] === local ? ' selected' : ''}>Sample ${index + 1}${index === this.selected ? ' (selected)' : ''}</option>`).join('')}</select></label>`).join('')}</div><div data-pair-terms></div><p class="id-small">ESS divides the sum of pair areas by the sum of products of lengths. It is a weighted angular statistic, not the mean of the displayed pair contributions. All products and angles use every ambient coordinate.</p></details>`;
      this.renderPairInspector();
    } else target.replaceChildren();
  }

  renderPairInspector() {
    const target = this.root.querySelector('[data-pair-terms]');
    if (!target || !this.essLocal) return;
    const vectors = this.essLocal.centered;
    const pair = essPairTerms(vectors[this.pairA], vectors[this.pairB]);
    const angle = pair.denominator > 0 ? Math.acos(Math.max(-1, Math.min(1, pair.dot / pair.denominator))) * 180 / Math.PI : NaN;
    target.innerHTML = `<div class="id-stat-grid"><div><span class="id-small">‖a‖ · ‖b‖</span><strong>${number(pair.ni, 3)} · ${number(pair.nj, 3)}</strong></div><div><span class="id-small">Dot product</span><strong>${number(pair.dot, 4)}</strong></div><div><span class="id-small">Angle in ${this.data.ambientDimension}D</span><strong>${number(angle, 1)}°</strong></div><div><span class="id-small">Parallelogram area</span><strong>${number(pair.area, 4)}</strong></div><div><span class="id-small">Area / (‖a‖‖b‖)</span><strong>${pair.denominator > 0 ? number(pair.contribution, 4) : 'Undefined'}</strong></div><div><span class="id-small">Neighbourhood Ŝ</span><strong>${number(this.essLocal.sHat, 4)}</strong></div></div>${this.pairA === this.pairB ? '<p class="id-notice">Choose two different vectors to inspect a pair used by ESS. A vector paired with itself has zero area and is excluded from the statistic.</p>' : ''}`;
  }

  exportCsv() {
    const header = ['dataset', 'underlying_dimension', 'ambient_dimension', 'sample_size', 'k', 'noise_sigma', 'outlier_probability', 'actual_outliers', 'boundary_cut', 'duplicate_fraction', 'seed', 'correlation_lower_quantile', 'correlation_upper_quantile', 'estimator', 'dimension_estimate', 'status'];
    const rows = [header, ...Object.entries(METHODS).map(([key]) => [this.state.dataset, this.data.dimension, this.data.ambientDimension, this.data.points.length, this.state.k, this.state.noise, this.state.outliers, this.data.outlierIndices.size, this.state.boundary, this.state.duplicates, this.state.seed, this.state.correlationLow, this.state.correlationHigh, key, this.results[key].valid ? this.results[key].value : '', this.statusFor(this.results[key], key)])];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `intrinsic-dimension-${this.state.dataset}-seed-${this.state.seed}.csv`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.setText('[data-action-status]', 'Results exported for all five methods.');
  }
}

document.querySelectorAll('[data-id-lab]').forEach(root => { root.idLab = new IdLab(root); });
