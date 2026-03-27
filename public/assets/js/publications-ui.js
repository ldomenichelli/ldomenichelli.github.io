import {
  PUBLICATIONS,
  animatedPaperHref,
  getPublicationBySlug,
  publicationDetailHref,
  publicationPrimaryLinks
} from './publications-data.js';

function clear(node) {
  if (node) node.textContent = '';
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (typeof text === 'string') node.textContent = text;
  return node;
}

function createLink({ label, href, kind = 'secondary', external = false }) {
  const anchor = el('a', `publication-action ${kind}`, label);
  anchor.href = href;
  if (external) {
    anchor.target = '_blank';
    anchor.rel = 'noreferrer noopener';
  }
  return anchor;
}

function createTag(text) {
  return el('span', 'publication-tag', text);
}

function setDocumentMeta(title, description) {
  if (typeof document === 'undefined') return;
  document.title = title;
  const descriptionTag = document.querySelector('meta[name="description"]');
  if (descriptionTag) descriptionTag.setAttribute('content', description);
}

function renderActions(container, publication) {
  const actions = el('div', 'publication-actions');
  for (const link of publicationPrimaryLinks(publication)) actions.appendChild(createLink(link));
  container.appendChild(actions);
}

function renderMeta(publication) {
  const meta = el('div', 'publication-meta');
  meta.append(
    el('span', '', publication.venue || 'Publication'),
    el('span', '', publication.year),
    el('span', '', publication.status || 'Paper')
  );
  return meta;
}

function renderQuestionList(publication) {
  const section = el('section', 'publication-focus');
  const heading = el('h2', '', 'What this paper studies');
  section.appendChild(heading);
  if (publication.researchQuestions?.length) {
    const list = document.createElement('ul');
    for (const question of publication.researchQuestions) {
      const item = document.createElement('li');
      item.textContent = question;
      list.appendChild(item);
    }
    section.appendChild(list);
  } else {
    section.appendChild(el('p', '', publication.summary));
  }
  return section;
}

function renderPublicationCard(publication) {
  const article = el('article', 'publication-card publication-grid-card');
  const title = el('h2');
  const link = el('a', 'publication-title-link', publication.title);
  link.href = publicationDetailHref(publication);
  title.appendChild(link);
  article.append(title, renderMeta(publication), el('p', '', publication.summary));

  if (publication.badges?.length) {
    const tags = el('div', 'publication-tags');
    for (const badge of publication.badges) tags.appendChild(createTag(badge));
    article.appendChild(tags);
  }

  renderActions(article, publication);
  return article;
}

export function renderPublicationsList(container) {
  if (!container) return;
  clear(container);
  setDocumentMeta(
    'Publications | lucia\'s notes',
    'Research papers and interactive animated-paper companions.'
  );

  const hero = el('section', 'publication-hero');
  hero.append(
    el('p', 'publication-kicker', 'Research'),
    el('h1', '', 'Publications'),
    el(
      'p',
      '',
      'A compact index of research papers on the site. Entries with an interactive companion show an Animated paper button so the results can be explored without reading the PDF first.'
    )
  );
  container.appendChild(hero);

  const list = el('section', 'publication-list');
  for (const publication of PUBLICATIONS) list.appendChild(renderPublicationCard(publication));
  container.appendChild(list);
}

function renderMissingState(container, message) {
  clear(container);
  const notice = el('section', 'publication-notice');
  notice.appendChild(el('p', 'publication-empty', message));
  container.appendChild(notice);
}

export function renderPublicationDetail(container, slug) {
  if (!container) return;
  const publication = getPublicationBySlug(slug);
  if (!publication) {
    setDocumentMeta('Publication Page | lucia\'s notes', 'Structured publication detail page.');
    renderMissingState(
      container,
      'This paper is not in the structured publications index yet. Add it in /assets/js/publications-data.js to make it available here.'
    );
    return;
  }

  setDocumentMeta(`${publication.shortTitle} | lucia's notes`, publication.summary);
  clear(container);

  const hero = el('section', 'publication-hero');
  hero.append(
    el('p', 'publication-kicker', 'Publication'),
    el('h1', '', publication.title),
    renderMeta(publication),
    el('p', '', publication.summary)
  );

  if (publication.badges?.length) {
    const tags = el('div', 'publication-tags');
    for (const badge of publication.badges) tags.appendChild(createTag(badge));
    hero.appendChild(tags);
  }

  renderActions(hero, publication);
  container.appendChild(hero);

  const summary = el('section', 'publication-summary');
  summary.append(
    el('h2', '', 'At a glance'),
    el(
      'p',
      '',
      'The paper uses eye-tracking supervision as a controlled probe: can a model learn from human reading behavior while still staying effective on downstream tasks? The linked animated paper focuses on the transfer strategies, result patterns, and the geometry story.'
    )
  );
  if (animatedPaperHref(publication)) {
    const inlineActions = el('div', 'publication-inline-actions');
    inlineActions.appendChild(
      createLink({
        label: 'Open animated paper',
        href: animatedPaperHref(publication),
        kind: 'accent'
      })
    );
    summary.appendChild(inlineActions);
  }
  container.appendChild(summary);

  container.appendChild(renderQuestionList(publication));

  const quickFacts = el('section', 'publication-grid');
  const factOne = el('article', 'publication-grid-card');
  factOne.append(
    el('strong', '', 'Why this page exists'),
    el(
      'p',
      '',
      'Paper detail pages stay lightweight here. They point to the PDF for the full write-up and to the animated paper for the guided, explorable version.'
    )
  );
  quickFacts.appendChild(factOne);

  const factTwo = el('article', 'publication-grid-card');
  factTwo.append(
    el('strong', '', 'Reusable pattern'),
    el(
      'p',
      '',
      'The page is driven by shared publication metadata, so future papers can inherit the same layout, CTA buttons, and animated-paper wiring.'
    )
  );
  quickFacts.appendChild(factTwo);
  container.appendChild(quickFacts);
}

export function enhancePublicationMentions(root = document) {
  const nodes = root.querySelectorAll('[data-publication-slug]');
  for (const node of nodes) {
    const slug = node.getAttribute('data-publication-slug');
    const publication = getPublicationBySlug(slug);
    if (!publication) continue;

    let actionsHost = node.querySelector('[data-publication-actions]');
    if (!actionsHost) {
      actionsHost = el('div');
      actionsHost.setAttribute('data-publication-actions', '');
      node.appendChild(actionsHost);
    }

    if (actionsHost.dataset.enhanced === 'true') continue;
    actionsHost.dataset.enhanced = 'true';
    actionsHost.className = 'publication-inline-actions';
    actionsHost.appendChild(
      createLink({
        label: 'Paper page',
        href: publicationDetailHref(publication),
        kind: 'secondary'
      })
    );

    const animatedHref = animatedPaperHref(publication);
    if (animatedHref) {
      actionsHost.appendChild(
        createLink({
          label: 'Animated paper',
          href: animatedHref,
          kind: 'accent'
        })
      );
    }
  }
}
