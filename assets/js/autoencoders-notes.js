(function () {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const NS = 'http://www.w3.org/2000/svg';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let moving = !reduced.matches;
  let lens = 'data';
  let blend = 0;
  let elapsed = 0;
  let lastTime = null;
  let frameId = null;
  let points = [];
  let scale = 85;
  const visibility = { scatter: true, encoder: false };
  const dots = [];
  const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
  const standardize = (values) => {
    const m = mean(values);
    const sd = Math.sqrt(mean(values.map(v => (v - m) ** 2)));
    return values.map(v => (v - m) / (sd || 1));
  };
  function correlation(xs, ys) {
    const a = standardize(xs), b = standardize(ys);
    const r = mean(a.map((v, i) => v * b[i]));
    return Math.abs(r) < .0005 ? '0.000' : r.toFixed(3);
  }
  for (let i = 0; i < 144; i++) {
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('r', String(2.1 + (i % 3) * .6));
    dot.setAttribute('fill', i % 2 ? '#456d53' : '#b5815a');
    dots.push(dot);
    $('#scatter-points').appendChild(dot);
  }
  $('#scatter-fallback').remove();
  function makeCloud() {
    const noise = Number($('#noise').value) / 100;
    const xs = [], ys = [];
    for (let i = 0; i < 72; i++) {
      const t = (i + .5) / 72;
      // Identical noise within each +/- pair preserves zero sample covariance.
      const jitter = (Math.sin(i * 127.1 + 3) + .5 * Math.sin(i * 43.7)) * .32 * noise;
      xs.push(-t, t);
      ys.push(t * t + jitter, t * t + jitter);
    }
    const x = standardize(xs), y = standardize(ys);
    const squared = standardize(x.map(v => v * v));
    points = x.map((value, i) => ({ x: value, y: y[i], squared: squared[i] }));
    scale = Math.min(91, 198 / Math.max(...y), 132 / Math.abs(Math.min(...y)));
    $('#noise-value').value = Math.round(noise * 100) + '%';
    $('#correlation-value').textContent = correlation(lens === 'nonlinear' ? squared : x, y);
    $('.covariance-disc').setAttribute('r', scale.toFixed(2));
    $('.covariance-cross').setAttribute('d', `M${300-scale-10} 245H${300+scale+10}M300 ${245-scale-10}V${245+scale+10}`);
    renderCloud();
  }
  const lensCopy = {
    data: ['There’s a relationship here.', 'Linear correlation', 'The dots follow a curve, even though their linear correlation is zero.'],
    pca: ['Same variance. No preferred direction.', 'Linear correlation', 'PCA sees equal variances and zero covariance. That summary doesn’t reveal the curve.'],
    nonlinear: ['A different feature reveals the pattern.', 'Correlation of x² and y', 'We supplied x² as a feature. The relationship becomes nearly linear; more noise makes it less clear.']
  };
  function chooseLens(next) {
    lens = next;
    $$('[data-lens]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lens === lens)));
    const copy = lensCopy[lens];
    $('#plot-annotation').textContent = copy[0];
    $('#correlation-label').textContent = copy[1];
    $('#lens-insight').textContent = copy[2];
    $('#scatter-x-label').textContent = lens === 'nonlinear' ? 'x²' : 'x';
    $('#scatter-title').textContent = lens === 'pca' ? 'A circular covariance summary hides the curved relationship' : lens === 'nonlinear' ? 'A supplied squared feature reveals an approximately linear relationship' : 'A curved relationship with zero linear correlation';
    if (!moving) blend = lens === 'nonlinear' ? 1 : 0;
    makeCloud();
    schedule();
  }
  function renderCloud() {
    const pca = lens === 'pca';
    $('#covariance-view').setAttribute('opacity', pca ? '1' : '0');
    $('#scatter-focus').setAttribute('opacity', pca ? '0' : '1');
    points.forEach((point, i) => {
      const x = point.x * (1 - blend) + point.squared * blend;
      dots[i].setAttribute('cx', (300 + x * scale).toFixed(2));
      dots[i].setAttribute('cy', (245 - point.y * scale).toFixed(2));
      dots[i].setAttribute('opacity', pca ? '.14' : String(.45 + (i % 5) * .1));
    });
    const index = (Math.floor(elapsed / 85) % 64 + 4) * 2;
    const a = points[index], b = points[index + 1];
    const ax = 300 + (a.x * (1 - blend) + a.squared * blend) * scale;
    const bx = 300 + (b.x * (1 - blend) + b.squared * blend) * scale;
    const y = 245 - a.y * scale;
    $('#focus-a').setAttribute('cx', ax); $('#focus-a').setAttribute('cy', y);
    $('#focus-b').setAttribute('cx', bx); $('#focus-b').setAttribute('cy', y);
    const line = $('#focus-line');
    line.setAttribute('x1', ax); line.setAttribute('x2', bx); line.setAttribute('y1', y); line.setAttribute('y2', y);
  }
  $$('[data-lens]').forEach(button => button.addEventListener('click', () => chooseLens(button.dataset.lens)));
  $('#noise').addEventListener('input', makeCloud);

  // A fixed orthonormal DCT encoder/decoder, used only as a compression sketch.
  const size = 8;
  const basis = Array.from({ length: size }, (_, frequency) => Array.from({ length: size }, (_, x) =>
    (frequency === 0 ? Math.sqrt(1 / size) : Math.sqrt(2 / size)) * Math.cos(Math.PI * (2 * x + 1) * frequency / (2 * size))));
  const order = [];
  for (let v = 0; v < size; v++) for (let u = 0; u < size; u++) order.push({ u, v });
  order.sort((a, b) => (a.u + a.v) - (b.u + b.v) || a.u - b.u);
  let pattern = 'ring';
  let pixels = [];
  let coefficients = [];
  let errorView = false;
  const inputCells = [], outputCells = [];
  function prepareMatrix(selector, cells) {
    $(selector).replaceChildren();
    for (let i = 0; i < 64; i++) {
      const cell = document.createElement('span');
      cell.setAttribute('aria-hidden', 'true');
      cells.push(cell); $(selector).appendChild(cell);
    }
  }
  prepareMatrix('#input-matrix', inputCells);
  prepareMatrix('#output-matrix', outputCells);
  function pixelColor(value, error) {
    const t = Math.max(0, Math.min(1, value));
    const low = [28, 48, 36], high = error ? [220, 139, 94] : [210, 225, 157];
    return `rgb(${low.map((v, i) => Math.round(v + (high[i] - v) * t)).join(',')})`;
  }
  function setPattern(next) {
    pattern = next;
    pixels = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const px = x - 3.5, py = y - 3.5;
      let value;
      if (pattern === 'ring') value = Math.exp(-((Math.hypot(px, py) - 2.45) ** 2) / .37);
      else if (pattern === 'diagonal') value = Math.exp(-((px - py) ** 2) / 1.2);
      else value = Math.max(Math.exp(-(px ** 2) / .55), Math.exp(-(py ** 2) / .55));
      pixels.push(.06 + .94 * value);
    }
    coefficients = order.map(({ u, v }) => {
      let coefficient = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) coefficient += pixels[y * size + x] * basis[u][x] * basis[v][y];
      return coefficient;
    });
    pixels.forEach((v, i) => { inputCells[i].style.backgroundColor = pixelColor(v, false); });
    $('#input-matrix').setAttribute('aria-label', `An eight by eight pixel image: ${pattern}`);
    $$('[data-pattern]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.pattern === pattern)));
    reconstruct();
  }
  function reconstruct() {
    const count = Number($('#bottleneck').value);
    const reconstructed = Array(64).fill(0);
    for (let k = 0; k < count; k++) {
      const { u, v } = order[k];
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) reconstructed[y * size + x] += coefficients[k] * basis[u][x] * basis[v][y];
    }
    const mse = mean(pixels.map((v, i) => (v - reconstructed[i]) ** 2));
    reconstructed.forEach((v, i) => {
      outputCells[i].style.backgroundColor = pixelColor(errorView ? Math.abs(pixels[i] - v) : v, errorView);
    });
    $('#reconstruction-error').textContent = mse.toFixed(4);
    $('#reconstruction-error').dataset.value = String(mse);
    $('#bottleneck-value').value = count;
    $('#code-count').textContent = count;
    $('#output-title').textContent = errorView ? 'Error map' : 'Reconstruction';
    $('#output-caption').textContent = errorView ? 'brighter = a larger pixel error' : 'an approximation of the input';
    $('#output-matrix').setAttribute('aria-label', `${errorView ? 'Pixel error map' : 'Reconstruction'} of the ${pattern} using ${count} code values. Mean squared error ${mse.toFixed(4)}.`);
    $('#code-bars').replaceChildren();
    for (let k = 0; k < Math.min(count, 32); k++) {
      const bar = document.createElement('span');
      bar.style.height = Math.min(20, 3 + Math.abs(coefficients[k]) * 10) + 'px';
      $('#code-bars').appendChild(bar);
    }
  }
  $('#bottleneck').addEventListener('input', reconstruct);
  $$('[data-pattern]').forEach(button => button.addEventListener('click', () => setPattern(button.dataset.pattern)));
  $('#error-toggle').addEventListener('click', () => {
    errorView = !errorView;
    $('#error-toggle').setAttribute('aria-pressed', String(errorView));
    reconstruct();
  });

  $$('[data-criterion]').forEach(button => button.addEventListener('click', () => {
    const goal = button.dataset.criterion;
    const structure = goal === 'structure';
    $$('[data-criterion]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    $('.comparison-stage').dataset.goal = goal;
    $('#linear-model').dataset.preferred = String(!structure);
    $('#nonlinear-model').dataset.preferred = String(structure);
    $('#verdict-title').textContent = structure ? 'The nonlinear one.' : 'The linear one.';
    $('#verdict-copy').textContent = structure
      ? 'Its reconstruction loss is higher, but its learned direction is more useful for the paper’s hidden-direction classification task.'
      : 'It has lower reconstruction loss on new samples. For making a faithful copy, it comes out ahead.';
  }));
  function syncMotion() {
    $('#motion-toggle').setAttribute('aria-pressed', String(moving));
    $('#motion-label').textContent = moving ? 'Motion on' : 'Motion off';
    $('.motion-icon').textContent = moving ? 'Ⅱ' : '▷';
    $('#motion-toggle').setAttribute('aria-label', moving ? 'Pause all ambient animations' : 'Play ambient animations');
  }
  $('#motion-toggle').addEventListener('click', () => {
    moving = !moving; syncMotion();
    if (!moving) { blend = lens === 'nonlinear' ? 1 : 0; renderCloud(); }
    schedule();
  });
  reduced.addEventListener('change', event => {
    if (event.matches) {
      moving = false; blend = lens === 'nonlinear' ? 1 : 0;
      syncMotion(); renderCloud();
    }
  });
  function schedule() {
    if (frameId === null && moving && !document.hidden && (visibility.scatter || visibility.encoder)) {
      lastTime = null;
      frameId = requestAnimationFrame(tick);
    }
  }
  function tick(now) {
    frameId = null;
    const delta = lastTime === null ? 0 : Math.min(60, now - lastTime);
    lastTime = now;
    if (!moving || document.hidden) return;
    elapsed += delta;
    const target = lens === 'nonlinear' ? 1 : 0;
    blend += (target - blend) * (1 - Math.exp(-delta / 130));
    if (Math.abs(target - blend) < .001) blend = target;
    if (visibility.scatter) renderCloud();
    if (visibility.encoder) {
      $$('.flow-particle').forEach((dot, i) => dot.setAttribute('cx', String(5 + ((elapsed / 28 + i * 45) % 85))));
      $('.code-orbit').style.transform = `rotate(${elapsed / 80}deg)`;
    }
    if (visibility.scatter || visibility.encoder) frameId = requestAnimationFrame(tick);
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        visibility[entry.target.id === 'scatter' ? 'scatter' : 'encoder'] = entry.isIntersecting;
      });
      schedule();
    });
    observer.observe($('#scatter')); observer.observe($('.compression-flow'));
    const chapters = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) $$('.chapter-nav a').forEach(link => {
          if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-15% 0px -50% 0px', threshold: 0 });
    ['#correlation', '#autoencoder', '#evaluation'].forEach(id => chapters.observe($(id)));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && frameId !== null) { cancelAnimationFrame(frameId); frameId = null; }
    schedule();
  });
  $$('[data-control]').forEach(control => { control.disabled = false; });
  makeCloud();
  setPattern('ring');
  syncMotion();
  schedule();
}());
