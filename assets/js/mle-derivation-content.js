export const MLE_SYMBOLS = [
  { key: 'm', label: 'm', meaning: 'Local intrinsic dimension (approximate, scale-dependent).' },
  { key: 'R', label: 'R', meaning: 'Local radius defining neighborhood around x.' },
  { key: 'T_j', label: 'T_j', meaning: 'Distance from x to its j-th nearest neighbor.' },
  { key: 'N(t,x)', label: 'N(t,x)', meaning: 'Neighbor count inside radius t around x.' },
  { key: 'V(m)', label: 'V(m)', meaning: 'Unit m-ball volume constant.' },
  { key: 'f(x)', label: 'f(x)', meaning: 'Local sampling density at x (locally constant approximation).' },
  { key: 'theta', label: 'θ', meaning: 'Log-density reparameterization: θ = log f(x).' },
  { key: 'lambda(t)', label: 'λ(t)', meaning: 'Poisson-process intensity over radius t.' },
  { key: 'k', label: 'k', meaning: 'Chosen neighborhood scale for fixed-k estimator.' },
];

export const MLE_DERIVATION_STEPS = [
  {
    title: '1) Local modeling assumptions',
    lines: [
      'Assume data lie on or near an m-dimensional manifold embedded in a higher-dimensional space.',
      'Fix x; inside a small ball S_x(R), approximate f(u) ≈ f(x).',
      'This is explicitly approximate and local, not globally exact.'
    ],
    symbols: ['m', 'R', 'f(x)'],
  },
  {
    title: '2) Counting process',
    lines: [
      'Define N(t,x)=#{X_i : ||X_i - x|| ≤ t}, for 0 ≤ t ≤ R.',
      'As t grows, the ball sweeps outward and counts arrivals.',
      'This motivates a Poisson counting-process approximation in radius.'
    ],
    symbols: ['N(t,x)', 'R', 'T_j'],
  },
  {
    title: '3) Why λ(t)=f(x)V(m)m t^(m-1)',
    lines: [
      'm-ball volume scales as V(m)t^m.',
      'Differentiate in t: d/dt[V(m)t^m] = V(m)m t^(m-1) (shell factor).',
      'Multiply by local density f(x) to get λ(t).'
    ],
    symbols: ['V(m)', 'm', 'f(x)', 'lambda(t)'],
  },
  {
    title: '4) Log-likelihood',
    lines: [
      'Introduce θ = log f(x).',
      'L(m,θ)=∫_0^R log(λ(t)) dN(t) - ∫_0^R λ(t) dt.',
      'Observed arrivals contribute via log λ; expected arrivals are subtracted via ∫λ.'
    ],
    symbols: ['theta', 'lambda(t)', 'N(t,x)'],
  },
  {
    title: '5) Score equations and fixed-radius estimator',
    lines: [
      'Set ∂_θ L=0, solve for θ first, then substitute into ∂_m L=0.',
      'After algebra: m̂_R(x) = [ (1/N(R,x)) Σ_{j=1}^{N(R,x)} log(R/T_j(x)) ]^(-1).',
      'Every step uses local-constant density and Poissonized counting assumptions.'
    ],
    symbols: ['theta', 'm', 'R', 'T_j', 'N(t,x)'],
  },
  {
    title: '6) Fixed-k estimator',
    lines: [
      'Set R=T_k(x) to adapt radius to local sample density.',
      'm̂_k(x) = [ (1/(k-1)) Σ_{j=1}^{k-1} log(T_k(x)/T_j(x)) ]^(-1).',
      'j=k is omitted since log(T_k/T_k)=0.'
    ],
    symbols: ['k', 'R', 'T_j', 'm'],
  },
  {
    title: '7) Scale dependence and k-averaging',
    lines: [
      'm̂_k can vary strongly with k because geometry/noise differ by scale.',
      'Inspect m̂_k versus k locally and globally.',
      'Optionally average over k1..k2 to reduce single-k sensitivity.'
    ],
    symbols: ['k', 'm'],
  },
  {
    title: '8) Asymptotic intuition',
    lines: [
      'Under Poisson approximation, log-ratio terms behave like transformed exponential order-statistic gaps.',
      'Their sums lead to Gamma-like behavior, clarifying normalization and variance shrinkage as k grows.',
      'But too-large k can hurt because locality assumptions degrade.'
    ],
    symbols: ['k', 'lambda(t)', 'm'],
  },
  {
    title: '9) Caveats / failure modes',
    lines: [
      'Boundary effects break isotropic local support assumptions.',
      'Curvature/mixed scales violate a single local m over the neighborhood.',
      'Noise/outliers disturb nearest-neighbor order structure and stability.'
    ],
    symbols: ['N(t,x)', 'm', 'f(x)'],
  }
];
