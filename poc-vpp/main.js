const video = document.getElementById("sourceVideo");
const canvas = document.getElementById("renderCanvas");
const canvasWrap = document.getElementById("canvasWrap");
const ctx = canvas.getContext("2d", { alpha: false });
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

const videoResolutionLabel = document.getElementById("videoResolution");
const canvasBackingLabel = document.getElementById("canvasBacking");
const canvasCssLabel = document.getElementById("canvasCss");
const dprLabel = document.getElementById("dprValue");
const renderLoopLabel = document.getElementById("renderLoop");

const BASE_DIMENSIONS = { width: 640, height: 360 };
const BASE_RECT = { x: 80, y: 60, width: 360, height: 120 };
const scaledRect = { x: 0, y: 0, width: 0, height: 0 };

const adImages = [new Image(), new Image()];
const adStates = [false, false];

const DEFAULT_VIDEO_PATH = "/mnt/data/bafa4988-a1f4-42f2-b4a6-1ce38cd99df4.mp4";
const FALLBACK_VIDEO_PATH = "assets/video.mp4";

let currentAdIndex = 0;
let lastSwitchTimestamp = 0;
let nextSwitchTimeout = null;
let renderReady = false;
let lastRenderedFrame = null;
let renderLoopType = "rAF";
let renderLoopActive = false;

const offscreen = document.createElement("canvas");
const offscreenCtx = offscreen.getContext("2d", { alpha: false });

const fpsState = {
  lastSampleTime: performance.now(),
  frameCount: 0,
  lastFps: 0,
};

const layoutState = {
  dpr: window.devicePixelRatio || 1,
  cssWidth: 0,
  cssHeight: 0,
  offsetX: 0,
  offsetY: 0,
  drawWidth: 0,
  drawHeight: 0,
  scale: 1,
  lastContainerWidth: 0,
  lastVideoWidth: 0,
  lastVideoHeight: 0,
  lastDpr: 0,
};

function updateScaledRect() {
  const scaleX = layoutState.drawWidth / BASE_DIMENSIONS.width;
  const scaleY = layoutState.drawHeight / BASE_DIMENSIONS.height;
  scaledRect.x = layoutState.offsetX + BASE_RECT.x * scaleX;
  scaledRect.y = layoutState.offsetY + BASE_RECT.y * scaleY;
  scaledRect.width = BASE_RECT.width * scaleX;
  scaledRect.height = BASE_RECT.height * scaleY;
}

function updateCanvasLayout(force = false) {
  if (!video.videoWidth || !video.videoHeight) {
    return;
  }

  const containerWidth = canvasWrap.clientWidth || video.videoWidth;
  const dpr = window.devicePixelRatio || 1;
  if (
    !force &&
    containerWidth === layoutState.lastContainerWidth &&
    video.videoWidth === layoutState.lastVideoWidth &&
    video.videoHeight === layoutState.lastVideoHeight &&
    dpr === layoutState.lastDpr
  ) {
    return;
  }
  const aspect = video.videoHeight / video.videoWidth;
  const targetWidth = Math.max(1, containerWidth);
  const targetHeight = Math.max(1, Math.round(targetWidth * aspect));

  layoutState.dpr = dpr;
  layoutState.cssWidth = targetWidth;
  layoutState.cssHeight = targetHeight;
  layoutState.lastContainerWidth = containerWidth;
  layoutState.lastVideoWidth = video.videoWidth;
  layoutState.lastVideoHeight = video.videoHeight;
  layoutState.lastDpr = dpr;

  canvas.style.width = `${targetWidth}px`;
  canvas.style.height = `${targetHeight}px`;

  canvas.width = Math.round(targetWidth * layoutState.dpr);
  canvas.height = Math.round(targetHeight * layoutState.dpr);
  ctx.setTransform(layoutState.dpr, 0, 0, layoutState.dpr, 0, 0);

  const scale = Math.min(targetWidth / video.videoWidth, targetHeight / video.videoHeight);
  layoutState.scale = scale;
  layoutState.drawWidth = video.videoWidth * scale;
  layoutState.drawHeight = video.videoHeight * scale;
  layoutState.offsetX = (targetWidth - layoutState.drawWidth) / 2;
  layoutState.offsetY = (targetHeight - layoutState.drawHeight) / 2;

  offscreen.width = video.videoWidth;
  offscreen.height = video.videoHeight;

  updateScaledRect();
  updateQualityDebug();
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

function updateQualityDebug() {
  if (!video.videoWidth || !video.videoHeight) {
    videoResolutionLabel.textContent = "-";
  } else {
    videoResolutionLabel.textContent = `${video.videoWidth} x ${video.videoHeight}`;
  }

  canvasBackingLabel.textContent = `${canvas.width} x ${canvas.height}`;
  const rect = canvas.getBoundingClientRect();
  canvasCssLabel.textContent = `${Math.round(rect.width)} x ${Math.round(rect.height)}`;
  dprLabel.textContent = layoutState.dpr.toFixed(2);
  renderLoopLabel.textContent = renderLoopType;
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

function setSmoothing() {
  const scaleX = layoutState.drawWidth / video.videoWidth;
  const scaleY = layoutState.drawHeight / video.videoHeight;
  const scale = Math.min(scaleX, scaleY);
  if (scale >= 1) {
    ctx.imageSmoothingEnabled = false;
    ctx.imageSmoothingQuality = "low";
  } else {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }
}

function drawInventoryBox() {
  if (!showBoxCheckbox.checked) {
    return;
  }
  ctx.save();
  ctx.strokeStyle = "rgba(0, 255, 180, 0.9)";
  ctx.lineWidth = Math.max(2, layoutState.cssWidth * 0.003);
  ctx.strokeRect(scaledRect.x, scaledRect.y, scaledRect.width, scaledRect.height);
  ctx.fillStyle = "rgba(0, 255, 180, 0.15)";
  ctx.fillRect(scaledRect.x, scaledRect.y, scaledRect.width, scaledRect.height);
  ctx.fillStyle = "rgba(0, 255, 180, 0.9)";
  ctx.font = `${Math.max(14, layoutState.cssWidth * 0.02)}px sans-serif`;
  ctx.fillText("INVENTORY", scaledRect.x + 8, scaledRect.y + 24);
  ctx.restore();
}

function drawFrame(now) {
  if (!renderReady) {
    return;
  }

  updateCanvasLayout();
  setSmoothing();

  if (!video.paused && !video.ended) {
    offscreenCtx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
    lastRenderedFrame = offscreen;
  }

  if (lastRenderedFrame) {
    ctx.clearRect(0, 0, layoutState.cssWidth, layoutState.cssHeight);
    ctx.drawImage(
      lastRenderedFrame,
      0,
      0,
      video.videoWidth,
      video.videoHeight,
      layoutState.offsetX,
      layoutState.offsetY,
      layoutState.drawWidth,
      layoutState.drawHeight
    );
  }

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

function renderFrame(now, metadata) {
  drawFrame(now || performance.now());
  if (renderLoopType === "rVFC" && metadata) {
    video.requestVideoFrameCallback(renderFrame);
  }
}

function startRenderLoop() {
  if (renderLoopActive) {
    return;
  }
  renderLoopActive = true;
  if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
    renderLoopType = "rVFC";
    video.requestVideoFrameCallback(renderFrame);
  } else {
    renderLoopType = "rAF";
    const loop = (now) => {
      drawFrame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  updateQualityDebug();
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
  updateCanvasLayout(true);
  hideOverlay();
  ensureVideoPlayback();
  startRenderLoop();
}

function setVideoSource(url) {
  renderReady = false;
  video.src = url;
  video.load();
}

function initVideo() {
  setVideoSource(DEFAULT_VIDEO_PATH);

  video.addEventListener("loadedmetadata", handleVideoReady);
  video.addEventListener("play", () => {
    hideOverlay();
    startRenderLoop();
  });
  video.addEventListener("pause", () => {
    if (!video.ended) {
      setOverlay("Video paused.", false, true);
    }
  });

  video.addEventListener("error", () => {
    if (video.src.includes(DEFAULT_VIDEO_PATH) && FALLBACK_VIDEO_PATH) {
      setVideoSource(FALLBACK_VIDEO_PATH);
      return;
    }
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

function detectFallbackVideo() {
  const probe = document.createElement("video");
  probe.src = FALLBACK_VIDEO_PATH;
  probe.addEventListener(
    "loadedmetadata",
    () => {
      if (!renderReady && video.currentSrc.includes(DEFAULT_VIDEO_PATH)) {
        setVideoSource(FALLBACK_VIDEO_PATH);
      }
    },
    { once: true }
  );
  probe.addEventListener(
    "error",
    () => {
      // Ignore if fallback asset is unavailable.
    },
    { once: true }
  );
}

function handleResize() {
  updateCanvasLayout(true);
  drawFrame(performance.now());
}

async function init() {
  initControls();
  initVideo();
  detectFallbackVideo();
  await initAds();
  updateScaledRect();
  updateDebug();
  updateQualityDebug();
  handleModeChange();
  setOverlay("Loading video...", false, false);
  window.addEventListener("resize", handleResize);
}

init();
