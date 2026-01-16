const video = document.getElementById("sourceVideo");
const canvas = document.getElementById("renderCanvas");
const canvasWrap = document.getElementById("canvasWrap");
const ctx = canvas.getContext("2d", { alpha: false });
const overlay = document.getElementById("overlay");
const overlayMessage = document.getElementById("overlayMessage");
const videoInput = document.getElementById("videoInput");
const videoInputLabel = document.getElementById("videoInputLabel");
const playButton = document.getElementById("playButton");

const toggleEditButton = document.getElementById("toggleEdit");
const clearCurrentButton = document.getElementById("clearCurrent");
const undoQuadButton = document.getElementById("undoQuad");
const clearAllButton = document.getElementById("clearAll");
const autoDetectButton = document.getElementById("autoDetect");
const autoStatusLabel = document.getElementById("autoStatus");
const quadCountLabel = document.getElementById("quadCount");
const selectedQuadLabel = document.getElementById("selectedQuad");
const selectedScoreLabel = document.getElementById("selectedScore");
const quadScoresLabel = document.getElementById("quadScores");
const pointCoordsLabel = document.getElementById("pointCoords");
const showBoxCheckbox = document.getElementById("showBox");
const fpsLabel = document.getElementById("fps");

const videoResolutionLabel = document.getElementById("videoResolution");
const canvasBackingLabel = document.getElementById("canvasBacking");
const canvasCssLabel = document.getElementById("canvasCss");
const dprLabel = document.getElementById("dprValue");
const renderLoopLabel = document.getElementById("renderLoop");

const DEFAULT_VIDEO_PATH = "/mnt/data/bafa4988-a1f4-42f2-b4a6-1ce38cd99df4.mp4";
const FALLBACK_VIDEO_PATH = "assets/video.mp4";

const adImages = [new Image(), new Image()];
const adStates = [false, false];

const BASE_AD_RATIO = 3.0;
const GRID_COLS = 20;
const GRID_ROWS = 6;

let renderReady = false;
let renderLoopType = "rAF";
let renderLoopActive = false;
let lastRenderedFrame = null;
let currentAdIndex = 0;
let lastSwitchTimestamp = 0;
let nextSwitchTimeout = null;
let editMode = false;
let opencvReady = false;

const quads = [];
let activePoints = [];

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

const offscreen = document.createElement("canvas");
const offscreenCtx = offscreen.getContext("2d", { alpha: false });
const detectionCanvas = document.createElement("canvas");
const detectionCtx = detectionCanvas.getContext("2d", { alpha: false });

function setOverlay(message, showInput, showPlay) {
  overlayMessage.textContent = message;
  videoInputLabel.classList.toggle("hidden", !showInput);
  playButton.classList.toggle("hidden", !showPlay);
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
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

  canvas.width = Math.round(targetWidth * dpr);
  canvas.height = Math.round(targetHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const scale = Math.min(targetWidth / video.videoWidth, targetHeight / video.videoHeight);
  layoutState.scale = scale;
  layoutState.drawWidth = video.videoWidth * scale;
  layoutState.drawHeight = video.videoHeight * scale;
  layoutState.offsetX = (targetWidth - layoutState.drawWidth) / 2;
  layoutState.offsetY = (targetHeight - layoutState.drawHeight) / 2;

  offscreen.width = video.videoWidth;
  offscreen.height = video.videoHeight;

  updateQualityDebug();
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

function formatPoint(point) {
  return `(${point.x.toFixed(1)}, ${point.y.toFixed(1)})`;
}

function updateQuadDebug(bestQuadIndex, bestScore, scores) {
  quadCountLabel.textContent = `${quads.length}`;
  selectedQuadLabel.textContent = bestQuadIndex >= 0 ? `${bestQuadIndex + 1}` : "-";
  selectedScoreLabel.textContent = bestQuadIndex >= 0 ? bestScore.toFixed(3) : "-";
  quadScoresLabel.textContent = scores.length
    ? scores.map((score, index) => `#${index + 1}: ${score.toFixed(3)}`).join(" | ")
    : "-";
  const selectedPoints =
    bestQuadIndex >= 0 ? quads[bestQuadIndex] : activePoints.length ? activePoints : null;
  const pointsText = selectedPoints
    ? selectedPoints.map((point, idx) => `${idx + 1}${formatPoint(point)}`).join(", ")
    : "-";
  pointCoordsLabel.textContent = pointsText;
}

function handleCanvasClick(event) {
  if (!editMode) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  activePoints.push({ x, y });
  if (activePoints.length === 4) {
    const normalized = normalizeQuad(activePoints);
    quads.push(normalized);
    activePoints = [];
  }
}

function clearCurrentPoints() {
  activePoints = [];
}

function undoLastQuad() {
  quads.pop();
}

function clearAllQuads() {
  quads.length = 0;
  activePoints = [];
}

function toggleEditMode() {
  editMode = !editMode;
  toggleEditButton.textContent = editMode ? "Disable Edit Mode" : "Enable Edit Mode";
}

function setAutoStatus(message) {
  autoStatusLabel.textContent = message;
}

function waitForOpenCv(timeoutMs = 8000) {
  return new Promise((resolve) => {
    const start = performance.now();
    const timer = window.setInterval(() => {
      if (window.cv && window.cv.Mat) {
        window.clearInterval(timer);
        opencvReady = true;
        resolve(true);
        return;
      }
      if (performance.now() - start > timeoutMs) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

function mapVideoPointToCanvas(point) {
  return {
    x: layoutState.offsetX + point.x * layoutState.scale,
    y: layoutState.offsetY + point.y * layoutState.scale,
  };
}

function extractQuadFromContours(srcMat) {
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edged = new cv.Mat();
  cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  cv.Canny(blurred, edged, 60, 180);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(edged, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let bestQuad = null;
  let bestArea = 0;
  for (let i = 0; i < contours.size(); i += 1) {
    const contour = contours.get(i);
    const peri = cv.arcLength(contour, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, 0.02 * peri, true);
    if (approx.rows === 4 && cv.isContourConvex(approx)) {
      const area = cv.contourArea(approx);
      if (area > bestArea) {
        bestArea = area;
        bestQuad = approx;
      } else {
        approx.delete();
      }
    } else {
      approx.delete();
    }
    contour.delete();
  }

  gray.delete();
  blurred.delete();
  edged.delete();
  contours.delete();
  hierarchy.delete();

  if (!bestQuad) {
    return null;
  }

  const points = [];
  for (let i = 0; i < 4; i += 1) {
    const x = bestQuad.intPtr(i, 0)[0];
    const y = bestQuad.intPtr(i, 0)[1];
    points.push({ x, y });
  }
  bestQuad.delete();
  return points;
}

async function autoDetectQuad() {
  setAutoStatus("Detecting...");
  if (!opencvReady) {
    const ready = await waitForOpenCv();
    if (!ready) {
      setAutoStatus("OpenCV failed to load");
      return;
    }
  }

  if (!video.videoWidth || !video.videoHeight) {
    setAutoStatus("Video not ready");
    return;
  }

  detectionCanvas.width = video.videoWidth;
  detectionCanvas.height = video.videoHeight;
  if (lastRenderedFrame) {
    detectionCtx.drawImage(lastRenderedFrame, 0, 0);
  } else {
    detectionCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
  }

  const src = cv.imread(detectionCanvas);
  const quadPoints = extractQuadFromContours(src);
  src.delete();

  if (!quadPoints) {
    setAutoStatus("No quad found");
    return;
  }

  const mappedPoints = quadPoints.map(mapVideoPointToCanvas);
  const normalized = normalizeQuad(mappedPoints);
  quads.push(normalized);
  setAutoStatus("Quad added");
}

function normalizeQuad(points) {
  const centroid = points.reduce(
    (acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
    { x: 0, y: 0 }
  );
  const sorted = [...points].sort((a, b) => {
    const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
    const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
    return angleA - angleB;
  });
  const bySum = (point) => point.x + point.y;
  const byDiff = (point) => point.y - point.x;
  const topLeft = sorted.reduce((best, point) => (bySum(point) < bySum(best) ? point : best));
  const bottomRight = sorted.reduce((best, point) => (bySum(point) > bySum(best) ? point : best));
  const topRight = sorted.reduce((best, point) => (byDiff(point) < byDiff(best) ? point : best));
  const bottomLeft = sorted.reduce((best, point) => (byDiff(point) > byDiff(best) ? point : best));
  return [topLeft, topRight, bottomRight, bottomLeft];
}

function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    sum += points[i].x * next.y - next.x * points[i].y;
  }
  return Math.abs(sum) / 2;
}

function isConvex(points) {
  if (points.length < 4) {
    return false;
  }
  let sign = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];
    const p2 = points[(i + 2) % points.length];
    const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
    const currentSign = Math.sign(cross);
    if (currentSign !== 0) {
      if (sign === 0) {
        sign = currentSign;
      } else if (sign !== currentSign) {
        return false;
      }
    }
  }
  return true;
}

function quadBoundingBox(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function quadCentroid(points) {
  const area = polygonArea(points) || 1;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    const cross = points[i].x * next.y - next.x * points[i].y;
    cx += (points[i].x + next.x) * cross;
    cy += (points[i].y + next.y) * cross;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

function edgeLengths(points) {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
}

function scoreQuad(points) {
  if (!isConvex(points)) {
    return 0;
  }
  const area = polygonArea(points);
  const totalArea = layoutState.drawWidth * layoutState.drawHeight || 1;
  const areaRatio = area / totalArea;
  let areaScore = 0;
  if (areaRatio >= 0.05 && areaRatio <= 0.3) {
    areaScore = 1;
  } else if (areaRatio < 0.05) {
    areaScore = areaRatio / 0.05;
  } else if (areaRatio > 0.3) {
    areaScore = Math.max(0, 1 - (areaRatio - 0.3) / 0.3);
  }

  const bbox = quadBoundingBox(points);
  const ratio = bbox.width / bbox.height;
  const ratioDeviation = Math.abs(Math.log(ratio / BASE_AD_RATIO));
  const aspectScore = Math.max(0, 1 - ratioDeviation / 1.2);

  const lengths = edgeLengths(points);
  const topBottom = Math.abs(lengths[0] - lengths[2]) / Math.max(lengths[0], lengths[2], 1);
  const leftRight = Math.abs(lengths[1] - lengths[3]) / Math.max(lengths[1], lengths[3], 1);
  const skewScore = Math.max(0, 1 - (topBottom + leftRight) / 2);

  const centroid = quadCentroid(points);
  const normX = (centroid.x - layoutState.offsetX) / layoutState.drawWidth;
  const normY = (centroid.y - layoutState.offsetY) / layoutState.drawHeight;
  const targetX = 0.5;
  const targetY = 0.35;
  const dist = Math.hypot(normX - targetX, normY - targetY);
  let positionScore = Math.max(0, 1 - dist / 0.6);
  if (normX < 0.1 || normX > 0.9 || normY < 0.1 || normY > 0.9) {
    positionScore *= 0.6;
  }

  const totalScore =
    areaScore * 0.35 + aspectScore * 0.25 + skewScore * 0.2 + positionScore * 0.2;
  return totalScore;
}

function selectBestQuad() {
  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  const scores = quads.map((quad) => scoreQuad(quad));
  scores.forEach((score, index) => {
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  if (!scores.length) {
    bestScore = 0;
  }
  updateQuadDebug(bestIndex, bestScore, scores);
  return { bestIndex, bestScore, scores };
}

function drawMarkers(points, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, layoutState.cssWidth * 0.002);
  points.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(6, layoutState.cssWidth * 0.008), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0b0d12";
    ctx.font = `${Math.max(12, layoutState.cssWidth * 0.02)}px sans-serif`;
    ctx.fillText(`${index + 1}`, point.x - 4, point.y + 4);
    ctx.fillStyle = color;
  });
  ctx.restore();
}

function drawQuadOutline(points, color) {
  if (points.length < 2) {
    return;
  }
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, layoutState.cssWidth * 0.003);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  if (points.length === 4) {
    ctx.closePath();
    ctx.fillStyle = "rgba(0, 255, 180, 0.12)";
    ctx.fill();
  }
  ctx.stroke();
  ctx.restore();
}

function quadPoint(quad, u, v) {
  const top = {
    x: quad[0].x + (quad[1].x - quad[0].x) * u,
    y: quad[0].y + (quad[1].y - quad[0].y) * u,
  };
  const bottom = {
    x: quad[3].x + (quad[2].x - quad[3].x) * u,
    y: quad[3].y + (quad[2].y - quad[3].y) * u,
  };
  return {
    x: top.x + (bottom.x - top.x) * v,
    y: top.y + (bottom.y - top.y) * v,
  };
}

function drawTexturedTriangle(img, srcTri, dstTri) {
  const [sx0, sy0, sx1, sy1, sx2, sy2] = srcTri;
  const [dx0, dy0, dx1, dy1, dx2, dy2] = dstTri;
  const det = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
  if (det === 0) {
    return;
  }

  const a = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / det;
  const b = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / det;
  const c = (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / det;
  const d = (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / det;
  const e = (dx0 * (sx1 * sy2 - sx2 * sy1) +
    dx1 * (sx2 * sy0 - sx0 * sy2) +
    dx2 * (sx0 * sy1 - sx1 * sy0)) / det;
  const f = (dy0 * (sx1 * sy2 - sx2 * sy1) +
    dy1 * (sx2 * sy0 - sx0 * sy2) +
    dy2 * (sx0 * sy1 - sx1 * sy0)) / det;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dx0, dy0);
  ctx.lineTo(dx1, dy1);
  ctx.lineTo(dx2, dy2);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(layoutState.dpr, 0, 0, layoutState.dpr, 0, 0);
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function drawWarpedAd(quad) {
  const adImage = adImages[currentAdIndex];
  if (!adStates[currentAdIndex]) {
    return;
  }
  const imgWidth = adImage.width;
  const imgHeight = adImage.height;
  if (!imgWidth || !imgHeight) {
    return;
  }

  for (let row = 0; row < GRID_ROWS; row += 1) {
    const v0 = row / GRID_ROWS;
    const v1 = (row + 1) / GRID_ROWS;
    for (let col = 0; col < GRID_COLS; col += 1) {
      const u0 = col / GRID_COLS;
      const u1 = (col + 1) / GRID_COLS;

      const p00 = quadPoint(quad, u0, v0);
      const p10 = quadPoint(quad, u1, v0);
      const p01 = quadPoint(quad, u0, v1);
      const p11 = quadPoint(quad, u1, v1);

      const sx0 = u0 * imgWidth;
      const sx1 = u1 * imgWidth;
      const sy0 = v0 * imgHeight;
      const sy1 = v1 * imgHeight;

      drawTexturedTriangle(
        adImage,
        [sx0, sy0, sx1, sy0, sx1, sy1],
        [p00.x, p00.y, p10.x, p10.y, p11.x, p11.y]
      );
      drawTexturedTriangle(
        adImage,
        [sx0, sy0, sx1, sy1, sx0, sy1],
        [p00.x, p00.y, p11.x, p11.y, p01.x, p01.y]
      );
    }
  }
}

function drawQuadOverlays(bestIndex) {
  if (!showBoxCheckbox.checked) {
    return;
  }
  quads.forEach((quad, index) => {
    const color = index === bestIndex ? "rgba(0, 255, 120, 0.9)" : "rgba(180, 180, 180, 0.6)";
    drawQuadOutline(quad, color);
  });
  if (activePoints.length) {
    drawQuadOutline(activePoints, "rgba(255, 200, 0, 0.9)");
    drawMarkers(activePoints, "rgba(255, 200, 0, 0.9)");
  }
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

  const { bestIndex } = selectBestQuad();
  if (bestIndex >= 0) {
    drawWarpedAd(quads[bestIndex]);
  }
  drawQuadOverlays(bestIndex);
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
  adCanvas.width = 600;
  adCanvas.height = 200;
  const adCtx = adCanvas.getContext("2d");

  adCtx.fillStyle = "#0f1115";
  adCtx.fillRect(0, 0, adCanvas.width, adCanvas.height);
  adCtx.fillStyle = accent;
  adCtx.fillRect(20, 20, adCanvas.width - 40, adCanvas.height - 40);
  adCtx.fillStyle = "rgba(0, 0, 0, 0.25)";
  adCtx.fillRect(30, 30, adCanvas.width - 60, adCanvas.height - 60);

  adCtx.fillStyle = "#f8fafc";
  adCtx.font = "bold 46px sans-serif";
  adCtx.fillText(label, 46, 120);
  adCtx.font = "22px sans-serif";
  adCtx.fillText("Procedural placeholder", 46, 162);

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

function scheduleNextSwitch() {
  if (nextSwitchTimeout) {
    clearTimeout(nextSwitchTimeout);
  }
  const delay = 2000 + Math.random() * 3000;
  nextSwitchTimeout = window.setTimeout(() => {
    currentAdIndex = Math.random() < 0.5 ? 0 : 1;
    lastSwitchTimestamp = Date.now();
    scheduleNextSwitch();
  }, delay);
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

function initControls() {
  toggleEditButton.addEventListener("click", toggleEditMode);
  clearCurrentButton.addEventListener("click", clearCurrentPoints);
  undoQuadButton.addEventListener("click", undoLastQuad);
  clearAllButton.addEventListener("click", clearAllQuads);
  autoDetectButton.addEventListener("click", autoDetectQuad);
  canvas.addEventListener("click", handleCanvasClick);
}

async function initAds() {
  await Promise.all([
    loadAdImage(0, "assets/ad1.png", "Ad 1", "#2dd4bf"),
    loadAdImage(1, "assets/ad2.png", "Ad 2", "#f97316"),
  ]);
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
  updateQualityDebug();
  updateQuadDebug(-1, 0, []);
  setAutoStatus("Loading OpenCV...");
  const ready = await waitForOpenCv();
  setAutoStatus(ready ? "Ready" : "OpenCV failed to load");
  scheduleNextSwitch();
  setOverlay("Loading video...", false, false);
  window.addEventListener("resize", handleResize);
}

init();
