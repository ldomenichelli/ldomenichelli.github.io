(function () {
  'use strict';
  var root = document.querySelector('.ae-note');
  if (!root) return;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var scenes = Array.from(root.querySelectorAll('[data-ae-scene]')).map(function (element) {
    var button = element.querySelector('[data-motion]');
    var scene = { element: element, button: button, playing: !reduced.matches, visible: true, time: 0 };
    button.hidden = false;
    button.addEventListener('click', function () {
      scene.playing = !scene.playing;
      syncButton(scene);
      schedule();
    });
    syncButton(scene);
    return scene;
  });
  function syncButton(scene) {
    scene.button.textContent = scene.playing ? 'Pause motion' : 'Play motion';
    scene.button.setAttribute('aria-label', (scene.playing ? 'Pause' : 'Play') + ' ' + scene.element.dataset.aeScene + ' animation');
  }
  var curveScene = scenes[0];
  var flowScene = scenes[1];
  var slider = root.querySelector('#ae-pair');
  var output = root.querySelector('#ae-pair-value');
  root.querySelector('[data-slider-controls]').hidden = false;
  function drawPair(a) {
    var y = 192 - 148 * a * a;
    root.querySelector('#ae-negative').setAttribute('cx', 164 - 115 * a);
    root.querySelector('#ae-positive').setAttribute('cx', 164 + 115 * a);
    ['ae-negative', 'ae-positive', 'ae-squared'].forEach(function (id) {
      root.querySelector('#' + id).setAttribute('cy', y);
    });
    root.querySelector('#ae-squared').setAttribute('cx', 49 + 230 * a * a);
    var guide = root.querySelector('#ae-pair-guide');
    guide.setAttribute('x1', 164 - 115 * a);
    guide.setAttribute('x2', 164 + 115 * a);
    guide.setAttribute('y1', y);
    guide.setAttribute('y2', y);
    slider.value = a.toFixed(2);
    output.value = 'x = ±' + a.toFixed(2);
  }
  slider.addEventListener('input', function () {
    curveScene.playing = false;
    syncButton(curveScene);
    drawPair(Number(slider.value));
  });
  var stages = Array.from(root.querySelectorAll('.ae-stage'));
  var flowStatus = root.querySelector('#ae-flow-status');
  var messages = ['Start with an observation.', 'Encode it into fewer numbers.', 'Keep a compact code.', 'Decode the code back into the input space.', 'Compare the reconstruction with the input.'];
  var previousStage = -1;
  function drawFlow() {
    var index = Math.floor(flowScene.time / 1400) % stages.length;
    if (index === previousStage) return;
    stages.forEach(function (stage, i) { stage.classList.toggle('is-lit', i === index); });
    flowStatus.textContent = messages[index];
    previousStage = index;
  }
  var scoreButtons = Array.from(root.querySelectorAll('[data-criterion]'));
  root.querySelector('.ae-score-controls').hidden = false;
  scoreButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var reconstruct = button.dataset.criterion === 'reconstruction';
      scoreButtons.forEach(function (other) { other.setAttribute('aria-pressed', String(other === button)); });
      root.querySelector('#ae-linear-card').dataset.selected = String(reconstruct);
      root.querySelector('#ae-nonlinear-card').dataset.selected = String(!reconstruct);
      root.querySelector('#ae-verdict').textContent = reconstruct
        ? 'By reconstruction error, the linear model comes out ahead.'
        : 'By recovery of the hidden factor, the suitable nonlinear model comes out ahead.';
    });
  });
  var frame = null;
  var last = null;
  function schedule() {
    if (frame === null && !document.hidden && scenes.some(function (s) { return s.playing && s.visible; })) {
      last = null;
      frame = requestAnimationFrame(tick);
    }
  }
  function tick(now) {
    frame = null;
    var delta = last === null ? 0 : Math.min(now - last, 100);
    last = now;
    scenes.forEach(function (scene) {
      if (scene.playing && scene.visible) scene.time += delta;
    });
    if (curveScene.playing && curveScene.visible) drawPair(.5 + .4 * Math.sin(curveScene.time / 1800));
    if (flowScene.playing && flowScene.visible) drawFlow();
    if (!document.hidden && scenes.some(function (s) { return s.playing && s.visible; })) frame = requestAnimationFrame(tick);
  }
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        scenes.find(function (s) { return s.element === entry.target; }).visible = entry.isIntersecting;
      });
      schedule();
    });
    scenes.forEach(function (scene) { observer.observe(scene.element); });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && frame !== null) { cancelAnimationFrame(frame); frame = null; }
    schedule();
  });
  reduced.addEventListener('change', function (event) {
    if (event.matches) scenes.forEach(function (scene) { scene.playing = false; syncButton(scene); });
  });
  drawPair(.65);
  drawFlow();
  schedule();
}());
