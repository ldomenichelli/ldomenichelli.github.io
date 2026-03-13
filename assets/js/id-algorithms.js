export const ID_ALGORITHMS = [
  {
    key: 'mle',
    title: 'Levina–Bickel MLE',
    blurb: 'Distance-ratio estimator over ordered k-nearest-neighbor radii.',
    href: '/projects/intrinsic-dimensionality/mle/'
  },
  {
    key: 'ess',
    title: 'ESSa (Expected Simplex Skewness)',
    blurb: 'Angular estimator from centroid vectors and simplex skewness.',
    href: '/projects/intrinsic-dimensionality/ess/'
  }
];

export function buildAlgorithmSwitch(container, currentKey) {
  if (!container) return;
  const chooser = document.createElement('a');
  chooser.href = '/projects/intrinsic-dimensionality/';
  chooser.textContent = 'Chooser';
  chooser.className = 'algo-pill';
  container.appendChild(chooser);

  for (const alg of ID_ALGORITHMS) {
    const a = document.createElement('a');
    a.href = alg.href;
    a.textContent = alg.key.toUpperCase();
    a.className = `algo-pill${alg.key === currentKey ? ' active' : ''}`;
    container.appendChild(a);
  }
}

export function buildChooserCards(container) {
  if (!container) return;
  for (const alg of ID_ALGORITHMS) {
    const section = document.createElement('section');
    section.className = 'card';
    section.innerHTML = `
      <h2>${alg.title}</h2>
      <p>${alg.blurb}</p>
      <div class="actions"><a class="btn${alg.key === 'ess' ? ' secondary' : ''}" href="${alg.href}">Open ${alg.key.toUpperCase()} explorer</a></div>
    `;
    container.appendChild(section);
  }
}
