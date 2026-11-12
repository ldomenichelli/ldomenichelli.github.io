(function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const NS = 'http://www.w3.org/2000/svg';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let moving = !reduced.matches;
  let lens = 'latents';
  let observedBlend = 0;
  let elapsed = 0;
  let lastTime = null;
  let frameId = null;
  let visible = true;
  let seed = 260210680;
  // A fixed seeded sample keeps views comparable. It is not rescaled to force
  // sample covariance to zero; the displayed moments are population quantities.
  function uniform() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return (seed + .5) / 4294967296;
  }
  function normal() { return Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform()); }
  const points = Array.from({ length: 220 }, () => {
    const lambda = normal();
    return { lambda, nu: Math.abs(lambda) < .6744897501960817 ? -Math.SQRT2 : Math.SQRT2, zu: normal(), zv: normal() };
  });
  const dots = points.map(point => {
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('r', '2.6');
    circle.setAttribute('fill', point.nu > 0 ? '#aa6647' : '#426b50');
    $('#scatter-points').appendChild(circle);
    return circle;
  });
  function renderCloud() {
    const whitened = $('#whitening').checked;
    const covariance = lens === 'covariance';
    points.forEach((point, index) => {
      const xu = point.lambda + point.zu;
      const xv = (point.nu + point.zv) / (whitened ? Math.sqrt(3) : 1);
      const x = point.lambda + observedBlend * (xu - point.lambda);
      const y = point.nu + observedBlend * (xv - point.nu);
      const cx = 300 + x * 55, cy = 200 - y * 55;
      dots[index].setAttribute('cx', cx.toFixed(2));
      dots[index].setAttribute('cy', cy.toFixed(2));
      dots[index].setAttribute('opacity', covariance ? '.14' : '.65');
    });
    $('#covariance-view').setAttribute('opacity', covariance ? '1' : '0');
    $('#covariance-ellipse').setAttribute('ry', String(55 * (whitened ? 1 : Math.sqrt(3))));
    $('#covariance-ellipse').setAttribute('rx', String(55 * Math.sqrt(2)));
    $('#covariance-axis').setAttribute('d', whitened ? 'M200 200H400' : 'M300 85V315');
    const focus = dots[Math.floor(elapsed / 200) % points.length];
    $('#focus-point').setAttribute('cx', focus.getAttribute('cx'));
    $('#focus-point').setAttribute('cy', focus.getAttribute('cy'));
    $('#focus-point').setAttribute('opacity', covariance ? '0' : '.8');
  }
  function updateLens(next) {
    lens = next;
    const whitened = $('#whitening').checked;
    const isLatent = lens === 'latents';
    $$('[data-lens]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lens === lens)));
    $('#scatter-x-label').textContent = isLatent ? 'λ' : 'Xᵤ';
    $('#scatter-y-label').textContent = isLatent ? 'ν' : 'Xᵥ';
    $('#whitening-state').textContent = whitened ? 'On' : 'Off';
    let insight, label, value, hint, title;
    if (isLatent) {
      label = 'Population E[λν]'; value = '0';
      insight = 'ν depends on the size of λ, but not its sign. Zero correlation does not mean independence.';
      hint = 'A sample from the k* = 2 latent law used in Figure 1';
      title = 'The paper’s dependent but uncorrelated latent variables';
    } else if (lens === 'observed') {
      label = 'Population Var(Xᵥ)'; value = whitened ? '1' : '3';
      insight = whitened ? 'Gaussian noise blurs the dependence. Whitening gives the hidden direction exactly the same variance as pure noise.' : 'Without whitening, the hidden direction has variance 3, above the noise baseline of 1. Its covariance signature returns.';
      hint = whitened ? 'Xᵤ = λ + Zᵤ;  Xᵥ = (ν + Zᵥ)/√3' : 'Xᵤ = λ + Zᵤ;  Xᵥ = ν + Zᵥ';
      title = 'Noisy observed projections along the known planted axes';
    } else {
      label = 'Variances (Xᵤ, Xᵥ)'; value = whitened ? '2, 1' : '2, 3';
      insight = whitened ? 'PCA sees the visible spike: variance 2 along u*. The hidden direction has variance 1, just like every background direction.' : 'Without whitening, v* has the largest variance. PCA would detect it. Whitening is what creates the paper’s blind spot.';
      hint = 'Population one-standard-deviation ellipse; dashed = leading axis';
      title = 'Population covariance ellipse and its leading principal axis';
    }
    $('#correlation-label').textContent = label;
    $('#correlation-value').textContent = value;
    $('#lens-insight').textContent = insight;
    $('#plot-hint').textContent = hint;
    $('#scatter-title').textContent = title;
    if (!moving || !visible) observedBlend = isLatent ? 0 : 1;
    renderCloud(); schedule();
  }
  $$('[data-lens]').forEach(button => button.addEventListener('click', () => updateLens(button.dataset.lens)));
  $('#whitening').addEventListener('change', () => updateLens(lens === 'latents' ? 'observed' : lens));

  // The exact tied-neuron map on a chosen unit-norm, two-dimensional slice.
  const input = [-1.3, .8];
  const scale = 95;
  const pixel = vector => [300 + scale * vector[0], 190 - scale * vector[1]];
  function dotPosition(id, vector) {
    const [x, y] = pixel(vector);
    $(id).setAttribute('cx', x); $(id).setAttribute('cy', y);
  }
  function linePosition(id, start, end) {
    const [x1, y1] = pixel(start), [x2, y2] = pixel(end);
    const line = $(id);
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
  }
  function neuron() {
    const angle = Number($('#weight-angle').value);
    const radians = angle * Math.PI / 180;
    const a = [Math.cos(radians), Math.sin(radians)];
    const t = a[0] * input[0] + a[1] * input[1];
    const name = $('#activation').value;
    const h = name === 'linear' ? t : name === 'relu' ? Math.max(0, t) : name === 'tanh' ? Math.tanh(t) : 1 / (1 + Math.exp(-t));
    const projection = a.map(v => v * t), reconstruction = a.map(v => v * h);
    const projectionError = input.reduce((sum, v, i) => sum + (v - projection[i]) ** 2, 0);
    const penalty = (h - t) ** 2;
    const total = input.reduce((sum, v, i) => sum + (v - reconstruction[i]) ** 2, 0);
    $('#angle-value').value = angle + '°';
    [['#preactivation', t], ['#code-value', h], ['#projection-error', projectionError], ['#activation-penalty', penalty], ['#total-error', total]].forEach(([id, value]) => {
      $(id).value = (Math.abs(value) < .0005 ? 0 : value).toFixed(3);
      $(id).dataset.value = String(value);
    });
    linePosition('#decoder-line', a.map(v => -2.8 * v), a.map(v => 2.8 * v));
    linePosition('#weight-arrow', [0, 0], a);
    linePosition('#error-line', projection, reconstruction);
    linePosition('#projection-line', input, projection);
    dotPosition('#input-dot', input); dotPosition('#projection-dot', projection); dotPosition('#reconstruction-dot', reconstruction);
    const [labelX, labelY] = pixel(a.map(v => 1.2 * v));
    $('#weight-label').setAttribute('x', Math.min(475, labelX + 8));
    $('#weight-label').setAttribute('y', Math.max(22, labelY - 12));
    $('#neuron-desc').textContent = `Weight angle ${angle} degrees, ${name} activation. Input (${input.join(', ')}). Preactivation ${t.toFixed(3)}, code ${h.toFixed(3)}. Reconstruction error ${total.toFixed(3)} equals projection error ${projectionError.toFixed(3)} plus activation penalty ${penalty.toFixed(3)}.`;
  }
  $('#weight-angle').addEventListener('input', neuron);
  $('#activation').addEventListener('change', neuron);
  $$('[data-exponent]').forEach(button => button.addEventListener('click', () => {
    const exponent = button.dataset.exponent;
    $$('[data-exponent]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    $('.activation-table').dataset.selected = exponent;
    $('#activation-insight').textContent = exponent === '2'
      ? 'For k* = 2, ReLU can exploit the mixed third-order signal. tanh has counterexamples, including the latent law in the main experiment.'
      : 'For k* = 3, the first mixed signal is fourth order. tanh permits logarithmic-time recovery under the theorem’s conditions; ReLU has counterexamples, including Appendix E.4’s latent law.';
  }));
  $$('[data-criterion]').forEach(button => button.addEventListener('click', () => {
    const structure = button.dataset.criterion === 'structure';
    $$('[data-criterion]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    $('#verdict-title').textContent = structure ? 'Suitable nonlinear models win.' : 'The linear model wins.';
    $('#verdict-copy').textContent = structure
      ? 'In Figure 2, models that recover v* beat the chance-level linear model on the class-averaged classification task.'
      : 'In Figure 2, it has lower reconstruction loss on both training and test samples.';
  }));

  function syncMotion() {
    $('#motion-toggle').setAttribute('aria-pressed', String(moving));
    $('#motion-toggle').setAttribute('aria-label', moving ? 'Pause diagram animation' : 'Play diagram animation');
    $('#motion-label').textContent = moving ? 'Motion on' : 'Motion off';
    $('.motion-icon').textContent = moving ? 'Ⅱ' : '▷';
  }
  function stopMotion() {
    moving = false;
    if (frameId !== null) { cancelAnimationFrame(frameId); frameId = null; }
    observedBlend = lens === 'latents' ? 0 : 1;
    syncMotion(); renderCloud();
  }
  $('#motion-toggle').addEventListener('click', () => {
    if (moving) stopMotion();
    else { moving = true; syncMotion(); schedule(); }
  });
  reduced.addEventListener('change', event => { if (event.matches) stopMotion(); });
  function schedule() {
    if (frameId === null && moving && visible && !document.hidden) { lastTime = null; frameId = requestAnimationFrame(tick); }
  }
  function tick(now) {
    frameId = null;
    if (!moving || !visible || document.hidden) return;
    const delta = lastTime === null ? 0 : Math.min(60, now - lastTime);
    lastTime = now; elapsed += delta;
    const target = lens === 'latents' ? 0 : 1;
    observedBlend += (target - observedBlend) * (1 - Math.exp(-delta / 150));
    if (Math.abs(target - observedBlend) < .001) observedBlend = target;
    renderCloud(); frameId = requestAnimationFrame(tick);
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; schedule(); });
    observer.observe($('#scatter'));
    const chapters = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) $$('.chapter-nav a').forEach(link => {
          if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-15% 0px -65% 0px' });
    ['data', 'autoencoder', 'theory', 'results', 'evaluation'].forEach(id => chapters.observe($('#' + id)));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && frameId !== null) { cancelAnimationFrame(frameId); frameId = null; }
    schedule();
  });
  $$('[data-control]').forEach(control => { control.disabled = false; });
  neuron(); syncMotion(); updateLens('latents');
}());
