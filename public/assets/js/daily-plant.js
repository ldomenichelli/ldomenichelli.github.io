(() => {
  'use strict';

  const garden = document.querySelector('[data-daily-plant]');
  if (!garden) return;
  const art = garden.querySelector('[data-plant-art]');
  const dateLabel = garden.querySelector('[data-plant-date]');
  const nameLabel = garden.querySelector('[data-plant-name]');
  const replay = garden.querySelector('[data-plant-replay]');
  if (!art) return;
  const titleId = art.querySelector('title')?.id;
  const descriptionId = art.querySelector('desc')?.id;

  const namespace = 'http://www.w3.org/2000/svg';
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const calendar = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  let plantedDay = '';
  let timer;

  function element(tag, attributes = {}) {
    const node = document.createElementNS(namespace, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function seedFrom(text) {
    let seed = 2166136261;
    for (const character of text) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
    return seed >>> 0;
  }

  function randomFrom(seed) {
    return () => {
      seed += 0x6D2B79F5;
      let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  const number = value => Math.round(value * 100) / 100;
  const coordinate = point => `${number(point.x)} ${number(point.y)}`;
  const offset = (point, angle, length) => ({
    x: point.x + Math.cos(angle) * length,
    y: point.y + Math.sin(angle) * length
  });

  function grow(day) {
    const seed = seedFrom(day);
    const random = randomFrom(seed);
    const between = (low, high) => low + random() * (high - low);
    const type = seed % 3;
    const names = [
      ['quiet fern', 'unfolding fern', 'a little wilderness'],
      ['wandering sprig', 'patient little leaves', 'a green daydream'],
      ['small constellation', 'a gentle bloom', 'flowers for today']
    ];
    const name = names[type][Math.floor(random() * names[type].length)];
    const drawing = element('g');
    const bounds = { left: 0, right: 0, top: 0, bottom: 0 };
    let speckles = 0;

    function include(...points) {
      points.forEach(point => {
        bounds.left = Math.min(bounds.left, point.x);
        bounds.right = Math.max(bounds.right, point.x);
        bounds.top = Math.min(bounds.top, point.y);
        bounds.bottom = Math.max(bounds.bottom, point.y);
      });
    }

    function group(depth) {
      const node = element('g', {
        class: 'plant-growth', style: `--plant-delay: ${number(depth * 95)}ms`
      });
      drawing.append(node);
      return node;
    }

    function stem(parent, start, end, bend) {
      const middle = { x: (start.x + end.x) / 2 + bend, y: (start.y + end.y) / 2 };
      include(start, middle, end);
      parent.append(element('path', {
        class: 'plant-stem', d: `M ${coordinate(start)} Q ${coordinate(middle)} ${coordinate(end)}`
      }));
      return fraction => ({
        x: (1 - fraction) ** 2 * start.x + 2 * (1 - fraction) * fraction * middle.x + fraction ** 2 * end.x,
        y: (1 - fraction) ** 2 * start.y + 2 * (1 - fraction) * fraction * middle.y + fraction ** 2 * end.y
      });
    }

    function leaf(parent, start, angle, length, width) {
      const tip = offset(start, angle, length);
      const middle = offset(start, angle, length * 0.46);
      const left = offset(middle, angle - Math.PI / 2, width);
      const right = offset(middle, angle + Math.PI / 2, width * 0.8);
      include(start, tip, left, right);
      parent.append(element('path', {
        class: 'plant-leaf',
        d: `M ${coordinate(start)} Q ${coordinate(left)} ${coordinate(tip)} Q ${coordinate(right)} ${coordinate(start)} Z`
      }));
      if (speckles < 24 && random() > 0.57) {
        const spot = offset(start, angle, length * between(0.33, 0.68));
        parent.append(element('circle', {
          class: 'plant-dot', cx: number(spot.x), cy: number(spot.y), r: 0.65
        }));
        speckles += 1;
      }
    }

    function flower(parent, center, radius) {
      // A single scalloped outline keeps the flowers light, with no image assets.
      let path = '';
      for (let petal = 0; petal < 5; petal += 1) {
        const angle = -Math.PI / 2 + petal * Math.PI * 2 / 5;
        const start = offset(center, angle - Math.PI / 5, radius * 0.42);
        const control = offset(center, angle, radius * 1.32);
        const end = offset(center, angle + Math.PI / 5, radius * 0.42);
        include(start, control, end);
        if (petal === 0) path += `M ${coordinate(start)} `;
        path += `Q ${coordinate(control)} ${coordinate(end)} `;
      }
      parent.append(element('path', { class: 'plant-bloom', d: `${path}Z` }));
      parent.append(element('circle', {
        class: 'plant-dot', cx: number(center.x), cy: number(center.y), r: 1.3
      }));
    }

    if (type === 0) {
      const trunk = group(0);
      const top = { x: between(-18, 18), y: -211 };
      const alongTrunk = stem(trunk, { x: 0, y: 0 }, top, between(-10, 10));

      // Successively smaller fronds produce a pinnate silhouette, not a binary tree.
      function fronds(level) {
        if (level === 6) return;
        const fraction = 0.18 + level * 0.13;
        for (const side of [-1, 1]) {
          const parent = group(level + 1);
          const start = alongTrunk(fraction + (side === 1 ? 0.025 : 0));
          const length = (83 - level * 10) * between(0.91, 1.06);
          const angle = -Math.PI / 2 + side * between(0.82, 1.12);
          const end = offset(start, angle, length);
          const alongFrond = stem(parent, start, end, side * 7);
          for (let pair = 0; pair < 4; pair += 1) {
            const point = alongFrond(0.22 + pair * 0.19);
            const size = (15 - pair * 1.8 - level * 0.6) * between(0.88, 1.12);
            leaf(parent, point, angle - 0.83, size, size * 0.26);
            leaf(parent, point, angle + 0.83, size, size * 0.26);
          }
          leaf(parent, end, angle, 10 - level * 0.6, 2.5);
        }
        fronds(level + 1);
      }
      fronds(0);
      leaf(trunk, top, -Math.PI / 2, 11, 3);
    } else {
      // Each seeded branch inherits its parent's direction and becomes shorter.
      function branch(start, angle, length, depth) {
        const parent = group(depth * 2);
        const end = offset(start, angle, length);
        const alongBranch = stem(parent, start, end, between(-5, 5));
        for (const [fraction, side] of [[0.4, -1], [0.73, 1]]) {
          const size = (type === 1 ? 24 : 18) * between(0.8, 1.12) * (1 - depth * 0.08);
          leaf(parent, alongBranch(fraction), angle + side * between(0.62, 0.97), size, size * 0.31);
        }
        if (depth === 3) {
          if (type === 2) flower(parent, end, between(6, 9));
          else leaf(parent, end, angle, between(16, 23), 6);
          return;
        }
        const spread = depth === 0 ? 0.41 : between(0.39, 0.6);
        branch(end, angle - spread + between(-0.06, 0.06), length * between(0.7, 0.8), depth + 1);
        branch(end, angle + spread + between(-0.06, 0.06), length * between(0.7, 0.8), depth + 1);
      }
      branch({ x: 0, y: 0 }, -Math.PI / 2 + between(-0.1, 0.1), between(72, 80), 0);
    }

    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    const scale = Math.min(246 / width, 238 / height);
    const translateX = 160 - (bounds.left + bounds.right) * scale / 2;
    const translateY = 263 - bounds.bottom * scale;
    drawing.setAttribute('transform', `translate(${number(translateX)} ${number(translateY)}) scale(${number(scale)})`);

    const title = element('title');
    if (titleId) title.id = titleId;
    title.textContent = `${name} — ${day}`;
    const description = element('desc');
    if (descriptionId) description.id = descriptionId;
    description.textContent = 'A small imaginary plant drawn from branching rules. A new drawing grows each day, using the date in Rome as its seed.';
    const soil = element('path', {
      class: 'plant-stem', d: `M ${number(translateX - 23)} 270 Q ${number(translateX)} 268 ${number(translateX + 23)} 270`, opacity: 0.4
    });
    art.replaceChildren(title, description, drawing, soil);
    if (nameLabel) nameLabel.textContent = name;
    if (dateLabel) {
      dateLabel.dateTime = day;
      dateLabel.textContent = day.split('-').reverse().join('.');
    }
    replayGrowth();
  }

  function replayGrowth() {
    garden.classList.remove('is-growing');
    if (motion.matches) return;
    // Restart only the reveal animation; the day's geometry never changes.
    void garden.offsetWidth;
    garden.classList.add('is-growing');
  }

  function update() {
    // Explicit Rome time makes the seed independent of a visitor's timezone.
    const parts = Object.fromEntries(calendar.formatToParts(new Date()).map(part => [part.type, part.value]));
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    if (day !== plantedDay) {
      plantedDay = day;
      grow(day);
    }
    clearTimeout(timer);
    // Align to the next minute, including midnight, without polling while hidden.
    if (!document.hidden) timer = window.setTimeout(update, 60000 - Date.now() % 60000);
  }

  function updateMotion() {
    if (replay) replay.hidden = motion.matches;
    if (motion.matches) garden.classList.remove('is-growing');
  }

  if (replay) replay.addEventListener('click', replayGrowth);
  motion.addEventListener('change', updateMotion);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else update();
  });
  updateMotion();
  update();
})();
