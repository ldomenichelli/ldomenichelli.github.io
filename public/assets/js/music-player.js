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
    '<div class="site-music-kicker">now playing</div>',
    '<div class="site-music-title"></div>',
    '<div class="site-music-artist"></div>',
    '<select class="site-music-select" aria-label="Choose song"></select>',
    '<div class="site-music-controls">',
    '  <button type="button" data-music-prev aria-label="Previous song">&lt;</button>',
    '  <button type="button" data-music-play aria-label="Play song">play</button>',
    '  <button type="button" data-music-next aria-label="Next song">&gt;</button>',
    "</div>",
    '<input class="site-music-progress" type="range" min="0" max="100" value="0" aria-label="Song progress">',
    '<div class="site-music-time">0:00 / 0:00</div>',
  ].join("");

  const title = player.querySelector(".site-music-title");
  const artist = player.querySelector(".site-music-artist");
  const select = player.querySelector(".site-music-select");
  const playButton = player.querySelector("[data-music-play]");
  const prevButton = player.querySelector("[data-music-prev]");
  const nextButton = player.querySelector("[data-music-next]");
  const progress = player.querySelector(".site-music-progress");
  const time = player.querySelector(".site-music-time");

  tracks.forEach((track, trackIndex) => {
    const option = document.createElement("option");
    option.value = String(trackIndex);
    option.textContent = track.artist ? `${track.title} - ${track.artist}` : track.title;
    select.appendChild(option);
  });

  const storedIndex = Number.parseInt(localStorage.getItem("luciaMusicIndex") || "0", 10);
  let currentIndex = Number.isFinite(storedIndex) && tracks[storedIndex] ? storedIndex : 0;
  let seeking = false;

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) {
      return "0:00";
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainingSeconds}`;
  }

  function setTrack(nextIndex, shouldPlay) {
    currentIndex = (nextIndex + tracks.length) % tracks.length;
    const track = tracks[currentIndex];

    audio.src = track.src;
    title.textContent = track.title || "Untitled";
    artist.textContent = track.artist || "unknown artist";
    select.value = String(currentIndex);
    progress.value = "0";
    time.textContent = "0:00 / 0:00";
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

  playButton.addEventListener("click", () => {
    if (audio.paused) {
      audio.play().catch(() => {
        playButton.textContent = "play";
      });
    } else {
      audio.pause();
    }
  });

  prevButton.addEventListener("click", () => {
    setTrack(currentIndex - 1, !audio.paused);
  });

  nextButton.addEventListener("click", () => {
    setTrack(currentIndex + 1, !audio.paused);
  });

  select.addEventListener("change", () => {
    setTrack(Number.parseInt(select.value, 10), !audio.paused);
  });

  progress.addEventListener("input", () => {
    seeking = true;
  });

  progress.addEventListener("change", () => {
    if (Number.isFinite(audio.duration)) {
      audio.currentTime = (Number(progress.value) / 100) * audio.duration;
    }
    seeking = false;
  });

  audio.addEventListener("play", setPlayingState);
  audio.addEventListener("pause", setPlayingState);
  audio.addEventListener("ended", () => {
    setTrack(currentIndex + 1, true);
  });
  audio.addEventListener("timeupdate", () => {
    if (Number.isFinite(audio.duration)) {
      if (!seeking) {
        progress.value = String((audio.currentTime / audio.duration) * 100);
      }
      time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
    }
  });
  audio.addEventListener("loadedmetadata", () => {
    time.textContent = `0:00 / ${formatTime(audio.duration)}`;
  });

  setTrack(currentIndex, false);
  player.appendChild(audio);
  document.body.appendChild(player);
})();
