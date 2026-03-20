(function () {
  "use strict";

  function isTeaPage() {
    return window.location.pathname.indexOf("/random/tea/") !== -1;
  }

  function ensureStylesheet() {
    if (document.querySelector('link[data-hobby-pages="true"]')) {
      return;
    }

    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/assets/css/hobby-pages.css";
    link.setAttribute("data-hobby-pages", "true");
    document.head.appendChild(link);
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function cleanText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function introNodes(content) {
    var nodes = [];
    var node = content.firstElementChild;

    while (node && !/^H[1-6]$/.test(node.tagName)) {
      nodes.push(node);
      node = node.nextElementSibling;
    }

    return nodes;
  }

  function buildHero(header, content, chapters) {
    var intro = introNodes(content).filter(function (node) {
      return node.tagName === "P";
    });
    var quoteText = cleanText(intro[0] && intro[0].textContent);
    var attributionText = cleanText(intro[1] && intro[1].textContent);
    var introCopy = "";

    if (intro[2]) {
      var clone = intro[2].cloneNode(true);
      clone.querySelectorAll("input, label, em").forEach(function (node) {
        node.remove();
      });
      introCopy = clone.innerHTML.trim();
    }

    intro.slice(0, 3).forEach(function (node) {
      node.classList.add("hobby-source-intro");
    });

    var hero = document.createElement("section");
    hero.className = "hobby-hero";

    var chapterPills = chapters
      .slice(0, 4)
      .map(function (chapter, index) {
        return (
          '<a class="hobby-pill" href="#' +
          chapter.id +
          '">' +
          '<span class="hobby-pill-index">0' +
          (index + 1) +
          "</span>" +
          "<span>" +
          escapeHtml(chapter.title) +
          "</span>" +
          "</a>"
        );
      })
      .join("");

    hero.innerHTML =
      '<div class="hobby-hero-copy">' +
      '<p class="hobby-kicker">Tea Journal</p>' +
      '<h2 class="hobby-display">' +
      escapeHtml(cleanText(header.querySelector(".post-title") && header.querySelector(".post-title").textContent)) +
      "</h2>" +
      '<p class="hobby-meta-line">A slower walk through craft, ritual, and taste.</p>' +
      (quoteText
        ? '<blockquote class="hobby-quote">' + escapeHtml(quoteText).replace(/\n/g, "<br>") + "</blockquote>"
        : "") +
      (attributionText ? '<p class="hobby-attribution">' + escapeHtml(attributionText) + "</p>" : "") +
      (introCopy ? '<div class="hobby-intro"><p>' + introCopy + "</p></div>" : "") +
      (chapterPills ? '<div class="hobby-pills">' + chapterPills + "</div>" : "") +
      "</div>" +
      '<div class="hobby-hero-art" aria-hidden="true">' +
      '<div class="tea-bowl"></div>' +
      '<div class="tea-stat-grid">' +
      '<article class="tea-stat-card"><span class="tea-stat-value">3,000+</span><span class="tea-stat-label">known varieties</span></article>' +
      '<article class="tea-stat-card"><span class="tea-stat-value">6</span><span class="tea-stat-label">classic families</span></article>' +
      '<article class="tea-stat-card"><span class="tea-stat-value">2</span><span class="tea-stat-label">major traditions compared</span></article>' +
      "</div>" +
      "</div>";

    header.insertAdjacentElement("afterend", hero);
    return hero;
  }

  function buildRail(chapters, afterNode) {
    if (!chapters.length) {
      return null;
    }

    var rail = document.createElement("section");
    rail.className = "hobby-rail";
    rail.setAttribute("aria-label", "Tea highlights");
    rail.innerHTML = chapters
      .map(function (chapter, index) {
        return (
          '<a class="hobby-rail-card" data-target="' +
          chapter.id +
          '" href="#' +
          chapter.id +
          '">' +
          '<span class="hobby-rail-step">Chapter ' +
          String(index + 1).padStart(2, "0") +
          "</span>" +
          '<strong class="hobby-rail-title">' +
          escapeHtml(chapter.title) +
          "</strong>" +
          '<span class="hobby-rail-copy">' +
          escapeHtml(chapter.blurb) +
          "</span>" +
          "</a>"
        );
      })
      .join("");

    afterNode.insertAdjacentElement("afterend", rail);
    return rail;
  }

  function buildChapterNav(chapters, afterNode) {
    if (!chapters.length) {
      return null;
    }

    var nav = document.createElement("nav");
    nav.className = "hobby-chapters";
    nav.setAttribute("aria-label", "Tea chapters");
    nav.innerHTML = chapters
      .map(function (chapter) {
        return (
          '<a data-target="' +
          chapter.id +
          '" href="#' +
          chapter.id +
          '">' +
          escapeHtml(chapter.title) +
          "</a>"
        );
      })
      .join("");

    afterNode.insertAdjacentElement("afterend", nav);
    return nav;
  }

  function buildProgressBar() {
    var progress = document.createElement("div");
    progress.className = "hobby-progress";
    progress.innerHTML = '<span class="hobby-progress-bar"></span>';
    document.body.prepend(progress);
    return progress.querySelector(".hobby-progress-bar");
  }

  function wrapTables(content) {
    content.querySelectorAll("table").forEach(function (table) {
      if (table.parentElement && table.parentElement.classList.contains("hobby-table-wrap")) {
        return;
      }

      var wrap = document.createElement("div");
      wrap.className = "hobby-table-wrap";
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  function sectionSummary(heading) {
    var node = heading.nextElementSibling;

    while (node) {
      if (/^H[1-6]$/.test(node.tagName)) {
        break;
      }

      if (node.tagName === "P") {
        var text = cleanText(node.textContent);
        if (text) {
          return text.length > 130 ? text.slice(0, 127) + "..." : text;
        }
      }

      node = node.nextElementSibling;
    }

    return "Jump into this section of the tea notes.";
  }

  function revealContent(content) {
    var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var targets = [];

    Array.from(content.children).forEach(function (node) {
      if (
        node.matches("h3, h4, p, ul, ol, blockquote, .hobby-table-wrap") &&
        !node.classList.contains("hobby-source-intro")
      ) {
        node.classList.add("hobby-reveal");
        targets.push(node);
      }
    });

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      targets.forEach(function (node) {
        node.classList.add("is-visible");
      });
      return;
    }

    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: "0px 0px -10% 0px",
        threshold: 0.12
      }
    );

    targets.forEach(function (node) {
      revealObserver.observe(node);
    });
  }

  function syncActiveChapter(headings, nav, rail) {
    var targets = [];
    if (nav) {
      targets = targets.concat(Array.from(nav.querySelectorAll("a[data-target]")));
    }
    if (rail) {
      targets = targets.concat(Array.from(rail.querySelectorAll("a[data-target]")));
    }

    function setActive(id) {
      targets.forEach(function (link) {
        link.classList.toggle("is-active", link.getAttribute("data-target") === id);
      });
    }

    if (!headings.length) {
      return;
    }

    if (!("IntersectionObserver" in window)) {
      setActive(headings[0].id);
      return;
    }

    var activeObserver = new IntersectionObserver(
      function (entries) {
        var visible = entries
          .filter(function (entry) {
            return entry.isIntersecting;
          })
          .sort(function (a, b) {
            return a.boundingClientRect.top - b.boundingClientRect.top;
          });

        if (visible[0]) {
          setActive(visible[0].target.id);
        }
      },
      {
        rootMargin: "-18% 0px -58% 0px",
        threshold: [0.05, 0.25, 0.5]
      }
    );

    headings.forEach(function (heading) {
      activeObserver.observe(heading);
    });

    setActive(headings[0].id);
  }

  function bindProgress(article, bar) {
    var ticking = false;

    function update() {
      ticking = false;
      var rect = article.getBoundingClientRect();
      var viewport = window.innerHeight;
      var total = Math.max(article.offsetHeight - viewport * 0.55, 1);
      var passed = Math.min(Math.max(-rect.top + viewport * 0.18, 0), total);
      var ratio = passed / total;

      bar.style.transform = "scaleX(" + ratio.toFixed(4) + ")";
      document.body.style.setProperty("--tea-scroll", ratio.toFixed(4));
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

  function enhanceTeaPage() {
    ensureStylesheet();

    var body = document.body;
    var article = document.querySelector(".post-single");
    var header = article && article.querySelector(".post-header");
    var content = article && article.querySelector(".post-content");

    if (!body || !article || !header || !content) {
      return;
    }

    body.classList.add("hobby-tea");
    wrapTables(content);

    var headings = Array.from(content.querySelectorAll("h3[id]"));
    var chapters = headings.map(function (heading) {
      return {
        id: heading.id,
        title: cleanText(heading.textContent),
        blurb: sectionSummary(heading)
      };
    });

    var hero = buildHero(header, content, chapters);
    var rail = buildRail(chapters, hero);
    var nav = buildChapterNav(chapters, rail || hero);
    var progressBar = buildProgressBar();

    revealContent(content);
    syncActiveChapter(headings, nav, rail);
    bindProgress(article, progressBar);
  }

  if (isTeaPage()) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", enhanceTeaPage, { once: true });
    } else {
      enhanceTeaPage();
    }
  }
})();
