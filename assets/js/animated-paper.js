import { getAnimatedPaper } from './animated-papers-data.js';
import {
  animatedPaperHref,
  getPublicationBySlug,
  publicationDetailHref
} from './publications-data.js';

function clear(node) {
  if (node) node.textContent = '';
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (typeof text === 'string') node.textContent = text;
  return node;
}

function svgEl(tag, attributes = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

function createAction(label, href, kind = 'secondary', external = false) {
  const anchor = el('a', `explorable-action ${kind}`, label);
  anchor.href = href;
  if (external) {
    anchor.target = '_blank';
    anchor.rel = 'noreferrer noopener';
  }
  return anchor;
}

function setDocumentMeta(title, description) {
  if (typeof document === 'undefined') return;
  document.title = title;
  const descriptionTag = document.querySelector('meta[name="description"]');
  if (descriptionTag) descriptionTag.setAttribute('content', description);
}

function createSectionTitle(title, body) {
  const header = document.createDocumentFragment();
  header.append(el('h2', '', title), el('p', '', body));
  return header;
}

function createHorizontalBarChart({ title, subtitle, data, maxValue, formatter, valueSuffix = '' }) {
  const block = el('article', 'chart-block');
  block.append(el('h3', '', title), el('p', '', subtitle));

  const svg = svgEl('svg', {
    class: 'chart-svg',
    viewBox: '0 0 720 340',
    role: 'img',
    'aria-label': title
  });

  const top = 16;
  const left = 170;
  const right = 80;
  const rowHeight = 30;
  const chartWidth = 720 - left - right;
  const scaleMax = maxValue || Math.max(...data.map((item) => item.value), 1);

  const axis = svgEl('line', {
    x1: left,
    y1: top,
    x2: left,
    y2: top + rowHeight * data.length,
    stroke: 'rgba(219,228,221,0.18)',
    'stroke-width': 1
  });
  svg.appendChild(axis);

  data.forEach((item, index) => {
    const y = top + index * rowHeight + 6;
    const width = (item.value / scaleMax) * chartWidth;
    const highlightClass = item.highlight ? ` highlight-${item.highlight}` : '';

    const label = svgEl('text', {
      x: left - 12,
      y: y + 12,
      'text-anchor': 'end'
    });
    label.textContent = item.label;
    svg.appendChild(label);

    const track = svgEl('rect', {
      x: left,
      y,
      width: chartWidth,
      height: 16,
      rx: 8,
      fill: 'rgba(255,255,255,0.04)'
    });
    svg.appendChild(track);

    const bar = svgEl('rect', {
      class: `chart-bar${highlightClass}`,
      x: left,
      y,
      width: Math.max(6, width),
      height: 16,
      rx: 8,
      tabindex: 0
    });
    const titleNode = svgEl('title');
    titleNode.textContent = `${item.label}: ${formatter(item.value)}${valueSuffix}`;
    bar.appendChild(titleNode);
    svg.appendChild(bar);

    const value = svgEl('text', {
      x: 720 - right + 8,
      y: y + 12
    });
    value.textContent = `${formatter(item.value)}${valueSuffix}`;
    svg.appendChild(value);
  });

  block.appendChild(svg);
  block.appendChild(el('div', 'chart-caption', 'Hover or focus a bar for the exact value.'));
  return block;
}

function createQuestionGrid(items) {
  const grid = el('div', 'question-grid');
  items.forEach((item) => {
    const card = el('article', 'question-card');
    card.append(el('strong', '', item.title), el('p', '', item.body));
    grid.appendChild(card);
  });
  return grid;
}

function createSetupGrid(setup) {
  const wrapper = document.createDocumentFragment();
  const grid = el('div', 'setup-grid');
  setup.cards.forEach((item) => {
    const card = el('article', 'setup-card');
    card.append(el('strong', '', `${item.label}: ${item.value}`), el('small', '', item.note));
    grid.appendChild(card);
  });
  wrapper.appendChild(grid);

  const featureList = el('div', 'setup-feature-list');
  setup.featureLabels.forEach((feature) => featureList.appendChild(el('span', 'setup-feature', feature)));
  wrapper.appendChild(featureList);
  return wrapper;
}

function createMetricGrid(paper) {
  const grid = el('div', 'stats-grid');
  const chips = [
    { value: '12', label: 'readers after exclusions' },
    { value: '5', label: 'eye-tracking features' },
    { value: '4', label: 'transfer families' },
    { value: '588', label: 'GECO sentences' },
    { value: '56,410', label: 'GECO words' }
  ];
  chips.forEach((item) => {
    const chip = el('div', 'metric-chip');
    chip.append(el('span', '', item.value), el('small', '', item.label));
    grid.appendChild(chip);
  });
  return grid;
}

function createStrategyExplorer(data) {
  const wrapper = el('div', 'strategy-layout');
  const controlsPanel = el('div', 'strategy-copy');
  const figurePanel = el('div', 'flow-diagram');

  const intro = el('p', '', data.intro);
  const segmented = el('div', 'segmented-control');
  segmented.setAttribute('role', 'group');
  segmented.setAttribute('aria-label', 'Injection strategies');
  controlsPanel.append(intro, segmented);

  const name = el('strong', '', '');
  const description = el('p', '', '');
  const emphasis = el('p', 'strategy-emphasis', '');
  controlsPanel.append(name, description, emphasis);

  const track = el('div', 'flow-track');
  figurePanel.appendChild(track);

  function renderFlow(strategy) {
    name.textContent = `${strategy.longLabel} (${strategy.label})`;
    description.textContent = strategy.description;
    emphasis.textContent = strategy.emphasis;
    track.textContent = '';

    strategy.stages.forEach((stage, index) => {
      const node = el('div', `flow-node ${stage.state}`, stage.label);
      track.appendChild(node);
      if (index < strategy.connectors.length) {
        track.appendChild(el('div', `flow-connector ${strategy.connectors[index]}`));
      }
    });
  }

  data.strategies.forEach((strategy, index) => {
    const button = el('button', 'segment-button', strategy.label);
    button.type = 'button';
    button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
    button.addEventListener('click', () => {
      segmented.querySelectorAll('.segment-button').forEach((candidate) =>
        candidate.setAttribute('aria-pressed', 'false')
      );
      button.setAttribute('aria-pressed', 'true');
      renderFlow(strategy);
    });
    segmented.appendChild(button);
  });

  renderFlow(data.strategies[0]);
  wrapper.append(controlsPanel, figurePanel);
  return wrapper;
}

function createResultsExplorer(paper) {
  const shell = el('div', 'results-shell');
  const tabs = el('div', 'results-tabs');
  tabs.setAttribute('role', 'tablist');
  shell.appendChild(tabs);

  const panels = [];

  function addTab(key, label, buildPanel) {
    const button = el('button', 'results-tab', label);
    button.type = 'button';
    button.id = `results-tab-${key}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', panels.length === 0 ? 'true' : 'false');
    button.setAttribute('aria-controls', `results-panel-${key}`);
    tabs.appendChild(button);

    const panel = el('section', 'results-panel');
    panel.id = `results-panel-${key}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    if (panels.length > 0) panel.hidden = true;
    buildPanel(panel);
    shell.appendChild(panel);
    panels.push({ key, button, panel });

    button.addEventListener('click', () => {
      panels.forEach((item) => {
        const selected = item.key === key;
        item.button.setAttribute('aria-selected', selected ? 'true' : 'false');
        item.panel.hidden = !selected;
      });
    });
  }

  const results = paper.results;

  addTab('performance', 'Performance', (panel) => {
    panel.appendChild(
      createHorizontalBarChart({
        title: 'Average downstream performance',
        subtitle:
          'DST-ONLY is the downstream-only baseline. Transfer strategies can be compared directly against it.',
        data: results.performance,
        maxValue: 0.9,
        formatter: (value) => value.toFixed(2)
      })
    );
    const note = el('aside', 'chart-note');
    note.append(el('p', '', results.interpretations.performance));
    panel.appendChild(note);
  });

  addTab('attention', 'Attention', (panel) => {
    const grid = el('div', 'chart-grid');
    grid.appendChild(
      createHorizontalBarChart({
        title: 'Average attention correlation',
        subtitle: 'A compact summary of BASE versus EYE-ONLY alignment across layers.',
        data: results.attentionSummary,
        maxValue: 0.3,
        formatter: (value) => value.toFixed(2)
      })
    );
    grid.appendChild(
      createHorizontalBarChart({
        title: 'Last-layer attention correlation by strategy',
        subtitle: 'Partial fine-tuning variants keep some of the strongest human-alignment in the last layer.',
        data: results.attentionLastLayer,
        maxValue: 0.32,
        formatter: (value) => value.toFixed(2)
      })
    );
    panel.appendChild(grid);
    const note = el('aside', 'chart-note');
    note.append(el('p', '', results.interpretations.attention));
    panel.appendChild(note);
  });

  addTab('embedding', 'Embedding space', (panel) => {
    const grid = el('div', 'chart-grid');
    grid.appendChild(
      createHorizontalBarChart({
        title: 'Linear ID average',
        subtitle: 'Lower values suggest a more compressed representation space.',
        data: results.linearId,
        maxValue: 320,
        formatter: (value) => value.toFixed(0)
      })
    );
    grid.appendChild(
      createHorizontalBarChart({
        title: 'IsoScore average (x10^-3)',
        subtitle: 'Lower IsoScore here accompanies stronger compression and anisotropy.',
        data: results.isoScore,
        maxValue: 30,
        formatter: (value) => value.toFixed(2)
      })
    );
    panel.appendChild(grid);
    const note = el('aside', 'chart-note');
    note.append(el('p', '', results.interpretations.embedding));
    panel.appendChild(note);
  });

  return shell;
}

function createTakeaways(items) {
  const grid = el('div', 'takeaway-grid');
  items.forEach((item) => {
    const card = el('article', 'takeaway-card');
    card.append(el('strong', '', item.title), el('p', '', item.body));
    grid.appendChild(card);
  });
  return grid;
}

function createLimitations(items) {
  const list = el('ul', 'limit-list');
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  });
  return list;
}

function appendSection(container, title, body, contentBuilder) {
  const section = el('section', 'explorable-panel');
  section.appendChild(createSectionTitle(title, body));
  if (contentBuilder) section.appendChild(contentBuilder());
  container.appendChild(section);
  return section;
}

export function renderAnimatedPaper(container, slug) {
  if (!container) return;

  const paper = getAnimatedPaper(slug);
  const publication = getPublicationBySlug(slug);

  if (!paper || !publication) {
    setDocumentMeta('Animated Papers | lucia\'s notes', 'Explorable animated-paper companions.');
    clear(container);
    appendSection(
      container,
      'Missing paper',
      'This animated paper is not configured yet. Add the publication metadata and the explorable-paper content data to enable it.',
      null
    );
    return;
  }

  setDocumentMeta(`${publication.shortTitle} · Animated paper | lucia's notes`, paper.dek);
  clear(container);
  const stack = el('div', 'explorable-stack');
  container.appendChild(stack);

  const hero = el('section', 'explorable-hero');
  hero.append(
    el('p', 'explorable-kicker', 'Animated paper'),
    el('h1', '', paper.title),
    el('p', 'explorable-dek', paper.dek),
    el('p', 'explorable-summary', paper.abstract)
  );

  const meta = el('div', 'explorable-meta');
  meta.append(el('span', '', publication.venue || 'Publication'), el('span', '', publication.year));
  hero.append(meta, createMetricGrid(paper));

  const actions = el('div', 'explorable-actions');
  if (paper.links?.pdf) actions.appendChild(createAction('Read PDF', paper.links.pdf, 'primary', true));
  actions.appendChild(createAction('Animated paper', animatedPaperHref(publication), 'accent'));
  actions.appendChild(createAction('Paper page', publicationDetailHref(publication), 'secondary'));
  if (publication.links?.code) {
    actions.appendChild(createAction('Code', publication.links.code, 'secondary', true));
  }
  hero.appendChild(actions);
  stack.appendChild(hero);

  appendSection(
    stack,
    'Why This Question Matters',
    'The contribution is not only about benchmark scores. It asks whether a language model can absorb signals from human reading and become more interpretable without giving up practical usefulness.',
    () => createQuestionGrid(paper.questions)
  );

  appendSection(
    stack,
    'How ET Is Injected',
    'Each strategy changes how the model sees the eye-tracking objective and how that signal is transferred into downstream learning.',
    () => createStrategyExplorer(paper.strategyFigure)
  );

  appendSection(
    stack,
    'Experimental Setup',
    'The setup stays compact: one encoder backbone, one eye-tracking corpus, a fixed feature set, and downstream evaluations that let the cognitive signal be compared against a strong task baseline.',
    () => createSetupGrid(paper.setup)
  );

  appendSection(
    stack,
    'Results Explorer',
    'Switch between performance, attention, and embedding-space views. The aim is to make the central pattern visible quickly: ET supervision mostly preserves performance while changing how the model attends and organizes its internal space.',
    () => createResultsExplorer(paper)
  );

  appendSection(
    stack,
    'Main Takeaways',
    'The strongest story is not that eye-tracking magically boosts every metric. It is that cognitive supervision reshapes the model in interpretable ways while keeping downstream quality competitive.',
    () => createTakeaways(paper.takeaways)
  );

  appendSection(
    stack,
    'Limitations And Next Steps',
    'The evidence is promising, but the paper is careful about scope. The findings should be read as a solid case study rather than a universal law about cognitive supervision.',
    () => createLimitations(paper.limitations)
  );
}
