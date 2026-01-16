# Client-side Virtual Ad Replacement (POC)

This repo hosts a pure JavaScript proof-of-concept that renders a hidden video into a visible canvas and performs client-side virtual ad replacement using perspective warping. It supports interactive quad selection, OpenCV-based quad auto-detection, and optional camera input for live sports-style moments.

## Features

- **High-quality canvas rendering** with device pixel ratio support and `requestVideoFrameCallback` when available.
- **Quad editing**: click four points to create candidate quads.
- **Auto-detect**: basic OpenCV contour detection to find multiple quads every second.
- **Auto-pick**: scores and selects the best quad for ad replacement.
- **Perspective warping**: ad content is mapped onto the selected quad.
- **Random ad switching** every few seconds (with procedural placeholders if assets are missing).

## How to run

```bash
python -m http.server 8000
```

Then open `http://127.0.0.1:8000/index.html` in Chrome.

## Usage tips

- Use **Auto Detect Quad** to let OpenCV propose multiple quads.
- Toggle **Edit Mode** to manually add quad points.
- Use **Use Camera** for a live feed; grant browser permissions when prompted.

## Assets

- The demo attempts to load `assets/ad1.png` and `assets/ad2.png`. If missing, it will generate procedural placeholder ads.
- If no video asset is available, upload a local MP4 when prompted.
