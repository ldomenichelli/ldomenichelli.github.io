/** Shared navigation and method cards for the intrinsic-dimensionality notebook. */
export const ID_ALGORITHMS = Object.freeze([
  {
    key: 'mle', shortTitle: 'MLE', title: 'Levina–Bickel MLE',
    tag: 'Neighbour distances', scope: 'Local manifold dimension',
    blurb: 'Read dimension in the spacing between nearby points. Start here to explore the role of neighbourhood size.',
    href: '/projects/intrinsic-dimensionality/mle/'
  },
  {
    key: 'ess', shortTitle: 'ESS', title: 'Expected simplex skewness',
    tag: 'Local angles', scope: 'Local manifold dimension',
    blurb: 'Look at the geometry between centred vectors. Watch angles turn into a dimension estimate.',
    href: '/projects/intrinsic-dimensionality/ess/'
  },
  {
    key: 'twonn', shortTitle: 'TwoNN', title: 'Two nearest neighbours',
    tag: 'Minimal neighbourhoods', scope: 'Manifold dimension',
    blurb: 'Just two distances per point. A simple ratio becomes a fitted line whose slope estimates dimension.',
    href: '/projects/intrinsic-dimensionality/twonn/'
  },
  {
    key: 'correlation', shortTitle: 'Correlation', title: 'Correlation dimension',
    tag: 'Scaling across radii', scope: 'Correlation dimension',
    blurb: 'Count close pairs as the radius grows. Explore the scaling region behind the correlation dimension.',
    href: '/projects/intrinsic-dimensionality/correlation/'
  },
  {
    key: 'pca', shortTitle: 'PCA / PR', title: 'PCA participation ratio',
    tag: 'Variance & linear structure', scope: 'Effective linear dimension',
    blurb: 'Follow the variance across principal axes. An effective linear dimension, with a different view of curved data.',
    href: '/projects/intrinsic-dimensionality/pca/'
  }
]);

const diagrams = {
  mle: '<circle cx="60" cy="44" r="31"/><circle cx="60" cy="44" r="19"/><circle cx="60" cy="44" r="6" class="id-diagram-solid"/><path d="M60 44L89 33"/><circle cx="89" cy="33" r="3" class="id-diagram-dot"/><circle cx="48" cy="31" r="3" class="id-diagram-dot"/><circle cx="67" cy="58" r="3" class="id-diagram-dot"/>',
  ess: '<path d="M29 69L60 39L94 58M60 39L77 14M60 39L22 25"/><path d="M48 51Q60 63 75 48" stroke-dasharray="3 3"/><circle cx="60" cy="39" r="4" class="id-diagram-solid"/><circle cx="29" cy="69" r="4" class="id-diagram-dot"/><circle cx="94" cy="58" r="4" class="id-diagram-dot"/><circle cx="77" cy="14" r="4" class="id-diagram-dot"/><circle cx="22" cy="25" r="4" class="id-diagram-dot"/>',
  twonn: '<circle cx="48" cy="45" r="15"/><circle cx="48" cy="45" r="34"/><circle cx="48" cy="45" r="4" class="id-diagram-solid"/><path d="M48 45L62 40M48 45L75 66"/><circle cx="62" cy="40" r="4" class="id-diagram-dot"/><circle cx="75" cy="66" r="4" class="id-diagram-dot"/>',
  correlation: '<path d="M20 15V72H105"/><path d="M28 65L96 22" class="id-diagram-fit"/><circle cx="32" cy="63" r="3" class="id-diagram-dot"/><circle cx="45" cy="55" r="3" class="id-diagram-dot"/><circle cx="60" cy="45" r="3" class="id-diagram-dot"/><circle cx="76" cy="34" r="3" class="id-diagram-dot"/><circle cx="94" cy="24" r="3" class="id-diagram-dot"/>',
  pca: '<path d="M18 72H106"/><rect x="24" y="18" width="16" height="54" rx="3" class="id-diagram-solid"/><rect x="48" y="39" width="16" height="33" rx="3" class="id-diagram-dot"/><rect x="72" y="59" width="16" height="13" rx="3"/><rect x="96" y="66" width="8" height="6" rx="2"/>'
};

export function buildAlgorithmSwitch(container, currentKey) {
  if (!container) return;
  container.replaceChildren();
  container.setAttribute('aria-label', 'Choose an estimator');
  for (const alg of [{ key: 'compare', shortTitle: 'Overview', href: '/projects/intrinsic-dimensionality/' }, ...ID_ALGORITHMS]) {
    const a = document.createElement('a');
    a.href = alg.href;
    a.textContent = alg.shortTitle;
    a.className = `id-method-link${alg.key === currentKey ? ' is-active' : ''}`;
    a.dataset.methodLink = alg.key;
    if (alg.key === currentKey) a.setAttribute('aria-current', 'page');
    container.appendChild(a);
  }
}

export function buildChooserCards(container) {
  if (!container) return;
  container.replaceChildren();
  ID_ALGORITHMS.forEach((alg, index) => {
    const card = document.createElement('a');
    card.className = `id-method-card id-method-${alg.key}`;
    card.href = alg.href;
    card.dataset.methodLink = alg.key;
    card.innerHTML = `<div class="id-card-top"><span>0${index + 1}</span><svg viewBox="0 0 120 88" aria-hidden="true">${diagrams[alg.key]}</svg><span aria-hidden="true">↗</span></div><span class="id-card-tag">${alg.tag}</span><h3>${alg.title}</h3><p>${alg.blurb}</p><span class="id-card-footer">Explore ${alg.shortTitle} <span aria-hidden="true">→</span></span>`;
    container.appendChild(card);
  });
}
