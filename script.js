/* ==========================================================================
   UED100 Assessment 2 - Spotify-inspired web player prototype
   File: js/script.js

   Contents
   1. Data (fictional playlists and tracks)
   2. Small helpers
   3. State and DOM references
   4. Rendering (playlists, tracks, library)
   5. Search and filters
   6. Player (HTML5 audio API)
   7. Navigation (mobile menu, active link)
   8. Contact form validation
   9. Preferences (welcome guide, high contrast)
   10. Keyboard shortcuts and start-up
   Plain JavaScript (no framework): the app is small, so this keeps the page
   light and fast to load. All user-supplied text is inserted with
   textContent (never innerHTML) to avoid cross-site scripting (XSS).
   ========================================================================== */
"use strict";

/* 1. DATA ---------------------------------------------------------------- */
const PLAYLISTS = [
  { id: "focus-flow",    name: "Focus Flow",    desc: "Calm beats for studying" },
  { id: "sunrise-pop",   name: "Sunrise Pop",   desc: "Bright tracks for the morning" },
  { id: "deep-bass",     name: "Deep Bass",     desc: "Low, heavy and moody" },
  { id: "acoustic-calm", name: "Acoustic Calm", desc: "Soft sounds to unwind" }
];

const TRACKS = [
  { id: "midnight-study",    title: "Midnight Study",    artist: "Nova Lane",     playlist: "focus-flow" },
  { id: "quiet-rain",        title: "Quiet Rain",        artist: "Nova Lane",     playlist: "focus-flow" },
  { id: "golden-hour-drive", title: "Golden Hour Drive", artist: "The Daybreaks", playlist: "sunrise-pop" },
  { id: "city-lights",       title: "City Lights",       artist: "The Daybreaks", playlist: "sunrise-pop" },
  { id: "low-orbit",         title: "Low Orbit",         artist: "Kilo Static",   playlist: "deep-bass" },
  { id: "night-pulse",       title: "Night Pulse",       artist: "Kilo Static",   playlist: "deep-bass" },
  { id: "porch-light",       title: "Porch Light",       artist: "Willow & Reed", playlist: "acoustic-calm" },
  { id: "slow-river",        title: "Slow River",        artist: "Willow & Reed", playlist: "acoustic-calm" }
];

/* 2. HELPERS ------------------------------------------------------------- */
const $ = (sel) => document.querySelector(sel);

/** Convert seconds to m:ss. Guards against NaN/Infinity before metadata loads. */
function formatTime(sec) {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Safe localStorage wrappers: storage can be blocked (private mode), so never let it crash the app. */
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

/** Debounce: wait until the user stops typing before running fn (fewer re-renders = better performance). */
function debounce(fn, delay = 150) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

/** Create an element with optional class and text in one call. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Build a small SVG icon from a path string (used for the heart button). */
function icon(pathD) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", pathD);
  svg.appendChild(p);
  return svg;
}
const HEART_PATH = "M12 21s-8-5.5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.5-8 11-8 11z";

/* 3. STATE AND DOM REFERENCES ------------------------------------------- */
const state = {
  query: "",
  playlist: "all",              // "all" or a playlist id
  saved: new Set(load("wl-saved", [])),
  currentId: null,              // id of the track loaded in the player
  visible: []                   // tracks currently shown in the Songs list (used by next/prev)
};

const audio = $("#audio");
const dom = {
  playlistGrid: $("#playlistGrid"), chips: $("#chips"),
  trackList: $("#trackList"), emptyState: $("#emptyState"),
  libraryList: $("#libraryList"), libraryEmpty: $("#libraryEmpty"),
  live: $("#liveStatus"), toast: $("#toast"),
  playBtn: $("#playBtn"), playIcon: $("#playIcon"),
  seek: $("#seek"), volume: $("#volume"),
  timeNow: $("#timeNow"), timeTotal: $("#timeTotal"),
  npTitle: $("#npTitle"), npArtist: $("#npArtist"), npCover: $("#npCover")
};

const trackById = (id) => TRACKS.find((t) => t.id === id);
const coverFor = (track) => `assets/img/${track.playlist}.svg`;

/** Announce a message to screen readers without moving focus. */
function announce(msg) { dom.live.textContent = ""; setTimeout(() => (dom.live.textContent = msg), 50); }

/** Show a temporary non-blocking message. */
let toastTimer;
function showToast(msg) {
  dom.toast.textContent = msg;
  dom.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (dom.toast.hidden = true), 3500);
}

/* 4. RENDERING ----------------------------------------------------------- */

/** Playlist cards. Each card is a toggle button that filters the song list. */
function renderPlaylists() {
  dom.playlistGrid.replaceChildren();
  PLAYLISTS.forEach((pl) => {
    const card = el("button", "card");
    card.type = "button";
    card.setAttribute("aria-pressed", String(state.playlist === pl.id));
    const img = el("img");
    img.src = `assets/img/${pl.id}.svg`; img.alt = ""; img.width = 300; img.height = 300;
    card.append(img, el("p", "card__title", pl.name), el("p", "card__meta", pl.desc));
    card.addEventListener("click", () => {
      // Clicking the active playlist again clears the filter
      state.playlist = state.playlist === pl.id ? "all" : pl.id;
      renderPlaylists(); renderChips(); renderTracks();
      document.getElementById("tracks").scrollIntoView({ behavior: "smooth" });
    });
    dom.playlistGrid.appendChild(card);
  });
  dom.playlistGrid.setAttribute("aria-busy", "false");
}

/** Filter chips: "All" plus one per playlist. */
function renderChips() {
  dom.chips.replaceChildren();
  [{ id: "all", name: "All" }, ...PLAYLISTS].forEach((pl) => {
    const chip = el("button", "chip", pl.name);
    chip.type = "button";
    chip.setAttribute("aria-pressed", String(state.playlist === pl.id));
    chip.addEventListener("click", () => {
      state.playlist = pl.id;
      renderChips(); renderPlaylists(); renderTracks();
    });
    dom.chips.appendChild(chip);
  });
}

/** Build one row of the track list (shared by Songs and Library). */
function trackRow(track) {
  const li = el("li", "track");
  if (track.id === state.currentId && !audio.paused) li.classList.add("is-playing");

  // Cover + play button
  const play = el("button", "track__play");
  play.type = "button";
  play.setAttribute("aria-label", `Play ${track.title} by ${track.artist}`);
  const img = el("img"); img.src = coverFor(track); img.alt = ""; img.width = 48; img.height = 48;
  play.appendChild(img);
  play.addEventListener("click", () => playTrack(track.id));

  // Title + artist
  const info = el("div");
  info.append(el("p", "track__title", track.title), el("p", "track__artist", track.artist));

  // Save (heart) toggle
  const heart = el("button", "icon-btn heart");
  heart.type = "button";
  const isSaved = state.saved.has(track.id);
  heart.setAttribute("aria-pressed", String(isSaved));
  heart.setAttribute("aria-label", `${isSaved ? "Remove" : "Save"} ${track.title} ${isSaved ? "from" : "to"} Your Library`);
  heart.title = isSaved ? "Remove from Your Library" : "Save to Your Library";
  heart.appendChild(icon(HEART_PATH));
  heart.addEventListener("click", () => toggleSaved(track));

  const time = el("span", "track__time", "0:08");   // demo clips are all 8 seconds
  li.append(play, info, time, heart);
  return li;
}

/** Songs list, filtered by search query and chosen playlist. */
function renderTracks() {
  const q = state.query.trim().toLowerCase();
  state.visible = TRACKS.filter((t) => {
    const inPlaylist = state.playlist === "all" || t.playlist === state.playlist;
    const matches = !q || `${t.title} ${t.artist}`.toLowerCase().includes(q) ||
                    PLAYLISTS.find((p) => p.id === t.playlist).name.toLowerCase().includes(q);
    return inPlaylist && matches;
  });
  dom.trackList.replaceChildren(...state.visible.map(trackRow));
  dom.emptyState.hidden = state.visible.length > 0;
  announce(`${state.visible.length} song${state.visible.length === 1 ? "" : "s"} shown`);
}

/** Library list: saved songs only. */
function renderLibrary() {
  const saved = TRACKS.filter((t) => state.saved.has(t.id));
  dom.libraryList.replaceChildren(...saved.map(trackRow));
  dom.libraryEmpty.hidden = saved.length > 0;
}

function toggleSaved(track) {
  const wasSaved = state.saved.has(track.id);
  wasSaved ? state.saved.delete(track.id) : state.saved.add(track.id);
  save("wl-saved", [...state.saved]);
  renderTracks(); renderLibrary();
  showToast(wasSaved ? `Removed "${track.title}" from Your Library` : `Saved "${track.title}" to Your Library`);
}

/** Refresh only the "is-playing" highlight without rebuilding lists (cheap, avoids losing focus). */
function refreshPlayingState() {
  document.querySelectorAll(".track").forEach((li) => li.classList.remove("is-playing"));
  if (state.currentId && !audio.paused) {
    document.querySelectorAll(".track").forEach((li) => {
      const label = li.querySelector(".track__play").getAttribute("aria-label");
      const t = trackById(state.currentId);
      if (label === `Play ${t.title} by ${t.artist}`) li.classList.add("is-playing");
    });
  }
}

/* 5. SEARCH AND FILTERS -------------------------------------------------- */
const searchInput = $("#searchInput");
const runSearch = debounce(() => { state.query = searchInput.value; renderTracks(); });
searchInput.addEventListener("input", runSearch);
// Pressing Enter should not reload the page; jump to results instead
$("#searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  state.query = searchInput.value; renderTracks();
  document.getElementById("tracks").scrollIntoView({ behavior: "smooth" });
});

/* 6. PLAYER -------------------------------------------------------------- */

/** Load and play a track. Clicking the track that is already loaded toggles play/pause. */
function playTrack(id) {
  const track = trackById(id);
  if (!track) return;
  if (state.currentId === id) { togglePlay(); return; }

  state.currentId = id;
  audio.src = `assets/audio/${track.id}.wav`;
  dom.npTitle.textContent = track.title;
  dom.npArtist.textContent = track.artist;
  dom.npCover.src = coverFor(track);
  dom.timeNow.textContent = "0:00";
  dom.seek.value = 0;
  // play() returns a Promise; browsers reject it if autoplay is blocked or the file fails
  audio.play().catch(() => showToast("Could not play this song. Please try again."));
  announce(`Now playing ${track.title} by ${track.artist}`);
}

function togglePlay() {
  if (!state.currentId) {
    // Nothing loaded yet: start with the first visible song (or first overall)
    playTrack((state.visible[0] || TRACKS[0]).id);
    return;
  }
  audio.paused ? audio.play().catch(() => showToast("Playback was blocked by the browser.")) : audio.pause();
}

/** Move to the next/previous song within the visible list (wraps around). */
function step(direction) {
  const list = state.visible.length ? state.visible : TRACKS;
  let i = list.findIndex((t) => t.id === state.currentId);
  i = i === -1 ? 0 : (i + direction + list.length) % list.length;
  state.currentId = null;            // force playTrack to load rather than toggle
  playTrack(list[i].id);
}

// Keep the UI in sync with the real audio state (events, not guesses)
audio.addEventListener("play",  () => syncPlayButton(true));
audio.addEventListener("pause", () => syncPlayButton(false));
audio.addEventListener("ended", () => step(1));              // autoplay next song
audio.addEventListener("waiting", () => dom.playBtn.setAttribute("aria-busy", "true"));   // buffering feedback
audio.addEventListener("playing", () => dom.playBtn.removeAttribute("aria-busy"));
audio.addEventListener("error",   () => { if (audio.src) showToast("This song failed to load."); });
audio.addEventListener("loadedmetadata", () => { dom.timeTotal.textContent = formatTime(audio.duration); });
audio.addEventListener("timeupdate", () => {
  // Don't fight the user while they are dragging the slider
  if (!dom.seek.dataset.dragging && audio.duration) {
    dom.seek.value = (audio.currentTime / audio.duration) * 100;
  }
  dom.timeNow.textContent = formatTime(audio.currentTime);
});

function syncPlayButton(isPlaying) {
  // Swap the icon and the accessible name together so screen readers hear the right action
  dom.playIcon.firstElementChild.setAttribute("d", isPlaying ? "M6 5h4v14H6zM14 5h4v14h-4z" : "M8 5l12 7-12 7z");
  dom.playBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
  dom.playBtn.title = isPlaying ? "Pause (Space)" : "Play (Space)";
  refreshPlayingState();
}

dom.playBtn.addEventListener("click", togglePlay);
$("#nextBtn").addEventListener("click", () => step(1));
$("#prevBtn").addEventListener("click", () => step(-1));

// Seeking: "input" fires continuously while dragging, "change" when released
dom.seek.addEventListener("input", () => {
  dom.seek.dataset.dragging = "1";
  if (audio.duration) dom.timeNow.textContent = formatTime((dom.seek.value / 100) * audio.duration);
});
dom.seek.addEventListener("change", () => {
  if (audio.duration) audio.currentTime = (dom.seek.value / 100) * audio.duration;
  delete dom.seek.dataset.dragging;
});

audio.volume = load("wl-volume", 0.7);
dom.volume.value = audio.volume;
dom.volume.addEventListener("input", () => { audio.volume = dom.volume.value; save("wl-volume", Number(dom.volume.value)); });

/* 7. NAVIGATION ---------------------------------------------------------- */
const sidebar = $("#sidebar");
const scrim = $("#scrim");
const menuToggle = $("#menuToggle");

/** Open/close the mobile drawer, keeping aria-expanded and the scrim in sync. */
function setMenu(open) {
  sidebar.classList.toggle("is-open", open);
  scrim.hidden = !open;
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  if (open) sidebar.querySelector(".nav-link").focus();   // move focus into the menu
  else if (document.activeElement && sidebar.contains(document.activeElement)) menuToggle.focus();
}
menuToggle.addEventListener("click", () => setMenu(!sidebar.classList.contains("is-open")));
scrim.addEventListener("click", () => setMenu(false));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });   // Esc closes menu

// Close the drawer after choosing a link (mobile) and mark the link as current
document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach((l) => { l.classList.remove("is-active"); l.removeAttribute("aria-current"); });
    link.classList.add("is-active"); link.setAttribute("aria-current", "page");
    setMenu(false);
  });
});

/* Scroll-spy: highlight the nav link of the section currently in view.
   IntersectionObserver is much cheaper than listening to every scroll event. */
const sections = ["home", "tracks", "library", "plans", "contact"].map((id) => document.getElementById(id));
const spy = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    document.querySelectorAll(".nav-link").forEach((l) => {
      const active = l.getAttribute("href") === `#${entry.target.id}`;
      l.classList.toggle("is-active", active);
      active ? l.setAttribute("aria-current", "page") : l.removeAttribute("aria-current");
    });
  });
}, { root: $("#main"), rootMargin: "-20% 0px -70% 0px" });
sections.forEach((s) => s && spy.observe(s));

/* 8. CONTACT FORM -------------------------------------------------------- */
const form = $("#contactForm");
const fields = {
  name:    { input: $("#cName"),    err: $("#cNameErr") },
  email:   { input: $("#cEmail"),   err: $("#cEmailErr") },
  topic:   { input: $("#cTopic"),   err: $("#cTopicErr") },
  message: { input: $("#cMessage"), err: $("#cMessageErr") }
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Return an error message for one field, or "" if it is valid. */
function validateField(key) {
  const v = fields[key].input.value.trim();
  switch (key) {
    case "name":    return v.length < 2 ? "Please enter your name (at least 2 characters)." : "";
    case "email":   return !v ? "Please enter your email address." : !EMAIL_RE.test(v) ? "Please enter a valid email, like name@example.com." : "";
    case "topic":   return !v ? "Please choose a topic." : "";
    case "message": return v.length < 10 ? "Please write at least 10 characters so we can help." : "";
  }
}

/** Show or clear the error for a field, updating aria-invalid so screen readers know. */
function showFieldError(key) {
  const msg = validateField(key);
  const { input, err } = fields[key];
  err.textContent = msg;
  input.setAttribute("aria-invalid", msg ? "true" : "false");
  return !msg;
}

// Validate when the user leaves a field, and re-validate live once it has been marked invalid
Object.keys(fields).forEach((key) => {
  const { input } = fields[key];
  input.addEventListener("blur", () => showFieldError(key));
  input.addEventListener("input", () => { if (input.getAttribute("aria-invalid") === "true") showFieldError(key); });
});

// Live character counter for the message box
fields.message.input.addEventListener("input", () => {
  $("#cCount").textContent = `${fields.message.input.value.length} / 300`;
});

form.addEventListener("submit", (e) => {
  e.preventDefault();                               // stay on the page (prototype has no server)
  const results = Object.keys(fields).map(showFieldError);
  if (results.includes(false)) {
    // Send keyboard focus to the first invalid field so the user can fix it immediately
    const firstBad = Object.values(fields).find((f) => f.input.getAttribute("aria-invalid") === "true");
    firstBad.input.focus();
    return;
  }
  const name = fields.name.input.value.trim();
  const success = $("#formSuccess");
  success.textContent = `Thanks, ${name}. Your message was received (demo only: nothing was sent).`;
  success.hidden = false;
  form.reset();
  $("#cCount").textContent = "0 / 300";
  Object.values(fields).forEach((f) => f.input.removeAttribute("aria-invalid"));
});

/* 9. PREFERENCES --------------------------------------------------------- */
// First-time guide: show once, remember dismissal
const welcome = $("#welcome");
if (!load("wl-welcome-dismissed", false)) welcome.hidden = false;
$("#welcomeClose").addEventListener("click", () => {
  welcome.hidden = true;
  save("wl-welcome-dismissed", true);
  $("#main").focus();
});

// High-contrast theme toggle (remembered between visits)
const contrastBtn = $("#contrastToggle");
function setContrast(on) {
  document.documentElement.dataset.theme = on ? "contrast" : "";
  contrastBtn.setAttribute("aria-pressed", String(on));
  save("wl-contrast", on);
}
contrastBtn.addEventListener("click", () => setContrast(contrastBtn.getAttribute("aria-pressed") !== "true"));
setContrast(load("wl-contrast", false));

/* 10. KEYBOARD SHORTCUTS AND START-UP ------------------------------------ */
// Space toggles play/pause, but only when the user is not typing or on a control that uses Space itself
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space") return;
  const tag = document.activeElement.tagName;
  if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(tag)) return;
  e.preventDefault();
  togglePlay();
});

/* Start-up: show skeleton cards briefly to mimic loading, then render real content. */
(function init() {
  for (let i = 0; i < PLAYLISTS.length; i++) dom.playlistGrid.appendChild(el("div", "skeleton"));
  renderChips();
  renderTracks();
  renderLibrary();
  // Short delay stands in for a network request; swap for fetch() when a real API is used
  setTimeout(renderPlaylists, 600);
})();
