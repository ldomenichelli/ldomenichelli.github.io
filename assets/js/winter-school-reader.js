(() => {
  "use strict";

  const root = document.documentElement;
  const readerBar = document.querySelector(".ws-reader-bar");

  const syncReaderBarHeight = () => {
    if (!readerBar) {
      return;
    }

    const height = Math.ceil(readerBar.getBoundingClientRect().height);

    if (height > 0) {
      root.style.setProperty("--ws-reader-bar-height", `${height}px`);
    }
  };

  if (readerBar) {
    syncReaderBarHeight();

    if ("ResizeObserver" in window) {
      new ResizeObserver(syncReaderBarHeight).observe(readerBar);
    } else {
      window.addEventListener("resize", syncReaderBarHeight, { passive: true });
    }

    window.addEventListener("pageshow", syncReaderBarHeight, { passive: true });
  }

  const pages = Array.from(document.querySelectorAll("[data-note-page]"));
  const currentPageNodes = Array.from(document.querySelectorAll("[data-current-page]"));

  if (pages.length === 0 || currentPageNodes.length === 0) {
    return;
  }

  const totalPageNodes = document.querySelectorAll("[data-total-pages]");
  const progressNodes = document.querySelectorAll(".ws-reader-progress, [data-page-progress]");
  const pageOrder = new Map(pages.map((page, index) => [page, index]));
  let selectedPage = null;

  pages.forEach((page, index) => {
    const image = page.querySelector("img");

    if (!image) {
      return;
    }

    if (!image.hasAttribute("loading")) {
      image.setAttribute("loading", index === 0 ? "eager" : "lazy");
    }

    if (!image.hasAttribute("decoding")) {
      image.setAttribute("decoding", "async");
    }
  });

  totalPageNodes.forEach((node) => {
    node.textContent = String(pages.length);
  });

  const pageValue = (page) => {
    const value = page.dataset.notePage;
    return value && value.trim() ? value.trim() : String(pageOrder.get(page) + 1);
  };

  const showPage = (page) => {
    if (!page || page === selectedPage) {
      return;
    }

    const value = pageValue(page);
    selectedPage = page;

    currentPageNodes.forEach((node) => {
      node.textContent = value;
    });

    pages.forEach((candidate) => {
      if (candidate === page) {
        candidate.setAttribute("data-reader-current", "true");
      } else {
        candidate.removeAttribute("data-reader-current");
      }
    });

    progressNodes.forEach((node) => {
      if (node.getAttribute("aria-hidden") !== "true") {
        node.setAttribute("aria-label", `Page ${value} of ${pages.length}`);
      }

      if (node.getAttribute("role") === "progressbar") {
        node.setAttribute("aria-valuemin", "1");
        node.setAttribute("aria-valuemax", String(pages.length));
        node.setAttribute("aria-valuenow", value);
      }
    });
  };

  showPage(pages[0]);

  if (!("IntersectionObserver" in window)) {
    return;
  }

  const intersectingPages = new Set();
  let updateScheduled = false;

  const distanceFromReadingLine = (page, readingLine) => {
    const bounds = page.getBoundingClientRect();

    if (bounds.top <= readingLine && bounds.bottom >= readingLine) {
      return 0;
    }

    return bounds.top > readingLine
      ? bounds.top - readingLine
      : readingLine - bounds.bottom;
  };

  const chooseCurrentPage = () => {
    updateScheduled = false;

    const readingLine = window.innerHeight * 0.42;
    let candidates = Array.from(intersectingPages);

    if (candidates.length === 0) {
      candidates = pages.filter((page) => {
        const bounds = page.getBoundingClientRect();
        return bounds.bottom > 0 && bounds.top < window.innerHeight;
      });
    }

    if (candidates.length === 0) {
      return;
    }

    candidates.sort((left, right) => {
      const distance =
        distanceFromReadingLine(left, readingLine) -
        distanceFromReadingLine(right, readingLine);

      return distance || pageOrder.get(left) - pageOrder.get(right);
    });

    showPage(candidates[0]);
  };

  const scheduleCurrentPageUpdate = () => {
    if (updateScheduled) {
      return;
    }

    updateScheduled = true;
    window.requestAnimationFrame(chooseCurrentPage);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          intersectingPages.add(entry.target);
        } else {
          intersectingPages.delete(entry.target);
        }
      });

      scheduleCurrentPageUpdate();
    },
    {
      rootMargin: "-36% 0px -56% 0px",
      threshold: 0
    }
  );

  pages.forEach((page) => observer.observe(page));
})();
