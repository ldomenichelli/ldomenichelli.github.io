(function () {
  const tracks = Array.isArray(window.LUCIA_MUSIC_TRACKS)
    ? window.LUCIA_MUSIC_TRACKS.filter((track) => track && track.src)
    : [];

  if (!tracks.length) {
    return;
  }

  const audio = document.createElement("audio");
  audio.preload = "metadata";

  const player = document.createElement("aside");
  player.className = "site-music-player";
  player.setAttribute("aria-label", "Music player");
  player.innerHTML = [
    '<div class="site-music-title"></div>',
    '<div class="site-music-controls">',
    '  <button type="button" data-music-play aria-label="Play song">play</button>',
    '  <button type="button" data-music-stop aria-label="Stop song">stop</button>',
    "</div>",
  ].join("");

  const title = player.querySelector(".site-music-title");
  const playButton = player.querySelector("[data-music-play]");
  const stopButton = player.querySelector("[data-music-stop]");

  const storedIndex = Number.parseInt(localStorage.getItem("luciaMusicIndex") || "0", 10);
  let currentIndex = Number.isFinite(storedIndex) && tracks[storedIndex] ? storedIndex : 0;

  function setTrack(nextIndex, shouldPlay) {
    currentIndex = (nextIndex + tracks.length) % tracks.length;
    const track = tracks[currentIndex];

    audio.src = track.src;
    title.textContent = track.title || "Untitled";
    localStorage.setItem("luciaMusicIndex", String(currentIndex));

    if (shouldPlay) {
      audio.play().catch(() => {
        playButton.textContent = "play";
      });
    }
  }

  function setPlayingState() {
    playButton.textContent = audio.paused ? "play" : "pause";
  }

  function stopTrack() {
    audio.pause();
    audio.currentTime = 0;
    setPlayingState();
  }

  playButton.addEventListener("click", () => {
    if (audio.paused) {
      audio.play().catch(() => {
        playButton.textContent = "play";
      });
    } else {
      audio.pause();
    }
  });

  stopButton.addEventListener("click", stopTrack);

  audio.addEventListener("play", setPlayingState);
  audio.addEventListener("pause", setPlayingState);
  audio.addEventListener("ended", () => {
    if (tracks.length > 1) {
      setTrack(currentIndex + 1, true);
      return;
    }

    stopTrack();
  });

  setTrack(currentIndex, false);
  player.appendChild(audio);
  document.body.appendChild(player);
})();
