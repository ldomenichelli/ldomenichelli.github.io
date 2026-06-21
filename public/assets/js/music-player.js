(function () {
  if (window.__luciaMusicPlayerReady) {
    return;
  }
  window.__luciaMusicPlayerReady = true;

  const PLAYER_SELECTOR = ".site-music-player";
  const AUDIO_SELECTOR = ".site-music-audio";
  const PAGE_HEAD_SELECTOR = [
    "head > style",
    'head > meta[name="description"]',
    'head > meta[name="keywords"]',
    'head > meta[property^="og:"]',
    'head > meta[name^="twitter:"]',
    'head > link[rel="canonical"]',
    'head > link[rel="alternate"]',
    'head > script[type="application/ld+json"]',
  ].join(",");

  const tracks = Array.isArray(window.LUCIA_MUSIC_TRACKS)
    ? window.LUCIA_MUSIC_TRACKS.filter((track) => track && track.src)
    : [];

  let player = document.querySelector(PLAYER_SELECTOR);
  let audio = player ? player.querySelector(AUDIO_SELECTOR) : null;
  let title = player ? player.querySelector(".site-music-title") : null;

  const storedIndex = Number.parseInt(localStorage.getItem("luciaMusicIndex") || "0", 10);
  let currentIndex = Number.isFinite(storedIndex) && tracks[storedIndex] ? storedIndex : 0;

  function placePlayer() {
    if (!player) {
      return;
    }

    const header = document.querySelector(".header");
    if (header && header.parentNode) {
      header.insertAdjacentElement("afterend", player);
    } else {
      document.body.insertBefore(player, document.body.firstChild);
    }
  }

  function setTrack(nextIndex, shouldPlay) {
    if (!audio || !title || !tracks.length) {
      return;
    }

    currentIndex = (nextIndex + tracks.length) % tracks.length;
    const track = tracks[currentIndex];

    audio.src = track.src;
    title.textContent = `${track.title || "Untitled"} ·`;
    localStorage.setItem("luciaMusicIndex", String(currentIndex));

    if (shouldPlay) {
      audio.play().catch(() => {});
    }
  }

  function setupPlayer() {
    if (!tracks.length) {
      return;
    }

    if (!player) {
      audio = document.createElement("audio");
      audio.className = "site-music-audio";
      audio.controls = true;
      audio.preload = "metadata";

      player = document.createElement("aside");
      player.className = "site-music-player";
      player.setAttribute("aria-label", "Music player");
      player.innerHTML = [
        '<div class="site-music-label">now listening</div>',
        '<div class="site-music-title"></div>',
      ].join("");

      title = player.querySelector(".site-music-title");
      title.before(audio);
    }

    audio.addEventListener("ended", () => {
      if (tracks.length > 1) {
        setTrack(currentIndex + 1, true);
        return;
      }

      audio.currentTime = 0;
    });

    setTrack(currentIndex, false);
    placePlayer();
  }

  function markCurrentPageHead() {
    document.querySelectorAll(PAGE_HEAD_SELECTOR).forEach((node) => {
      node.dataset.luciaPageHead = "true";
    });
  }

  function normalizeSiteUrl(url) {
    const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
    if (localHosts.has(window.location.hostname) && url.hostname === "ldomenichelli.github.io") {
      return new URL(`${url.pathname}${url.search}${url.hash}`, window.location.origin);
    }
    return url;
  }

  function isHtmlNavigation(url) {
    if (url.origin !== window.location.origin) {
      return false;
    }

    const path = url.pathname.toLowerCase();
    if (path.endsWith("/")) {
      return true;
    }
    if (path.endsWith(".html") || path === "") {
      return true;
    }

    return !/\.[a-z0-9]{2,8}$/.test(path);
  }

  function shouldHandleLink(anchor, event) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      anchor.target ||
      anchor.hasAttribute("download") ||
      anchor.dataset.noInstant !== undefined
    ) {
      return null;
    }

    const rawHref = anchor.getAttribute("href");
    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) {
      return null;
    }

    let url;
    try {
      url = normalizeSiteUrl(new URL(anchor.href, window.location.href));
    } catch {
      return null;
    }

    if (!isHtmlNavigation(url)) {
      return null;
    }

    if (url.pathname === window.location.pathname && url.search === window.location.search) {
      return null;
    }

    return url;
  }

  function copyBodyAttributes(nextBody) {
    Array.from(document.body.attributes).forEach((attribute) => {
      document.body.removeAttribute(attribute.name);
    });

    Array.from(nextBody.attributes).forEach((attribute) => {
      document.body.setAttribute(attribute.name, attribute.value);
    });
  }

  function syncStyles(nextDocument) {
    nextDocument.head.querySelectorAll('link[rel~="stylesheet"], link[as="style"]').forEach((nextLink) => {
      const href = nextLink.href;
      const rel = nextLink.getAttribute("rel") || "";
      const exists = Array.from(document.head.querySelectorAll("link")).some((link) => {
        return link.href === href && (link.getAttribute("rel") || "") === rel;
      });

      if (!exists) {
        document.head.appendChild(document.importNode(nextLink, true));
      }
    });
  }

  function syncPageHead(nextDocument) {
    document.querySelectorAll("[data-lucia-page-head]").forEach((node) => node.remove());

    nextDocument.querySelectorAll(PAGE_HEAD_SELECTOR).forEach((nextNode) => {
      const clone = document.importNode(nextNode, true);
      clone.dataset.luciaPageHead = "true";
      document.head.appendChild(clone);
    });

    syncStyles(nextDocument);
  }

  function replaceBody(nextDocument) {
    const nextChildren = Array.from(nextDocument.body.childNodes)
      .filter((node) => node.nodeName.toLowerCase() !== "script")
      .map((node) => document.importNode(node, true));

    if (player) {
      const headerIndex = nextChildren.findIndex((node) => {
        return node.nodeType === Node.ELEMENT_NODE && node.matches(".header");
      });
      nextChildren.splice(headerIndex >= 0 ? headerIndex + 1 : 0, 0, player);
    }

    copyBodyAttributes(nextDocument.body);
    document.body.replaceChildren(...nextChildren);
    placePlayer();
  }

  function isCommonInlineScript(script) {
    if (script.src || script.type === "module") {
      return false;
    }

    const text = script.textContent || "";
    return (
      (text.includes("#menu-trigger") && text.includes(".menu")) ||
      text.includes("menu-scroll-position") ||
      (text.includes("top-link") && text.includes("onscroll")) ||
      (text.includes("copy-code") && text.includes("clipboard"))
    );
  }

  function shouldSkipScript(script) {
    const type = (script.getAttribute("type") || "").toLowerCase();
    const src = script.getAttribute("src") || "";

    return (
      type === "application/ld+json" ||
      script.dataset.noInstant !== undefined ||
      /\/assets\/js\/music-(player|playlist)\.js(?:$|\?)/.test(src) ||
      /\/assets\/js\/analytics\.js(?:$|\?)/.test(src) ||
      isCommonInlineScript(script)
    );
  }

  function cacheBustModuleSrc(src) {
    const url = new URL(src, window.location.href);
    if (url.origin === window.location.origin) {
      url.searchParams.set("lucia-nav", String(Date.now()));
      return url.href;
    }
    return src;
  }

  function executeScript(script) {
    if (shouldSkipScript(script)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const clone = document.createElement("script");
      const isModule = script.type === "module";

      Array.from(script.attributes).forEach((attribute) => {
        if (attribute.name === "defer" || attribute.name === "async") {
          return;
        }
        clone.setAttribute(attribute.name, attribute.value);
      });

      clone.async = false;

      if (script.src) {
        clone.onload = () => resolve();
        clone.onerror = () => resolve();

        if (isModule) {
          clone.removeAttribute("integrity");
          clone.src = cacheBustModuleSrc(script.getAttribute("src"));
        } else {
          clone.src = script.getAttribute("src");
        }
      } else if (isModule) {
        clone.textContent = script.textContent;
      } else {
        clone.textContent = `(function () {\n${script.textContent}\n})();`;
      }

      document.body.appendChild(clone);

      if (!script.src) {
        resolve();
      }
    });
  }

  async function executePageScripts(nextDocument) {
    const scripts = [
      ...nextDocument.head.querySelectorAll("script"),
      ...nextDocument.body.querySelectorAll("script"),
    ];

    for (const script of scripts) {
      await executeScript(script);
    }
  }

  function setupMenuScroll() {
    const menu = document.getElementById("menu");
    if (!menu || menu.dataset.luciaMenuScrollReady) {
      return;
    }

    menu.dataset.luciaMenuScrollReady = "true";
    menu.scrollLeft = localStorage.getItem("menu-scroll-position") || 0;
    menu.addEventListener("scroll", () => {
      localStorage.setItem("menu-scroll-position", menu.scrollLeft);
    });
  }

  function updateTopLink() {
    const topLink = document.getElementById("top-link");
    if (!topLink) {
      return;
    }

    const visible = document.body.scrollTop > 800 || document.documentElement.scrollTop > 800;
    topLink.style.visibility = visible ? "visible" : "hidden";
    topLink.style.opacity = visible ? "1" : "0";
  }

  function enhanceCopyButtons() {
    document.querySelectorAll("pre > code").forEach((code) => {
      const block = code.parentNode.parentNode;
      if (!block || block.querySelector(".copy-code")) {
        return;
      }

      const button = document.createElement("button");
      button.classList.add("copy-code");
      button.textContent = "copy";

      button.addEventListener("click", () => {
        function showCopied() {
          button.textContent = "copied!";
          setTimeout(() => {
            button.textContent = "copy";
          }, 2000);
        }

        if ("clipboard" in navigator) {
          navigator.clipboard.writeText(code.textContent);
          showCopied();
          return;
        }

        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        try {
          document.execCommand("copy");
          showCopied();
        } catch {}
        selection.removeRange(range);
      });

      if (block.classList.contains("highlight")) {
        block.appendChild(button);
      } else {
        code.parentNode.appendChild(button);
      }
    });
  }

  function renderMath() {
    if (typeof window.renderMathInElement !== "function") {
      return;
    }

    window.renderMathInElement(document.body, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
        { left: "\\[", right: "\\]", display: true },
      ],
    });
  }

  function enhancePage() {
    setupMenuScroll();
    updateTopLink();
    enhanceCopyButtons();
    renderMath();
  }

  function scrollAfterNavigation(url) {
    window.requestAnimationFrame(() => {
      if (url.hash) {
        const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
        if (target) {
          target.scrollIntoView();
          return;
        }
      }

      window.scrollTo({ top: 0, left: 0 });
    });
  }

  async function loadPage(url, options = {}) {
    const response = await fetch(url.href, {
      credentials: "same-origin",
      headers: { "X-Lucia-Navigation": "1" },
    });
    const finalUrl = normalizeSiteUrl(new URL(response.url || url.href));

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("text/html")) {
      window.location.href = url.href;
      return;
    }

    const html = await response.text();
    const nextDocument = new DOMParser().parseFromString(html, "text/html");
    if (!nextDocument.body || !nextDocument.querySelector("main")) {
      window.location.href = url.href;
      return;
    }

    if (nextDocument.documentElement.lang) {
      document.documentElement.lang = nextDocument.documentElement.lang;
    }
    if (nextDocument.documentElement.dir) {
      document.documentElement.dir = nextDocument.documentElement.dir;
    }

    if (!options.fromHistory) {
      history.pushState({ luciaNavigation: true }, "", finalUrl.href);
    }

    document.title = nextDocument.title;
    syncPageHead(nextDocument);
    replaceBody(nextDocument);
    await executePageScripts(nextDocument);
    enhancePage();
    scrollAfterNavigation(finalUrl);
  }

  function setupNavigation() {
    if (!window.fetch || !window.history || !window.DOMParser) {
      return;
    }

    markCurrentPageHead();

    if (!history.state || !history.state.luciaNavigation) {
      history.replaceState({ luciaNavigation: true }, "", window.location.href);
    }

    document.addEventListener("click", (event) => {
      const menuButton = event.target.closest("#menu-trigger");
      if (menuButton) {
        const menu = document.querySelector(".menu");
        if (menu) {
          menu.classList.toggle("hidden");
        }
        return;
      }

      if (!event.target.closest("#menu-trigger")) {
        const menu = document.querySelector(".menu");
        if (menu) {
          menu.classList.add("hidden");
        }
      }

      const hashLink = event.target.closest('a[href^="#"]');
      if (hashLink) {
        const targetName = hashLink.getAttribute("href").slice(1);
        const target = document.getElementById(decodeURIComponent(targetName));
        if (target) {
          event.preventDefault();
          target.scrollIntoView(
            window.matchMedia("(prefers-reduced-motion: reduce)").matches ? {} : { behavior: "smooth" }
          );
          if (targetName === "top") {
            history.replaceState(history.state, "", window.location.pathname + window.location.search);
          } else {
            history.pushState(history.state, "", `#${targetName}`);
          }
        }
        return;
      }

      const anchor = event.target.closest("a[href]");
      if (!anchor) {
        return;
      }

      const url = shouldHandleLink(anchor, event);
      if (!url) {
        return;
      }

      event.preventDefault();
      loadPage(url).catch(() => {
        window.location.href = url.href;
      });
    });

    window.addEventListener("popstate", () => {
      loadPage(new URL(window.location.href), { fromHistory: true }).catch(() => {
        window.location.reload();
      });
    });

    window.addEventListener("scroll", updateTopLink, { passive: true });
  }

  setupPlayer();
  setupNavigation();
  enhancePage();
})();
