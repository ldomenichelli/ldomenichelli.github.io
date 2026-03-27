export const PUBLICATIONS = [
  {
    slug: 'from-human-reading-to-nlm-understanding',
    title:
      'From Human Reading to NLM Understanding: Evaluating the Role of Eye-Tracking Data in Encoder-Based Models',
    shortTitle: 'From Human Reading to NLM Understanding',
    year: '2025',
    venue: 'ACL 2025',
    status: 'Accepted paper',
    summary:
      'A study of whether injecting eye-tracking signals into RoBERTa-base changes downstream performance, human-alignment of attention, and embedding-space geometry.',
    researchQuestions: [
      'Does eye-tracking injection preserve downstream task performance?',
      'Does it make model attention more aligned with human reading behavior?',
      'Does it reshape the geometry of the learned representation space?'
    ],
    links: {
      pdf: 'https://aclanthology.org/2025.acl-long.870/'
    },
    badges: ['Eye-tracking', 'RoBERTa-base', 'Representation learning'],
    animatedPaper: {
      enabled: true,
      slug: 'from-human-reading-to-nlm-understanding'
    }
  }
];

export function getPublicationBySlug(slug) {
  return PUBLICATIONS.find((publication) => publication.slug === slug) || null;
}

export function publicationDetailHref(slugOrPublication) {
  const slug =
    typeof slugOrPublication === 'string' ? slugOrPublication : slugOrPublication?.slug;
  return slug ? `/publications/paper/?paper=${encodeURIComponent(slug)}` : '/publications/';
}

export function animatedPaperHref(slugOrPublication) {
  const publication =
    typeof slugOrPublication === 'string'
      ? getPublicationBySlug(slugOrPublication)
      : slugOrPublication;

  if (!publication?.animatedPaper?.enabled) return null;
  const slug = publication.animatedPaper.slug || publication.slug;
  return `/animated-papers/?paper=${encodeURIComponent(slug)}`;
}

export function publicationPrimaryLinks(publication) {
  const links = [
    { label: 'Paper page', href: publicationDetailHref(publication), kind: 'secondary' }
  ];

  if (publication.links?.pdf) {
    links.unshift({ label: 'Read PDF', href: publication.links.pdf, kind: 'primary', external: true });
  }

  const animatedHref = animatedPaperHref(publication);
  if (animatedHref) {
    links.push({ label: 'Animated paper', href: animatedHref, kind: 'accent' });
  }

  if (publication.links?.code) {
    links.push({ label: 'Code', href: publication.links.code, kind: 'secondary', external: true });
  }

  if (publication.links?.citation) {
    links.push({
      label: 'Citation',
      href: publication.links.citation,
      kind: 'secondary',
      external: publication.links.citation.startsWith('http')
    });
  }

  return links;
}
