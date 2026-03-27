import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function file(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('publications index, detail route, and animated-paper route are wired through shared containers', () => {
  const list = file('publications/index.html');
  const detail = file('publications/paper/index.html');
  const animated = file('animated-papers/index.html');

  assert.match(list, /id="publicationsIndex"/);
  assert.match(list, /renderPublicationsList/);
  assert.match(detail, /id="publicationDetail"/);
  assert.match(detail, /params\.get\('paper'\)/);
  assert.match(detail, /renderPublicationDetail/);
  assert.match(animated, /id="animatedPaperRoot"/);
  assert.match(animated, /renderAnimatedPaper/);
});

test('shared publication metadata exposes the eye-tracking paper and animated-paper route fields', () => {
  const data = file('assets/js/publications-data.js');

  assert.match(data, /slug:\s*'from-human-reading-to-nlm-understanding'/);
  assert.match(data, /animatedPaper:\s*\{/);
  assert.match(data, /enabled:\s*true/);
  assert.match(data, /\/animated-papers\/\?paper=/);
  assert.match(data, /label:\s*'Animated paper'/);
});

test('animated paper dataset includes all three result areas and the four strategy families', () => {
  const data = file('assets/js/animated-papers-data.js');

  assert.match(data, /Average downstream performance|performance:/);
  assert.match(data, /attentionSummary/);
  assert.match(data, /linearId/);
  assert.match(data, /IsoScore/);
  assert.match(data, /label:\s*'INT'/);
  assert.match(data, /label:\s*'LORA'/);
  assert.match(data, /label:\s*'MT-IL'/);
  assert.match(data, /label:\s*'MT-SILV'/);
});

test('about page and home page surface the new publications flow', () => {
  const about = file('about/index.html');
  const home = file('index.html');

  assert.match(about, /href="\/publications\/">See publications/);
  assert.match(about, /data-publication-slug="from-human-reading-to-nlm-understanding"/);
  assert.match(about, /enhancePublicationMentions/);
  assert.match(home, /href=\/publications/);
});
