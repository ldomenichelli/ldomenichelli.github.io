import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ID_ALGORITHMS } from '../assets/js/id-algorithms.js';

function file(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const methods = ['mle', 'ess', 'twonn', 'correlation', 'pca'];

test('the intrinsic-dimensionality registry exposes five distinct estimator routes', () => {
  assert.deepEqual(ID_ALGORITHMS.map((algorithm) => algorithm.key).sort(), [...methods].sort());
  assert.equal(new Set(ID_ALGORITHMS.map((algorithm) => algorithm.href)).size, methods.length);
  for (const algorithm of ID_ALGORITHMS) {
    assert.equal(algorithm.href, `/projects/intrinsic-dimensionality/${algorithm.key}/`);
    assert.ok(algorithm.title.length > 0);
  }
});

test('the laboratory overview loads the shared entry point and provides a method directory', () => {
  const html = file('projects/intrinsic-dimensionality/index.html');
  assert.match(html, /assets\/js\/id-lab\.js/);
  assert.match(html, /id="algorithmGrid"/);
  assert.match(html, /data-id-lab/);
});

for (const method of methods) {
  test(`${method} route mounts the shared laboratory and declares its own canonical URL`, () => {
    const html = file(`projects/intrinsic-dimensionality/${method}/index.html`);
    assert.match(html, /assets\/js\/id-lab\.js/);
    assert.match(html, /data-id-lab/);
    assert.match(html, new RegExp(`data-method="${method}"`));
    assert.match(html, /id="algorithmSwitch"/);
    assert.match(html, new RegExp(`rel="canonical"[^>]+/projects/intrinsic-dimensionality/${method}/`));
  });
}
