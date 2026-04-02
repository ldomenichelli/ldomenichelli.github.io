const SVG_NS = "http://www.w3.org/2000/svg";

export function createSvgElement(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => {
    node.setAttribute(key, String(value));
  });
  return node;
}

export function clearChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export function buildSvg(width, height, className = "") {
  return createSvgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    class: className,
    role: "img",
    "aria-hidden": "true"
  });
}

function buildProgressBar() {
  let progress = document.querySelector(".tda-progress");
  if (!progress) {
    progress = document.createElement("div");
    progress.className = "tda-progress";
    progress.innerHTML = '<span class="tda-progress-bar"></span>';
    document.body.prepend(progress);
  }
  return progress.querySelector(".tda-progress-bar");
}

function bindProgress(article, bar) {
  let ticking = false;

  function update() {
    ticking = false;
    const rect = article.getBoundingClientRect();
    const viewport = window.innerHeight;
    const total = Math.max(article.offsetHeight - viewport * 0.55, 1);
    const passed = Math.min(Math.max(-rect.top + viewport * 0.18, 0), total);
    bar.style.transform = `scaleX(${(passed / total).toFixed(4)})`;
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(update);
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();
}

function buildNotebookToc(pageRoot, options = {}) {
  const {
    tocSelector = "[data-tda-toc]",
    jumpSelector = "[data-tda-jump]",
    sectionSelector = "[data-tda-section]",
    labelAttribute = "data-tda-label",
    jumpLabel = "Jump to section"
  } = options;

  const tocRoot = pageRoot.querySelector(tocSelector);
  const jumpRoot = pageRoot.querySelector(jumpSelector);
  const sections = Array.from(pageRoot.querySelectorAll(sectionSelector));

  if (!tocRoot || !sections.length) {
    return;
  }

  const fragment = document.createDocumentFragment();
  const jumpSelect = jumpRoot ? document.createElement("select") : null;

  if (jumpSelect) {
    jumpSelect.className = "tda-jump-select";
    jumpSelect.setAttribute("aria-label", jumpLabel);
  }

  sections.forEach((section, index) => {
    const id = section.id;
    const label = section.getAttribute(labelAttribute) || section.querySelector("h2")?.textContent || `Section ${index + 1}`;
    const link = document.createElement("a");
    link.className = "tda-toc-link";
    link.href = `#${id}`;
    link.dataset.target = id;
    link.textContent = label;
    fragment.appendChild(link);

    if (jumpSelect) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = label;
      jumpSelect.appendChild(option);
    }
  });

  tocRoot.appendChild(fragment);

  if (jumpRoot && jumpSelect) {
    jumpRoot.appendChild(jumpSelect);
    jumpSelect.addEventListener("change", (event) => {
      const target = pageRoot.querySelector(`#${event.target.value}`);
      if (target) {
        target.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "start"
        });
      }
    });
  }

  const links = Array.from(tocRoot.querySelectorAll("[data-target]"));

  function setActive(id) {
    links.forEach((link) => link.classList.toggle("is-active", link.dataset.target === id));
    if (jumpSelect) {
      jumpSelect.value = id;
    }
  }

  if (!("IntersectionObserver" in window)) {
    setActive(sections[0].id);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);

      if (visible[0]) {
        setActive(visible[0].target.id);
      }
    },
    {
      rootMargin: "-18% 0px -62% 0px",
      threshold: [0.05, 0.2, 0.4]
    }
  );

  sections.forEach((section) => observer.observe(section));
  setActive(sections[0].id);
}

function bindProofControls(pageRoot, options = {}) {
  const {
    proofSelector = ".tda-proof",
    expandSelector = '[data-proof-action="expand"]',
    collapseSelector = '[data-proof-action="collapse"]'
  } = options;

  const proofs = Array.from(pageRoot.querySelectorAll(proofSelector));
  if (!proofs.length) {
    return;
  }

  const expand = pageRoot.querySelector(expandSelector);
  const collapse = pageRoot.querySelector(collapseSelector);

  if (expand) {
    expand.addEventListener("click", () => proofs.forEach((proof) => (proof.open = true)));
  }

  if (collapse) {
    collapse.addEventListener("click", () => proofs.forEach((proof) => (proof.open = false)));
  }
}

export function enhanceMathNotebookPage(root = document, options = {}) {
  const {
    pageSelector = "[data-tda-page]",
    articleSelector = ".post-single",
    bodyClass = null,
    tocOptions = {},
    proofOptions = {}
  } = options;

  const page = root.querySelector(pageSelector);
  const article = document.querySelector(articleSelector);

  if (!page || !article) {
    return null;
  }

  if (bodyClass) {
    document.body.classList.add(bodyClass);
  }

  buildNotebookToc(page, tocOptions);
  bindProofControls(page, proofOptions);
  bindProgress(article, buildProgressBar());

  return page;
}
