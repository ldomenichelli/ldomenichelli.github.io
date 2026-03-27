export const ANIMATED_PAPERS = {
  'from-human-reading-to-nlm-understanding': {
    slug: 'from-human-reading-to-nlm-understanding',
    title:
      'From Human Reading to NLM Understanding: Evaluating the Role of Eye-Tracking Data in Encoder-Based Models',
    dek:
      'An explorable summary of how eye-tracking supervision changes task performance, attention alignment, and representation geometry in RoBERTa-base.',
    abstract:
      'The paper asks whether cognitive signals from human reading can be injected into encoder-based language models without sacrificing task performance. Using eye-tracking features from GECO, the authors compare several transfer strategies and show that eye-tracking supervision improves attention alignment with human attention and compresses the representation space, while preserving strong downstream results overall.',
    links: {
      pdf: 'https://aclanthology.org/2025.acl-long.870/'
    },
    questions: [
      {
        title: 'Downstream performance',
        body:
          'If the model is asked to learn from eye movements, does it still hold up on downstream benchmarks like COMP and GLUE?'
      },
      {
        title: 'Attention alignment',
        body:
          'Does eye-tracking supervision make model attention maps more correlated with where people actually look while reading?'
      },
      {
        title: 'Embedding geometry',
        body:
          'Does adding eye-tracking signals reshape the representation space, for example by making it more compressed or anisotropic?'
      }
    ],
    strategyFigure: {
      intro:
        'The paper compares four ways of transferring eye-tracking supervision into the model. Switch strategies to see how the training signal moves through the pipeline.',
      strategies: [
        {
          key: 'int',
          label: 'INT',
          longLabel: 'Intermediate fine-tuning',
          stages: [
            { label: 'PT', state: 'active' },
            { label: 'EYE', state: 'active' },
            { label: 'DST', state: 'active' }
          ],
          connectors: ['active', 'active'],
          emphasis: 'Full intermediate fine-tuning is especially strong for retaining performance while compressing the learned space.',
          description:
            'The base model is first adapted on the eye-tracking objective and only then fine-tuned on downstream tasks. The paper also compares partial variants such as INT-LAST3, INT-LAST2, and INT-CLF.'
        },
        {
          key: 'lora',
          label: 'LORA',
          longLabel: 'LoRA-based transfer',
          stages: [
            { label: 'PT', state: 'active' },
            { label: 'EYE', state: 'active' },
            { label: 'DST', state: 'active' }
          ],
          connectors: ['active', 'soft'],
          emphasis: 'LoRA offers a lighter-weight transfer path, but the geometry shift is weaker than with full intermediate tuning.',
          description:
            'Instead of fully updating the model during the eye-tracking phase, low-rank adapters carry the transfer. It is a parameter-efficient route from cognitive supervision to downstream adaptation.'
        },
        {
          key: 'mt-il',
          label: 'MT-IL',
          longLabel: 'Multi-task interleaved fine-tuning',
          stages: [
            { label: 'PT', state: 'active' },
            { label: 'EYE', state: 'split' },
            { label: 'DST', state: 'split' }
          ],
          connectors: ['dual', 'dual'],
          emphasis: 'Interleaving keeps downstream performance close to the baseline while still improving alignment.',
          description:
            'Eye-tracking and downstream updates are interleaved during fine-tuning. Rather than staging the objectives, the model learns from both signals within the same training period.'
        },
        {
          key: 'mt-silv',
          label: 'MT-SILV',
          longLabel: 'Multi-task with silver ET labels',
          stages: [
            { label: 'PT', state: 'active' },
            { label: 'SILVER LABELS', state: 'active' },
            { label: 'DST', state: 'active' }
          ],
          connectors: ['active', 'active'],
          emphasis: 'Silver labels expand where eye-like supervision can be applied, but the alignment and geometry gains are less extreme than the best ET-first variants.',
          description:
            'The multi-task setup is extended with silver eye-tracking labels so the model can learn an eye-inspired signal on more data than the original human annotations alone.'
        }
      ]
    },
    setup: {
      cards: [
        { label: 'Model', value: 'RoBERTa-base', note: 'Encoder backbone used in every condition.' },
        { label: 'Readers', value: '12', note: 'Two incomplete readers are excluded from the analysis.' },
        { label: 'Corpus', value: 'GECO', note: '56,410 words across 588 sentences.' },
        { label: 'ET features', value: '5', note: 'FFD, GD, FRNF, TRT, and TNF.' },
        { label: 'Transfer families', value: '4', note: 'INT, LORA, MT-IL, and MT-SILV.' },
        { label: 'Downstream eval', value: 'COMP + GLUE', note: 'Task performance is tracked alongside interpretability-oriented analyses.' }
      ],
      featureLabels: ['FFD', 'GD', 'FRNF', 'TRT', 'TNF']
    },
    results: {
      performance: [
        { label: 'DST-ONLY', value: 0.83, highlight: 'baseline' },
        { label: 'INT-FULL', value: 0.82, highlight: 'best-transfer' },
        { label: 'MT-IL', value: 0.81, highlight: 'strong' },
        { label: 'LORA', value: 0.76 },
        { label: 'MT-SILV', value: 0.76 },
        { label: 'INT-LAST3', value: 0.71 },
        { label: 'INT-LAST2', value: 0.66 },
        { label: 'INT-CLF', value: 0.5 }
      ],
      attentionSummary: [
        { label: 'BASE', value: 0.18 },
        { label: 'EYE-ONLY', value: 0.25 }
      ],
      attentionLastLayer: [
        { label: 'DST-ONLY', value: 0.08, highlight: 'baseline' },
        { label: 'INT-FULL', value: 0.13 },
        { label: 'LORA', value: 0.21 },
        { label: 'MT-IL', value: 0.24 },
        { label: 'MT-SILV', value: 0.24 },
        { label: 'INT-LAST3', value: 0.25 },
        { label: 'INT-LAST2', value: 0.27 },
        { label: 'INT-CLF', value: 0.29, highlight: 'best-alignment' }
      ],
      linearId: [
        { label: 'BASE', value: 297 },
        { label: 'DST-ONLY', value: 186, highlight: 'baseline' },
        { label: 'EYE-ONLY', value: 160 },
        { label: 'INT-CLF', value: 160 },
        { label: 'INT-LAST2', value: 157 },
        { label: 'INT-LAST3', value: 151 },
        { label: 'INT-FULL', value: 117, highlight: 'most-compressed' },
        { label: 'LORA', value: 201 },
        { label: 'MT-IL', value: 178 },
        { label: 'MT-SILV', value: 232 }
      ],
      isoScore: [
        { label: 'BASE', value: 28.69 },
        { label: 'DST-ONLY', value: 10.78, highlight: 'baseline' },
        { label: 'EYE-ONLY', value: 4.97 },
        { label: 'INT-CLF', value: 4.99 },
        { label: 'INT-LAST2', value: 4.99 },
        { label: 'INT-LAST3', value: 4.42 },
        { label: 'INT-FULL', value: 4.09, highlight: 'most-compressed' },
        { label: 'LORA', value: 11.93 },
        { label: 'MT-IL', value: 3.53 },
        { label: 'MT-SILV', value: 12.18 }
      ],
      interpretations: {
        performance:
          'Most transfer strategies stay reasonably close to the downstream-only baseline, which supports the central claim that ET supervision is not obviously trading away task quality.',
        attention:
          'Eye-tracking supervision raises average attention correlation, and the strongest last-layer alignment comes from partial fine-tuning after ET training rather than from the baseline.',
        embedding:
          'Lower Linear ID and lower IsoScore indicate a more compressed, more anisotropic space. Full intermediate fine-tuning stands out as a particularly strong compression regime while preserving performance.'
      }
    },
    takeaways: [
      {
        title: 'Interpretability without obvious collapse',
        body:
          'Injecting ET signals does not materially hurt downstream task performance overall, so cognitive supervision can be explored without immediately sacrificing usefulness.'
      },
      {
        title: 'Attention gets closer to human reading',
        body:
          'Across layers and especially in several last-layer transfer variants, attention becomes more aligned with human fixation patterns than in the downstream-only baseline.'
      },
      {
        title: 'Representations become more compressed',
        body:
          'Both Linear ID and IsoScore shift downward, suggesting that ET supervision encourages a tighter and more anisotropic embedding geometry.'
      },
      {
        title: 'Strategy choice changes the trade-off',
        body:
          'INT-FULL is especially strong for preserving performance and compressing representations, while partial ET-to-DST fine-tuning tends to preserve the strongest attention alignment.'
      }
    ],
    limitations: [
      'Only RoBERTa-base is evaluated, so the results do not yet tell us whether larger encoders or decoder-heavy architectures behave the same way.',
      'The eye-tracking signal comes only from GECO, which limits how broadly the cognitive findings can be generalized across reading settings and populations.',
      'The paper shows promising alignment and geometry effects, but those gains should not be overgeneralized to every architecture, task family, or ET corpus.'
    ]
  }
};

export function getAnimatedPaper(slug) {
  return ANIMATED_PAPERS[slug] || null;
}
