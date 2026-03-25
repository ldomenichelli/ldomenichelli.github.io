const DEFAULT_ASCII_OPTIONS = Object.freeze({
  ramp: ' .,:-+=*#%@',
  invert: false,
  contrast: 1.18,
  brightness: 1,
  sample: 8,
  animate: true,
  color: 'monochrome',
  minColumns: 28,
  maxColumns: 92,
  motionIntervalMs: 140,
  detailBoost: 0.28
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readAttr(root, name, fallback) {
  const value = root.getAttribute(name);
  return value == null || value === '' ? fallback : value;
}

function readNumberAttr(root, name, fallback) {
  const value = Number(readAttr(root, name, ''));
  return Number.isFinite(value) ? value : fallback;
}

function readBooleanAttr(root, name, fallback) {
  const value = readAttr(root, name, '');
  if (value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function isLowPowerDevice() {
  if (typeof navigator === 'undefined') return false;

  if (navigator.connection?.saveData) {
    return true;
  }

  if (navigator.deviceMemory && navigator.deviceMemory <= 2) {
    return true;
  }

  return false;
}

function isFinePointer() {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
}

function getOrigin(url) {
  try {
    return new URL(url, window.location.href).origin;
  } catch {
    return null;
  }
}

function isExternalImage(url) {
  if (typeof window === 'undefined') return false;
  const origin = getOrigin(url);
  return origin != null && origin !== window.location.origin;
}

function boxBlur(values, width, height) {
  const blurred = new Float32Array(values.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      let count = 0;

      for (let dy = -1; dy <= 1; dy += 1) {
        const py = y + dy;
        if (py < 0 || py >= height) continue;

        for (let dx = -1; dx <= 1; dx += 1) {
          const px = x + dx;
          if (px < 0 || px >= width) continue;
          total += values[py * width + px];
          count += 1;
        }
      }

      blurred[y * width + x] = total / count;
    }
  }

  return blurred;
}

function applyDetailBoost(values, width, height, amount) {
  if (amount <= 0) return values;

  const blurred = boxBlur(values, width, height);

  for (let index = 0; index < values.length; index += 1) {
    values[index] = clamp(values[index] + (values[index] - blurred[index]) * amount, 0, 1);
  }

  return values;
}

export function brightnessToCharacter(brightness, ramp = DEFAULT_ASCII_OPTIONS.ramp, invert = false) {
  const safeRamp = typeof ramp === 'string' && ramp.length ? ramp : DEFAULT_ASCII_OPTIONS.ramp;
  const normalized = clamp(brightness, 0, 1);
  const position = invert ? normalized : 1 - normalized;
  const index = Math.round(position * (safeRamp.length - 1));
  return safeRamp[index];
}

export class AsciiHero {
  constructor(root, overrides = {}) {
    this.root = root;
    this.output = root.querySelector('[data-ascii-output]');
    this.fallback = root.querySelector('[data-ascii-fallback]');
    this.status = root.querySelector('[data-ascii-status]');
    this.options = {
      ...DEFAULT_ASCII_OPTIONS,
      src: readAttr(root, 'data-ascii-src', this.fallback?.getAttribute('src') || ''),
      ramp: readAttr(root, 'data-ascii-ramp', DEFAULT_ASCII_OPTIONS.ramp),
      invert: readBooleanAttr(root, 'data-ascii-invert', DEFAULT_ASCII_OPTIONS.invert),
      contrast: readNumberAttr(root, 'data-ascii-contrast', DEFAULT_ASCII_OPTIONS.contrast),
      brightness: readNumberAttr(root, 'data-ascii-brightness', DEFAULT_ASCII_OPTIONS.brightness),
      sample: readNumberAttr(root, 'data-ascii-sample', DEFAULT_ASCII_OPTIONS.sample),
      animate: readBooleanAttr(root, 'data-ascii-animation', DEFAULT_ASCII_OPTIONS.animate),
      color: readAttr(root, 'data-ascii-color', DEFAULT_ASCII_OPTIONS.color),
      detailBoost: readNumberAttr(root, 'data-ascii-detail', DEFAULT_ASCII_OPTIONS.detailBoost),
      ...overrides
    };

    this.prefersReducedMotion = typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : { matches: false };

    this.canvas = null;
    this.context = null;
    this.image = null;
    this.sourceBox = null;
    this.columns = 0;
    this.rows = 0;
    this.phase = 0;
    this.luminance = null;
    this.animationFrame = 0;
    this.resizeTimer = 0;
    this.mounted = false;
    this.lowPower = isLowPowerDevice();
    this.handleResize = this.queueRefresh.bind(this);
    this.handlePointerMove = this.onPointerMove.bind(this);
    this.handlePointerLeave = this.onPointerLeave.bind(this);
  }

  setState(state) {
    this.root.dataset.asciiState = state;
  }

  setStatus(message) {
    if (this.status) this.status.textContent = message;
  }

  shouldAnimate() {
    return this.options.animate && !this.prefersReducedMotion.matches && !this.lowPower;
  }

  shouldFallbackToImage() {
    if (typeof navigator === 'undefined') return false;
    return navigator.connection?.saveData || navigator.deviceMemory <= 2;
  }

  mount() {
    if (this.mounted || !this.root || !this.output || !this.options.src) {
      return this;
    }

    this.mounted = true;
    this.root.dataset.asciiColor = this.options.color;
    this.root.dataset.asciiAnimate = String(this.options.animate);
    this.setState('loading');
    this.setStatus('Loading ASCII portrait.');

    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(this.root);
    } else {
      window.addEventListener('resize', this.handleResize);
    }

    if (isFinePointer()) {
      this.root.addEventListener('pointermove', this.handlePointerMove);
      this.root.addEventListener('pointerleave', this.handlePointerLeave);
    }

    this.loadImage();
    return this;
  }

  loadImage() {
    const image = new Image();
    image.decoding = 'async';

    if (isExternalImage(this.options.src)) {
      image.crossOrigin = 'anonymous';
    }

    image.addEventListener('load', async () => {
      this.image = image;

      try {
        await image.decode();
      } catch {
        // The image is still usable if decode rejects after load.
      }

      this.sourceBox = this.findContentBounds(image);
      this.root.style.aspectRatio = `${this.sourceBox.sw} / ${this.sourceBox.sh}`;

      if (this.shouldFallbackToImage()) {
        this.setState('fallback');
        this.setStatus('Showing original image to keep the page lightweight.');
        return;
      }

      const ready = this.refresh(true);

      if (ready && this.shouldAnimate()) {
        this.startAnimation();
      }
    });

    image.addEventListener('error', () => {
      this.fail('Image failed to load. Showing the original artwork instead.');
    });

    image.src = this.options.src;
  }

  ensureCanvas() {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.context = this.canvas.getContext('2d', { willReadFrequently: true });
    }

    return this.context;
  }

  findContentBounds(image) {
    const sampleCanvas = document.createElement('canvas');
    const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });

    if (!sampleContext) {
      return {
        sx: 0,
        sy: 0,
        sw: image.naturalWidth,
        sh: image.naturalHeight
      };
    }

    sampleCanvas.width = image.naturalWidth;
    sampleCanvas.height = image.naturalHeight;
    sampleContext.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight);

    let data;
    try {
      data = sampleContext.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data;
    } catch {
      return {
        sx: 0,
        sy: 0,
        sw: image.naturalWidth,
        sh: image.naturalHeight
      };
    }

    let minX = image.naturalWidth;
    let minY = image.naturalHeight;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < image.naturalHeight; y += 1) {
      for (let x = 0; x < image.naturalWidth; x += 1) {
        const offset = (y * image.naturalWidth + x) * 4;
        const alpha = data[offset + 3];
        if (alpha < 16) continue;

        const r = data[offset] / 255;
        const g = data[offset + 1] / 255;
        const b = data[offset + 2] / 255;
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const saturation = Math.max(r, g, b) - Math.min(r, g, b);

        if (luminance > 0.965 && saturation < 0.08) continue;

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < 0 || maxY < 0) {
      return {
        sx: 0,
        sy: 0,
        sw: image.naturalWidth,
        sh: image.naturalHeight
      };
    }

    const padX = Math.max(8, Math.round((maxX - minX + 1) * 0.2));
    const padY = Math.max(8, Math.round((maxY - minY + 1) * 0.24));
    const sx = clamp(minX - padX, 0, image.naturalWidth - 1);
    const sy = clamp(minY - padY, 0, image.naturalHeight - 1);
    const sw = clamp((maxX - minX + 1) + padX * 2, 1, image.naturalWidth - sx);
    const sh = clamp((maxY - minY + 1) + padY * 2, 1, image.naturalHeight - sy);

    return { sx, sy, sw, sh };
  }

  computeColumns(width) {
    const densityBoost = window.innerWidth >= 1280 ? 10 : window.innerWidth >= 960 ? 6 : 0;
    const lowPowerPenalty = this.lowPower ? 12 : 0;
    const columns = Math.round(width / this.options.sample);
    return clamp(columns, this.options.minColumns, this.options.maxColumns + densityBoost - lowPowerPenalty);
  }

  computeRows(columns) {
    if (!this.image) return 0;

    const characterAspect = window.innerWidth <= 560 ? 0.53 : 0.57;
    const rows = Math.round(columns * (this.image.naturalHeight / this.image.naturalWidth) * characterAspect);
    return clamp(rows, 18, 120);
  }

  queueRefresh() {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.refresh(), 90);
  }

  refresh(force = false) {
    if (!this.image || !this.output) return false;

    const width = Math.max(this.root.clientWidth, 1);
    const columns = this.computeColumns(width);
    const rows = this.computeRows(columns);

    if (!force && columns === this.columns && rows === this.rows && this.luminance) {
      this.renderText(0);
      return true;
    }

    this.columns = columns;
    this.rows = rows;
    this.root.style.setProperty('--ascii-font-size', `${Math.max(8, width / (columns * 0.66)).toFixed(2)}px`);
    this.root.style.setProperty('--ascii-line-height', width <= 560 ? '0.8' : '0.83');
    this.root.style.setProperty('--ascii-letter-spacing', width <= 560 ? '-0.03em' : '-0.018em');

    if (!this.updateLuminance()) return false;

    this.renderText(0);
    this.setState('ready');
    this.setStatus('ASCII portrait ready.');
    return true;
  }

  updateLuminance() {
    const context = this.ensureCanvas();
    if (!context) {
      this.fail('Canvas is unavailable. Showing the original artwork instead.');
      return false;
    }

    this.canvas.width = this.columns;
    this.canvas.height = this.rows;
    context.clearRect(0, 0, this.columns, this.rows);
    context.imageSmoothingEnabled = true;
    const { sx, sy, sw, sh } = this.sourceBox || {
      sx: 0,
      sy: 0,
      sw: this.image.naturalWidth,
      sh: this.image.naturalHeight
    };
    context.drawImage(this.image, sx, sy, sw, sh, 0, 0, this.columns, this.rows);

    let data;
    try {
      data = context.getImageData(0, 0, this.columns, this.rows).data;
    } catch {
      this.fail('The image cannot be sampled safely. Showing the original artwork instead.');
      return false;
    }

    const values = new Float32Array(this.columns * this.rows);

    for (let index = 0; index < values.length; index += 1) {
      const offset = index * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];

      let value = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      value = ((value - 0.5) * this.options.contrast) + 0.5;
      value *= this.options.brightness;
      values[index] = clamp(value, 0, 1);
    }

    const detailBoost = window.innerWidth >= 960
      ? this.options.detailBoost
      : this.options.detailBoost * 0.45;

    this.luminance = applyDetailBoost(values, this.columns, this.rows, detailBoost);
    return true;
  }

  renderText(phase = 0) {
    if (!this.luminance || !this.output) return;

    const lines = new Array(this.rows);

    for (let y = 0; y < this.rows; y += 1) {
      let row = '';

      for (let x = 0; x < this.columns; x += 1) {
        const index = y * this.columns + x;
        let value = this.luminance[index];

        if (phase !== 0) {
          const wave = Math.sin((x * 0.42) + (y * 0.31) + phase) * 0.028;
          value = clamp(value + wave, 0, 1);
        }

        row += brightnessToCharacter(value, this.options.ramp, this.options.invert);
      }

      lines[y] = row;
    }

    this.output.textContent = lines.join('\n');
  }

  startAnimation() {
    if (this.animationFrame || !this.shouldAnimate()) return;

    let lastTick = 0;

    const tick = (timestamp) => {
      if (!this.shouldAnimate()) {
        this.stopAnimation();
        return;
      }

      if (timestamp - lastTick >= this.options.motionIntervalMs) {
        lastTick = timestamp;
        this.phase += 0.35;
        this.renderText(this.phase);
      }

      this.animationFrame = window.requestAnimationFrame(tick);
    };

    this.animationFrame = window.requestAnimationFrame(tick);
  }

  stopAnimation() {
    if (this.animationFrame) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }

    if (this.luminance) {
      this.phase = 0;
      this.renderText(0);
    }
  }

  onPointerMove(event) {
    if (!isFinePointer()) return;

    const rect = this.root.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = ((event.clientX - rect.left) / rect.width) - 0.5;
    const y = ((event.clientY - rect.top) / rect.height) - 0.5;

    this.root.style.setProperty('--ascii-parallax-x', `${(x * 10).toFixed(2)}px`);
    this.root.style.setProperty('--ascii-parallax-y', `${(y * 8).toFixed(2)}px`);
  }

  onPointerLeave() {
    this.root.style.setProperty('--ascii-parallax-x', '0px');
    this.root.style.setProperty('--ascii-parallax-y', '0px');
  }

  fail(message) {
    this.stopAnimation();
    this.setState('error');
    this.setStatus(message);
    if (this.output) this.output.textContent = '';
  }

  destroy() {
    this.stopAnimation();
    window.clearTimeout(this.resizeTimer);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    } else {
      window.removeEventListener('resize', this.handleResize);
    }

    this.root.removeEventListener('pointermove', this.handlePointerMove);
    this.root.removeEventListener('pointerleave', this.handlePointerLeave);
  }
}

export function mountAsciiHeroes(root = document) {
  return Array.from(root.querySelectorAll('[data-ascii-hero]')).map((node) => new AsciiHero(node).mount());
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountAsciiHeroes(), { once: true });
  } else {
    mountAsciiHeroes();
  }
}
