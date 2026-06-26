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

  function cleanText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
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

  function removeInfographic(content) {
    var checkbox = content.querySelector("#zoomCheck-a3854");
    var label = content.querySelector('label[for="zoomCheck-a3854"]');

    if (checkbox) {
      checkbox.remove();
    }

    if (label) {
      label.remove();
    }

    content.querySelectorAll("em").forEach(function (node) {
      if (/^Steps to produce tea/i.test(cleanText(node.textContent))) {
        node.remove();
      }
    });
  }

  function markIntro(content) {
    var paragraphs = Array.from(content.children).filter(function (node) {
      return node.tagName === "P";
    });

    if (paragraphs[0]) {
      paragraphs[0].classList.add("tea-note-quote");
    }

    if (paragraphs[1] && /^-?Guido Ceronetti$/i.test(cleanText(paragraphs[1].textContent))) {
      paragraphs[1].classList.add("tea-note-attribution");
    }

    if (paragraphs[2]) {
      paragraphs[2].classList.add("tea-note-intro");
    }
  }

  function enhanceTeaPage() {
    ensureStylesheet();

    var body = document.body;
    var article = document.querySelector(".post-single");
    var content = article && article.querySelector(".post-content");

    if (!body || !article || !content) {
      return;
    }

    body.classList.add("hobby-tea", "tea-note-page");
    article.classList.add("tea-note");
    removeInfographic(content);
    markIntro(content);
    wrapTables(content);
  }

  if (isTeaPage()) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", enhanceTeaPage, { once: true });
    } else {
      enhanceTeaPage();
    }
  }
})();
