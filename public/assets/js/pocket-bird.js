(function () {
  const source = "https://cdn.jsdelivr.net/gh/IdreesInc/Pocket-Bird@main/dist/web/birb.embed.js";

  if (document.querySelector(`script[src="${source}"]`)) {
    return;
  }

  const script = document.createElement("script");
  script.src = source;
  script.async = true;
  document.body.appendChild(script);
})();
