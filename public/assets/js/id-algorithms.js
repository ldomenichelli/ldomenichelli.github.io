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
    const card = document.createElement('a');
    card.className = 'project-link-card';
    card.href = alg.href;
    card.innerHTML = `
      <strong>${alg.title}</strong>
      <small>${alg.blurb}</small>
    `;
    container.appendChild(card);
  }
}
