(function () {
  const tracks = Array.isArray(window.LUCIA_MUSIC_TRACKS)
    ? window.LUCIA_MUSIC_TRACKS.filter((track) => track && track.src)
    : [];

  if (!tracks.length) {
    return;
  }

  const audio = document.createElement("audio");
  audio.className = "site-music-audio";
  audio.controls = true;
  audio.preload = "metadata";

  const player = document.createElement("aside");
  player.className = "site-music-player";
  player.setAttribute("aria-label", "Music player");
  player.innerHTML = [
    '<div class="site-music-label">now listening</div>',
    '<div class="site-music-title"></div>',
  ].join("");

  const title = player.querySelector(".site-music-title");

  const storedIndex = Number.parseInt(localStorage.getItem("luciaMusicIndex") || "0", 10);
  let currentIndex = Number.isFinite(storedIndex) && tracks[storedIndex] ? storedIndex : 0;

  function setTrack(nextIndex, shouldPlay) {
    currentIndex = (nextIndex + tracks.length) % tracks.length;
    const track = tracks[currentIndex];

    audio.src = track.src;
    title.textContent = `${track.title || "Untitled"} ·`;
    localStorage.setItem("luciaMusicIndex", String(currentIndex));

    if (shouldPlay) {
      audio.play().catch(() => {});
    }
  }

  audio.addEventListener("ended", () => {
    if (tracks.length > 1) {
      setTrack(currentIndex + 1, true);
      return;
    }

    audio.currentTime = 0;
  });

  setTrack(currentIndex, false);
  title.before(audio);

  const header = document.querySelector(".header");
  if (header && header.parentNode) {
    header.insertAdjacentElement("afterend", player);
  } else {
    document.body.appendChild(player);
  }
})();
