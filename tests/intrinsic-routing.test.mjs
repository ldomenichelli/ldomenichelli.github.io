import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function file(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('intrinsic-dimensionality chooser renders through shared algorithm registry', () => {
  const html = file('projects/intrinsic-dimensionality/index.html');
  assert.match(html, /assets\/js\/id-algorithms\.js/);
  assert.match(html, /id="algorithmGrid"/);
});

test('algorithm pages expose in-page switch links/containers for chooser, MLE, and ESS', () => {
  const mle = file('projects/intrinsic-dimensionality/mle/index.html');
  const ess = file('projects/intrinsic-dimensionality/ess/index.html');
  assert.match(mle, /id="algorithmSwitch"/);
  assert.match(ess, /id="algorithmSwitch"/);
  assert.match(mle, /buildAlgorithmSwitch\([^\n]*'mle'/);
  assert.match(ess, /buildAlgorithmSwitch\([^\n]*'ess'/);
});
