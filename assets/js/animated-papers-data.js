export const ANIMATED_PAPERS = {
  'from-human-reading-to-nlm-understanding': {
    slug: 'from-human-reading-to-nlm-understanding',
    title:
      'From Human Reading to NLM Understanding: Evaluating the Role of Eye-Tracking Data in Encoder-Based Models',
    dek:
      'Eye-tracking supervision keeps RoBERTa-base strong on tasks while shifting attention and geometry in more human-like directions.',
    abstract:
      'GECO eye-tracking features improve attention alignment and compress the representation space, while downstream performance stays close to the task-only baseline.',
    heroHighlights: [
      { label: 'Performance', body: 'Mostly preserved' },
      { label: 'Attention', body: 'More human-aligned' },
      { label: 'Geometry', body: 'More compressed' }
    ],
    links: {
      pdf: 'https://aclanthology.org/2025.acl-long.870/'
    },
    questions: [
      {
        title: 'Downstream performance',
        body: 'Does ET transfer keep task scores strong?'
      },
      {
        title: 'Attention alignment',
        body: 'Does attention move closer to human reading?'
      },
      {
        title: 'Embedding geometry',
        body: 'Does the representation space compress?'
      }
    ],
    strategyFigure: {
      intro: 'Switch strategy.',
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
          emphasis: 'Strong performance + strong compression.',
          description: 'PT -> EYE -> DST. Includes INT-FULL, LAST3, LAST2, and CLF variants.'
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
          emphasis: 'Lighter transfer, weaker geometry shift.',
          description: 'Adapters carry ET transfer instead of full model updates.'
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
          emphasis: 'Near-baseline performance, better alignment.',
          description: 'EYE and DST batches are interleaved during fine-tuning.'
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
          emphasis: 'Broader supervision, milder gains.',
          description: 'Silver ET labels extend the multi-task setup beyond human annotations.'
        }
      ]
    },
    setup: {
      cards: [
        { label: 'Model', value: 'RoBERTa-base', note: 'Single encoder backbone.' },
        { label: 'Readers', value: '12', note: 'After excluding 2 incomplete readers.' },
        { label: 'Corpus', value: 'GECO', note: '56,410 words, 588 sentences.' },
        { label: 'ET features', value: '5', note: 'FFD, GD, FRNF, TRT, TNF.' },
        { label: 'Transfer families', value: '4', note: 'INT, LORA, MT-IL, MT-SILV.' },
        { label: 'Downstream eval', value: 'COMP + GLUE', note: 'Task quality tracked alongside interpretability.' }
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
          'ET transfer mostly preserves task quality.',
        attention:
          'ET transfer makes attention more human-aligned.',
        embedding:
          'ET transfer compresses the embedding space; INT-FULL stands out.'
      }
    },
    takeaways: [
      {
        title: 'Task scores stay strong',
        body: 'Most variants stay close to DST-ONLY.'
      },
      {
        title: 'Attention gets closer to readers',
        body: 'ET supervision improves correlation with human attention.'
      },
      {
        title: 'Representations compress',
        body: 'Linear ID and IsoScore both move downward.'
      },
      {
        title: 'Strategy choice matters',
        body: 'INT-FULL favors compression; partial tuning favors alignment.'
      }
    ],
    limitations: [
      'Only RoBERTa-base is tested.',
      'Only GECO provides the cognitive signal.',
      'The pattern may not transfer to other architectures or corpora.'
    ]
  }
};

export function getAnimatedPaper(slug) {
  return ANIMATED_PAPERS[slug] || null;
}
