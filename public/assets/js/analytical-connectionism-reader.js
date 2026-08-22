(() => {
  const pages = Array.from(document.querySelectorAll("[data-note-page]"));
  const currentPage = document.querySelector("[data-current-page]");

  if (pages.length === 0 || !currentPage) {
    return;
  }

  const showPage = (page) => {
    currentPage.textContent = page.dataset.notePage;
  };

  showPage(pages[0]);

  if (!("IntersectionObserver" in window)) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const centeredEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)
        .at(-1);

      if (centeredEntry) {
        showPage(centeredEntry.target);
      }
    },
    {
      rootMargin: "-45% 0px -45% 0px",
      threshold: 0
    }
  );

  pages.forEach((page) => observer.observe(page));
})();
