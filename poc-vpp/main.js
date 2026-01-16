const video = document.getElementById("sourceVideo");
const canvas = document.getElementById("renderCanvas");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayMessage = document.getElementById("overlayMessage");
const videoInput = document.getElementById("videoInput");
const videoInputLabel = document.getElementById("videoInputLabel");
const playButton = document.getElementById("playButton");

const currentAdLabel = document.getElementById("currentAd");
const lastSwitchLabel = document.getElementById("lastSwitch");
const fpsLabel = document.getElementById("fps");
const showBoxCheckbox = document.getElementById("showBox");
const modeSelect = document.getElementById("modeSelect");
const forceAd1Button = document.getElementById("forceAd1");
const forceAd2Button = document.getElementById("forceAd2");

const BASE_DIMENSIONS = { width: 640, height: 360 };
const BASE_RECT = { x: 80, y: 60, width: 360, height: 120 };
const scaledRect = { x: 0, y: 0, width: 0, height: 0 };

const adImages = [new Image(), new Image()];
const adStates = [false, false];

let currentAdIndex = 0;
let lastSwitchTimestamp = 0;
let nextSwitchTimeout = null;
let animationFrameId = null;
let renderReady = false;
let lastCanvasWidth = canvas.width;
let lastCanvasHeight = canvas.height;

const offscreen = document.createElement("canvas");
const offscreenCtx = offscreen.getContext("2d");

const fpsState = {
  lastSampleTime: performance.now(),
  frameCount: 0,
  lastFps: 0,
};

function updateScaledRect() {
  const scaleX = canvas.width / BASE_DIMENSIONS.width;
  const scaleY = canvas.height / BASE_DIMENSIONS.height;
  scaledRect.x = Math.round(BASE_RECT.x * scaleX);
  scaledRect.y = Math.round(BASE_RECT.y * scaleY);
  scaledRect.width = Math.round(BASE_RECT.width * scaleX);
  scaledRect.height = Math.round(BASE_RECT.height * scaleY);
}

function updateCanvasSize() {
  if (!video.videoWidth || !video.videoHeight) {
    return;
  }

  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    offscreen.width = video.videoWidth;
    offscreen.height = video.videoHeight;
  }

  if (canvas.width !== lastCanvasWidth || canvas.height !== lastCanvasHeight) {
    lastCanvasWidth = canvas.width;
    lastCanvasHeight = canvas.height;
    updateScaledRect();
  }
}

function setOverlay(message, showInput, showPlay) {
  overlayMessage.textContent = message;
  videoInputLabel.classList.toggle("hidden", !showInput);
  playButton.classList.toggle("hidden", !showPlay);
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function formatTimestamp(ts) {
  if (!ts) {
    return "-";
  }
  return new Date(ts).toLocaleTimeString();
}

function updateDebug() {
  currentAdLabel.textContent = currentAdIndex === 0 ? "ad1" : "ad2";
  lastSwitchLabel.textContent = formatTimestamp(lastSwitchTimestamp);
  fpsLabel.textContent = fpsState.lastFps.toFixed(1);
}

function switchAd(index) {
  if (currentAdIndex !== index) {
    currentAdIndex = index;
    lastSwitchTimestamp = Date.now();
    updateDebug();
  }
}

function scheduleNextSwitch() {
  if (nextSwitchTimeout) {
    clearTimeout(nextSwitchTimeout);
  }
  const delay = 2000 + Math.random() * 3000;
  nextSwitchTimeout = window.setTimeout(() => {
    switchAd(Math.random() < 0.5 ? 0 : 1);
    if (modeSelect.value === "interval") {
      scheduleNextSwitch();
    }
  }, delay);
}

function handleModeChange() {
  if (nextSwitchTimeout) {
    clearTimeout(nextSwitchTimeout);
    nextSwitchTimeout = null;
  }
  if (modeSelect.value === "interval") {
    scheduleNextSwitch();
  }
}

function updateFps(now) {
  fpsState.frameCount += 1;
  const delta = now - fpsState.lastSampleTime;
  if (delta >= 500) {
    fpsState.lastFps = (fpsState.frameCount / delta) * 1000;
    fpsState.frameCount = 0;
    fpsState.lastSampleTime = now;
    fpsLabel.textContent = fpsState.lastFps.toFixed(1);
  }
}

function drawInventoryBox() {
  if (!showBoxCheckbox.checked) {
    return;
  }
  ctx.save();
  ctx.strokeStyle = "rgba(0, 255, 180, 0.9)";
  ctx.lineWidth = Math.max(2, canvas.width * 0.003);
  ctx.strokeRect(scaledRect.x, scaledRect.y, scaledRect.width, scaledRect.height);
  ctx.fillStyle = "rgba(0, 255, 180, 0.15)";
  ctx.fillRect(scaledRect.x, scaledRect.y, scaledRect.width, scaledRect.height);
  ctx.fillStyle = "rgba(0, 255, 180, 0.9)";
  ctx.font = `${Math.max(14, canvas.width * 0.02)}px sans-serif`;
  ctx.fillText("INVENTORY", scaledRect.x + 8, scaledRect.y + 24);
  ctx.restore();
}

function renderFrame(now) {
  animationFrameId = requestAnimationFrame(renderFrame);

  if (!renderReady) {
    return;
  }

  updateCanvasSize();

  if (!video.paused && !video.ended) {
    offscreenCtx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
  }

  ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);

  if (modeSelect.value === "frame") {
    const nextIndex = Math.random() < 0.5 ? 0 : 1;
    if (nextIndex !== currentAdIndex) {
      switchAd(nextIndex);
    }
  }

  const adImage = adImages[currentAdIndex];
  if (adStates[currentAdIndex]) {
    ctx.drawImage(adImage, scaledRect.x, scaledRect.y, scaledRect.width, scaledRect.height);
  }

  drawInventoryBox();
  updateFps(now);
}

function createProceduralAd(label, accent) {
  const adCanvas = document.createElement("canvas");
  adCanvas.width = 640;
  adCanvas.height = 220;
  const adCtx = adCanvas.getContext("2d");

  adCtx.fillStyle = "#0f1115";
  adCtx.fillRect(0, 0, adCanvas.width, adCanvas.height);
  adCtx.fillStyle = accent;
  adCtx.fillRect(20, 20, adCanvas.width - 40, adCanvas.height - 40);
  adCtx.fillStyle = "rgba(0, 0, 0, 0.2)";
  adCtx.fillRect(30, 30, adCanvas.width - 60, adCanvas.height - 60);

  adCtx.fillStyle = "#f8fafc";
  adCtx.font = "bold 46px sans-serif";
  adCtx.fillText(label, 50, 120);
  adCtx.font = "24px sans-serif";
  adCtx.fillText("Procedural placeholder", 50, 165);

  return adCanvas.toDataURL("image/png");
}

function loadAdImage(index, src, fallbackLabel, accent) {
  return new Promise((resolve) => {
    const img = adImages[index];
    const handleLoad = () => {
      adStates[index] = true;
      resolve();
    };
    const handleError = () => {
      img.removeEventListener("load", handleLoad);
      img.removeEventListener("error", handleError);
      img.src = createProceduralAd(fallbackLabel, accent);
      img.addEventListener("load", handleLoad, { once: true });
    };

    img.addEventListener("load", handleLoad, { once: true });
    img.addEventListener("error", handleError, { once: true });
    img.src = src;
  });
}

function ensureVideoPlayback() {
  const playPromise = video.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      setOverlay("Playback is paused. Click to start video with audio.", false, true);
    });
  }
}

function handleVideoReady() {
  renderReady = true;
  updateCanvasSize();
  hideOverlay();
  ensureVideoPlayback();
  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(renderFrame);
  }
}

function setVideoSource(url) {
  renderReady = false;
  video.src = url;
  video.load();
}

function initVideo() {
  setVideoSource("assets/video.mp4");

  video.addEventListener("loadedmetadata", handleVideoReady);
  video.addEventListener("play", hideOverlay);
  video.addEventListener("pause", () => {
    if (!video.ended) {
      setOverlay("Video paused.", false, true);
    }
  });

  video.addEventListener("error", () => {
    setOverlay("No video found. Upload a local MP4 to continue.", true, false);
  });

  videoInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setVideoSource(objectUrl);
      hideOverlay();
    }
  });

  playButton.addEventListener("click", () => {
    hideOverlay();
    ensureVideoPlayback();
  });
}

async function initAds() {
  await Promise.all([
    loadAdImage(0, "assets/ad1.png", "Ad 1", "#2dd4bf"),
    loadAdImage(1, "assets/ad2.png", "Ad 2", "#f97316"),
  ]);
}

function initControls() {
  modeSelect.addEventListener("change", handleModeChange);
  forceAd1Button.addEventListener("click", () => {
    switchAd(0);
    if (modeSelect.value === "manual") {
      updateDebug();
    }
  });
  forceAd2Button.addEventListener("click", () => {
    switchAd(1);
    if (modeSelect.value === "manual") {
      updateDebug();
    }
  });
}

async function init() {
  initControls();
  initVideo();
  await initAds();
  updateScaledRect();
  updateDebug();
  handleModeChange();
  setOverlay("Loading video...", false, false);
}

init();
