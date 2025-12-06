/* --- Woodcut Tool JavaScript (Syntax Fixed & Optimized) --- */

// ==========================================
// 1. 噪声算法 (Perlin Noise)
// ==========================================

class Vector2 {
  constructor(x, y) {this.x = x;this.y = y;}
  dot(other) {return this.x * other.x + this.y * other.y;}}


function Shuffle(arrayToShuffle) {
  for (let e = arrayToShuffle.length - 1; e > 0; e--) {
    const index = Math.round(Math.random() * (e - 1));
    const temp = arrayToShuffle[e];
    arrayToShuffle[e] = arrayToShuffle[index];
    arrayToShuffle[index] = temp;
  }
}

function MakePermutation() {
  const permutation = [];
  for (let i = 0; i < 256; i++) permutation.push(i);
  Shuffle(permutation);
  for (let i = 0; i < 256; i++) permutation.push(permutation[i]);
  return permutation;
}

const Permutation = MakePermutation();

function GetConstantVector(v) {
  const h = v & 3;
  if (h === 0) return new Vector2(1.0, 1.0);else
  if (h === 1) return new Vector2(-1.0, 1.0);else
  if (h === 2) return new Vector2(-1.0, -1.0);else
  return new Vector2(1.0, -1.0);
}

function Fade(t) {return ((6 * t - 15) * t + 10) * t * t * t;}
function Lerp(t, a1, a2) {return a1 + t * (a2 - a1);}

function Noise2D(x, y) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const topRight = new Vector2(xf - 1.0, yf - 1.0);
  const topLeft = new Vector2(xf, yf - 1.0);
  const bottomRight = new Vector2(xf - 1.0, yf);
  const bottomLeft = new Vector2(xf, yf);

  const valueTopRight = Permutation[Permutation[X + 1] + Y + 1];
  const valueTopLeft = Permutation[Permutation[X] + Y + 1];
  const valueBottomRight = Permutation[Permutation[X + 1] + Y];
  const valueBottomLeft = Permutation[Permutation[X] + Y];

  const dotTopRight = topRight.dot(GetConstantVector(valueTopRight));
  const dotTopLeft = topLeft.dot(GetConstantVector(valueTopLeft));
  const dotBottomRight = bottomRight.dot(GetConstantVector(valueBottomRight));
  const dotBottomLeft = bottomLeft.dot(GetConstantVector(valueBottomLeft));

  const u = Fade(xf);
  const v = Fade(yf);
  return Lerp(u, Lerp(v, dotBottomLeft, dotTopLeft), Lerp(v, dotBottomRight, dotTopRight));
}

// ==========================================
// 2. 基础 DOM 与辅助工具
// ==========================================

function getEl(id) {return document.getElementById(id);}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized, 16);
  return { r: bigint >> 16 & 255, g: bigint >> 8 & 255, b: bigint & 255 };
}

// 防抖函数
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delay);
  };
}

// DOM Elements
const imageUpload = getEl('imageUpload');
const contentImg = getEl('contentImage');
const uploadArea = getEl('uploadArea');
const uploadPlaceholder = getEl('uploadPlaceholder');
const downloadPngButton = getEl('downloadPng');
const downloadJpgButton = getEl('downloadJpg');
const downloadSvgButton = getEl('downloadSvg');
const resetSettingsButton = getEl('resetSettings');
const loadingOverlay = getEl('loadingOverlay');

const thresholdSlider = getEl('threshold');
const thresholdValue = getEl('thresholdValue');
const edgeSlider = getEl('edgeStrength');
const edgeValue = getEl('edgeValue');
const smoothnessSlider = getEl('smoothness');
const smoothnessValue = getEl('smoothnessValue');
const detailSlider = getEl('detailLevel');
const detailValue = getEl('detailValue');

const backgroundColorInput = getEl('backgroundColor');
const foregroundColorInput = getEl('foregroundColor');
const bgDisplay = getEl('bgDisplay');
const fgDisplay = getEl('fgDisplay');

const styledCanvas = getEl('styledCanvas');
const originalCanvas = getEl('originalCanvas');
const colorPaletteSelect = getEl('colorPalette');
const stylePresetSelect = getEl('stylePreset');
const canvasStage = getEl('canvasStage');

// Constants & State
const DEFAULT_BG = '#ffffff';
const DEFAULT_FG = '#53565c';
const DEFAULT_PALETTE = 'classic';
const DEFAULT_STYLE = 'graphic';

let selectedBgColor = DEFAULT_BG;
let selectedFgColor = DEFAULT_FG;
let originalImageData = null;
let maskData = null;
let precomputedNoiseMap = null;
let currentAspectRatio = '3:4';

const MAX_EXPORT_DIM = 4096;
const MAX_PREVIEW_DIM = 800; // 性能优化

const colorPalettes = {
  classic: { bg: '#ffffff', fg: '#53565c' },
  'red-black': { bg: '#f5e6d3', fg: '#8b0000' },
  'blue-ochre': { bg: '#e8d5b7', fg: '#1e3a5f' },
  'green-sepia': { bg: '#ede5d8', fg: '#3a5f3a' },
  'chinese-red': { bg: '#f0e7d8', fg: '#c8102e' },
  'prussian-blue': { bg: '#e8e4d9', fg: '#003153' },
  'earth-tones': { bg: '#e9dcc9', fg: '#5d4e37' },
  'japanese-indigo': { bg: '#f0ece2', fg: '#264348' } };


const stylePresets = {
  graphic: { threshold: 128, edge: 3.0, smoothness: 30, detail: 50 },
  'vans-style': { threshold: 140, edge: 4.0, smoothness: 20, detail: 60 },
  'roche-style': { threshold: 120, edge: 2.5, smoothness: 40, detail: 45 },
  'rough-woodcut': { threshold: 130, edge: 5.0, smoothness: 10, detail: 30 } };


let scale = 1;
let dx = 0;
let dy = 0;
let isDragging = false;
let lastX, lastY;

let offscreenCanvas = document.createElement('canvas');
let offscreenCtx = offscreenCanvas.getContext('2d');

const debouncedUpdate = debounce(() => {
  scheduleAsyncUpdate(true);
}, 100);

function immediateUpdate(recomputeMask = true) {
  scheduleAsyncUpdate(recomputeMask);
}

function scheduleAsyncUpdate(recomputeMask) {
  if (!originalImageData) return;
  showLoading();
  requestAnimationFrame(() => {
    setTimeout(() => {
      applyWoodcutEffect(recomputeMask);
      hideLoading();
    }, 0);
  });
}

function showLoading() {if (loadingOverlay) loadingOverlay.classList.remove('hidden');}
function hideLoading() {if (loadingOverlay) loadingOverlay.classList.add('hidden');}

// ==========================================
// 3. UI 逻辑
// ==========================================

function updateUIValues() {
  if (thresholdSlider) thresholdValue.textContent = thresholdSlider.value;
  if (edgeSlider) edgeValue.textContent = edgeSlider.value;
  if (smoothnessSlider) smoothnessValue.textContent = smoothnessSlider.value;
  if (detailSlider) detailValue.textContent = detailSlider.value;
}

function updateCustomPickerVisuals() {
  if (backgroundColorInput && bgDisplay) bgDisplay.style.backgroundColor = backgroundColorInput.value;
  if (foregroundColorInput && fgDisplay) fgDisplay.style.backgroundColor = foregroundColorInput.value;
}

function updateCanvasBackground() {
  if (canvasStage) canvasStage.style.backgroundColor = selectedBgColor;
}

function calculateFitScale() {
  if (!offscreenCanvas.width || !offscreenCanvas.height) return 1;
  const imageW = offscreenCanvas.width;
  const imageH = offscreenCanvas.height;
  const canvasW = canvasStage.clientWidth;
  const canvasH = canvasStage.clientHeight;
  return Math.min(canvasW / imageW, canvasH / imageH);
}

function updateCanvasRatio() {
  if (!canvasStage) return;
  const ratio = currentAspectRatio;
  if (ratio === '4:3') {
    canvasStage.style.aspectRatio = '4 / 3';
    canvasStage.style.maxHeight = '65vh';
    canvasStage.style.maxWidth = 'calc(65vh * 1.333)';
  } else if (ratio === '1:1') {
    canvasStage.style.aspectRatio = '1 / 1';
    canvasStage.style.maxHeight = '80vh';
    canvasStage.style.maxWidth = '80vh';
  } else {
    canvasStage.style.aspectRatio = '3 / 4';
    canvasStage.style.maxHeight = '90vh';
    canvasStage.style.maxWidth = 'calc(90vh * 0.75)';
  }
  if (originalImageData) {
    scale = calculateFitScale();
    dx = 0;dy = 0;
  }
  updateDisplay();
}

function resetParametersToDefault() {
  selectedBgColor = DEFAULT_BG;
  selectedFgColor = DEFAULT_FG;
  if (colorPaletteSelect) colorPaletteSelect.value = DEFAULT_PALETTE;
  if (stylePresetSelect) stylePresetSelect.value = DEFAULT_STYLE;

  const defaultPreset = stylePresets[DEFAULT_STYLE];
  if (defaultPreset) {
    thresholdSlider.value = defaultPreset.threshold;
    edgeSlider.value = defaultPreset.edge;
    smoothnessSlider.value = defaultPreset.smoothness;
    detailSlider.value = defaultPreset.detail;
  }
  if (backgroundColorInput) backgroundColorInput.value = DEFAULT_BG;
  if (foregroundColorInput) foregroundColorInput.value = DEFAULT_FG;
  updateUIValues();
  updateCustomPickerVisuals();
  updateCanvasBackground();
}

// 事件监听
if (uploadArea) {
  uploadArea.addEventListener('click', () => {if (imageUpload) imageUpload.click();});
  uploadArea.addEventListener('dragover', e => {e.preventDefault();uploadArea.classList.add('dragover');});
  // [修复] 修正了这里的语法错误
  uploadArea.addEventListener('dragleave', () => {uploadArea.classList.remove('dragover');});
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();uploadArea.classList.remove('dragover');
    handleFile(e.dataTransfer.files && e.dataTransfer.files[0]);
  });
}
if (imageUpload) {
  imageUpload.addEventListener('change', e => handleFile(e.target.files && e.target.files[0]));
}

function handleFile(file) {
  if (file && file.type.startsWith('image/')) {
    if (imageUpload) imageUpload.value = '';
    const reader = new FileReader();
    reader.onload = event => {
      const img = new Image();
      img.onload = () => {
        contentImg.src = event.target.result;
        contentImg.style.display = 'block';
        uploadPlaceholder.style.display = 'none';
        uploadArea.classList.remove('empty');
        resetParametersToDefault();
        processImage(img);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }
}

document.querySelectorAll('.ratio-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentAspectRatio = btn.dataset.ratio;
    updateCanvasRatio();
  });
});

if (colorPaletteSelect) {
  colorPaletteSelect.addEventListener('change', e => {
    const palette = colorPalettes[e.target.value];
    if (palette) {
      selectedBgColor = palette.bg;
      selectedFgColor = palette.fg;
      updateCanvasBackground();
      immediateUpdate(false);
    }
  });
}

if (stylePresetSelect) {
  stylePresetSelect.addEventListener('change', e => {
    const preset = stylePresets[e.target.value];
    if (preset) {
      thresholdSlider.value = preset.threshold;
      edgeSlider.value = preset.edge;
      smoothnessSlider.value = preset.smoothness;
      detailSlider.value = preset.detail;
      updateUIValues();
      immediateUpdate(true);
    }
  });
}

document.querySelectorAll('.color-swatch').forEach(swatch => {
  swatch.addEventListener('click', e => {
    e.stopPropagation();
    const color = swatch.getAttribute('data-color');
    const target = swatch.getAttribute('data-for');
    if (!color || !target) return;
    if (target === 'bg') {
      selectedBgColor = color;
      updateCanvasBackground();
    } else if (target === 'fg') {
      selectedFgColor = color;
    }
    immediateUpdate(false);
  });
});

if (backgroundColorInput) {
  backgroundColorInput.addEventListener('input', e => {
    selectedBgColor = e.target.value;
    updateCustomPickerVisuals();
    updateCanvasBackground();
    debouncedUpdate();
  });
}
if (foregroundColorInput) {
  foregroundColorInput.addEventListener('input', e => {
    selectedFgColor = e.target.value;
    updateCustomPickerVisuals();
    debouncedUpdate();
  });
}

[thresholdSlider, edgeSlider, smoothnessSlider, detailSlider].forEach(slider => {
  if (slider) {
    slider.addEventListener('input', () => {
      updateUIValues();
      debouncedUpdate();
    });
  }
});

if (resetSettingsButton) {
  resetSettingsButton.addEventListener('click', () => {
    const currentRatio = currentAspectRatio;
    resetParametersToDefault();
    currentAspectRatio = currentRatio;
    document.querySelectorAll('.ratio-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.ratio === currentRatio);
    });
    updateCanvasRatio();

    originalImageData = null;maskData = null;precomputedNoiseMap = null;
    contentImg.src = '';contentImg.style.display = 'none';
    uploadPlaceholder.style.display = 'flex';uploadArea.classList.add('empty');
    const ctx = styledCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, styledCanvas.width, styledCanvas.height);
    offscreenCanvas.width = 0;offscreenCanvas.height = 0;
    updateCanvasBackground();
    scale = 1;dx = 0;dy = 0;
  });
}

// ==========================================
// 4. 核心图像处理
// ==========================================

function processImage(img) {
  showLoading();
  setTimeout(() => {
    let previewWidth = img.width;
    let previewHeight = img.height;

    if (img.width > MAX_PREVIEW_DIM || img.height > MAX_PREVIEW_DIM) {
      const ratio = img.width / img.height;
      if (ratio > 1) {
        previewWidth = MAX_PREVIEW_DIM;
        previewHeight = Math.round(img.height * MAX_PREVIEW_DIM / img.width);
      } else {
        previewHeight = MAX_PREVIEW_DIM;
        previewWidth = Math.round(img.width * MAX_PREVIEW_DIM / img.height);
      }
    }

    const ctx = originalCanvas.getContext('2d');
    if (!ctx) return;
    originalCanvas.width = previewWidth;
    originalCanvas.height = previewHeight;
    ctx.drawImage(img, 0, 0, previewWidth, previewHeight);
    originalImageData = ctx.getImageData(0, 0, previewWidth, previewHeight);

    generateNoiseMap(previewWidth, previewHeight);

    maskData = null;dx = 0;dy = 0;

    applyWoodcutEffect(true);
    scale = calculateFitScale();
    updateDisplay();
    hideLoading();
  }, 50);
}

function generateNoiseMap(w, h) {
  precomputedNoiseMap = new Float32Array(w * h);
  const scale = 0.1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      precomputedNoiseMap[y * w + x] = (Noise2D(x * scale, y * scale) + 1) / 2;
    }
  }
}

function applyWoodcutEffect(recomputeMask = true) {
  if (!originalImageData) return;

  const width = originalImageData.width;
  const height = originalImageData.height;

  if (recomputeMask || !maskData) {
    const threshold = parseInt(thresholdSlider.value, 10);
    const edgeStrength = parseFloat(edgeSlider.value);
    const smoothness = parseInt(smoothnessSlider.value, 10);
    const detailLevel = parseInt(detailSlider.value, 10);

    let processedData = applyGaussianBlur(originalImageData.data, width, height, Math.floor(smoothness / 10));
    processedData = applySobel(processedData, width, height, edgeStrength);
    processedData = applyAdaptiveThreshold(processedData, width, height, threshold, detailLevel);
    processedData = applyMorphology(processedData, width, height, 'open', 1);
    maskData = processedData;
  }

  if (!maskData) return;

  const fgRgb = hexToRgb(selectedFgColor);
  offscreenCanvas.width = width;
  offscreenCanvas.height = height;
  const outputData = offscreenCtx.createImageData(width, height);

  const isRoughStyle = stylePresetSelect.value === 'rough-woodcut';
  const inkFactor = 0.05;
  const useNoiseMap = isRoughStyle && precomputedNoiseMap && precomputedNoiseMap.length === width * height;

  for (let i = 0; i < maskData.length; i += 4) {
    const isMaskBlack = maskData[i] < 128;
    let isInk = false;

    if (isRoughStyle) {
      let woodcutNoise;
      if (useNoiseMap) {
        woodcutNoise = precomputedNoiseMap[i / 4];
      } else {
        woodcutNoise = Math.random();
      }
      if (isMaskBlack) {
        if (Math.random() > inkFactor * 0.5) isInk = true;
        if (woodcutNoise > 0.85 && Math.random() < 0.3) isInk = false;
      } else {
        if (woodcutNoise > 0.92 && Math.random() < 0.1) isInk = true;
      }
    } else {
      if (isMaskBlack) isInk = true;
    }

    if (isInk) {
      outputData.data[i] = fgRgb.r;
      outputData.data[i + 1] = fgRgb.g;
      outputData.data[i + 2] = fgRgb.b;
      outputData.data[i + 3] = 255;
    } else {
      outputData.data[i] = 0;
      outputData.data[i + 1] = 0;
      outputData.data[i + 2] = 0;
      outputData.data[i + 3] = 0;
    }
  }
  offscreenCtx.putImageData(outputData, 0, 0);
  updateDisplay();
}

function updateDisplay() {
  if (!styledCanvas) return;
  const w = canvasStage.clientWidth;
  const h = canvasStage.clientHeight;
  styledCanvas.width = w;
  styledCanvas.height = h;
  const ctx = styledCanvas.getContext('2d');

  ctx.imageSmoothingEnabled = false;

  ctx.clearRect(0, 0, w, h);
  if (!offscreenCanvas.width) return;

  ctx.save();
  ctx.translate(w / 2 + dx, h / 2 + dy);
  ctx.scale(scale, scale);
  ctx.translate(-offscreenCanvas.width / 2, -offscreenCanvas.height / 2);
  ctx.drawImage(offscreenCanvas, 0, 0);
  ctx.restore();
}

// ==========================================
// 5. 图像算法库
// ==========================================
function applyGaussianBlur(data, w, h, r) {
  if (r < 1) return new Uint8ClampedArray(data);
  const output = new Uint8ClampedArray(data.length);
  const size = r * 2 + 1;
  const kernel = new Float32Array(size);
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - r;
    kernel[i] = Math.exp(-(x * x) / (2 * r * r));
    sum += kernel[i];
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;
  const temp = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let tr = 0,tg = 0,tb = 0;
      for (let k = -r; k <= r; k++) {
        const px = Math.min(w - 1, Math.max(0, x + k));
        const idx = (y * w + px) * 4;
        const weight = kernel[k + r];
        tr += data[idx] * weight;tg += data[idx + 1] * weight;tb += data[idx + 2] * weight;
      }
      const i = (y * w + x) * 4;
      temp[i] = tr;temp[i + 1] = tg;temp[i + 2] = tb;temp[i + 3] = data[i + 3];
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let tr = 0,tg = 0,tb = 0;
      for (let k = -r; k <= r; k++) {
        const py = Math.min(h - 1, Math.max(0, y + k));
        const idx = (py * w + x) * 4;
        const weight = kernel[k + r];
        tr += temp[idx] * weight;tg += temp[idx + 1] * weight;tb += temp[idx + 2] * weight;
      }
      const i = (y * w + x) * 4;
      output[i] = tr;output[i + 1] = tg;output[i + 2] = tb;output[i + 3] = temp[i + 3];
    }
  }
  return output;
}

function applySobel(data, w, h, str) {
  const output = new Uint8ClampedArray(data.length);
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let px = 0,py = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * w + (x + kx)) * 4;
          const val = data[idx] * 0.3 + data[idx + 1] * 0.59 + data[idx + 2] * 0.11;
          const k = (ky + 1) * 3 + (kx + 1);
          px += gx[k] * val;py += gy[k] * val;
        }
      }
      let edge = Math.sqrt(px * px + py * py) * str;
      edge = Math.min(255, Math.max(0, edge));
      const val = edge > 80 ? 255 : 0;
      const i = (y * w + x) * 4;
      output[i] = output[i + 1] = output[i + 2] = val;output[i + 3] = data[i + 3];
    }
  }
  return output;
}

function applyAdaptiveThreshold(data, w, h, thresh, detail) {
  const output = new Uint8ClampedArray(data.length);
  let nDetail = detail > 10 ? Math.ceil(detail / 20) : detail;
  nDetail = Math.max(1, Math.min(5, nDetail));
  const blockSize = Math.max(3, 7 - nDetail);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0,count = 0;
      for (let ky = -blockSize; ky <= blockSize; ky++) {
        for (let kx = -blockSize; kx <= blockSize; kx++) {
          const px = Math.min(w - 1, Math.max(0, x + kx));
          const py = Math.min(h - 1, Math.max(0, y + ky));
          const idx = (py * w + px) * 4;
          sum += data[idx] * 0.3 + data[idx + 1] * 0.59 + data[idx + 2] * 0.11;
          count++;
        }
      }
      const mean = sum / count;
      const localTh = mean * (thresh / 128);
      const idx = (y * w + x) * 4;
      const lum = data[idx] * 0.3 + data[idx + 1] * 0.59 + data[idx + 2] * 0.11;
      const val = lum >= localTh * 0.9 ? 255 : 0;
      output[idx] = output[idx + 1] = output[idx + 2] = val;output[idx + 3] = data[idx + 3];
    }
  }
  return output;
}

function applyMorphology(data, w, h, op, size) {
  const process = (inp, mode) => {
    const out = new Uint8ClampedArray(inp.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let val = mode === 'erode' ? 255 : 0;
        for (let ky = -size; ky <= size; ky++) {
          for (let kx = -size; kx <= size; kx++) {
            const px = Math.min(w - 1, Math.max(0, x + kx));
            const py = Math.min(h - 1, Math.max(0, y + ky));
            const v = inp[(py * w + px) * 4];
            if (mode === 'erode') val = Math.min(val, v);else val = Math.max(val, v);
          }
        }
        const i = (y * w + x) * 4;
        out[i] = out[i + 1] = out[i + 2] = val;out[i + 3] = inp[i + 3];
      }
    }
    return out;
  };
  if (op === 'open') return process(process(data, 'erode'), 'dilate');
  if (op === 'close') return process(process(data, 'dilate'), 'erode');
  return data;
}

// ==========================================
// 6. 导出逻辑
// ==========================================

function exportRasterImage(type, filename) {
  if (!offscreenCanvas || offscreenCanvas.width === 0) return alert('请先上传图片');

  const ratioParts = currentAspectRatio.split(':');
  const aspect = parseInt(ratioParts[0]) / parseInt(ratioParts[1]);
  let eW, eH;
  if (aspect >= 1) {eW = MAX_EXPORT_DIM;eH = Math.round(eW / aspect);} else
  {eH = MAX_EXPORT_DIM;eW = Math.round(eH * aspect);}

  const cvs = document.createElement('canvas');
  cvs.width = eW;cvs.height = eH;
  const ctx = cvs.getContext('2d');

  if (type === 'image/jpeg') {
    ctx.fillStyle = selectedBgColor;
    ctx.fillRect(0, 0, eW, eH);
  }
  ctx.imageSmoothingEnabled = false;

  const fit = Math.min(eW / offscreenCanvas.width, eH / offscreenCanvas.height);
  const dw = offscreenCanvas.width * fit;
  const dh = offscreenCanvas.height * fit;
  const dx = (eW - dw) / 2;
  const dy = (eH - dh) / 2;

  ctx.drawImage(offscreenCanvas, dx, dy, dw, dh);

  const link = document.createElement('a');
  link.download = filename;
  link.href = cvs.toDataURL(type, 0.95);
  link.click();
}

if (downloadPngButton) downloadPngButton.addEventListener('click', () => exportRasterImage('image/png', 'woodcut.png'));
if (downloadJpgButton) downloadJpgButton.addEventListener('click', () => exportRasterImage('image/jpeg', 'woodcut.jpg'));

function traceBitmapToSVGPath(maskData, width, height) {
  const w = width;const h = height;
  const grid = new Uint8Array(w * h);
  const imgData = offscreenCtx.getImageData(0, 0, w, h).data;
  for (let i = 0; i < imgData.length; i += 4) {
    grid[i / 4] = imgData[i + 3] > 128 ? 1 : 0;
  }
  const getVal = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return 0;
    return grid[y * w + x];
  };
  const visitedVertical = new Uint8Array((w + 1) * h);
  let pathString = "";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x <= w; x++) {
      const pLeft = getVal(x - 1, y);
      const pRight = getVal(x, y);
      if (pLeft !== pRight && !visitedVertical[y * (w + 1) + x]) {
        let currX = x,currY = y;
        let dx = 0;let dy = pLeft === 1 ? -1 : 1;
        const startX = currX,startY = currY;
        let points = [{ x: currX, y: currY }];
        if (dx === 0) {
          const markY = dy === 1 ? currY : currY - 1;
          if (markY >= 0 && markY < h) visitedVertical[markY * (w + 1) + currX] = 1;
        }
        let loopSafe = 0;const maxLoops = w * h * 4;
        let lastDx = dx;let lastDy = dy;
        do {
          const tryDirs = [{ dx: dy, dy: -dx }, { dx: dx, dy: dy }, { dx: -dy, dy: dx }];
          let moveFound = false;
          for (let d of tryDirs) {
            let l, r;
            if (d.dx === 1) {l = getVal(currX, currY - 1);r = getVal(currX, currY);} else
            if (d.dx === -1) {l = getVal(currX - 1, currY);r = getVal(currX - 1, currY - 1);} else
            if (d.dy === 1) {l = getVal(currX, currY);r = getVal(currX - 1, currY);} else
            {l = getVal(currX - 1, currY - 1);r = getVal(currX, currY - 1);}
            if (l === 1 && r === 0) {dx = d.dx;dy = d.dy;moveFound = true;break;}
          }
          if (!moveFound) {dx = -dx;dy = -dy;}
          currX += dx;currY += dy;
          if (dx === lastDx && dy === lastDy) {points[points.length - 1].x = currX;points[points.length - 1].y = currY;} else
          {points.push({ x: currX, y: currY });}
          lastDx = dx;lastDy = dy;
          if (dx === 0) {
            const vy = dy === 1 ? currY - 1 : currY;
            if (currX >= 0 && currX <= w && vy >= 0 && vy < h) visitedVertical[vy * (w + 1) + currX] = 1;
          }
          loopSafe++;
        } while ((currX !== startX || currY !== startY) && loopSafe < maxLoops);
        if (points.length > 0) {
          pathString += `M${points[0].x},${points[0].y} `;
          for (let i = 1; i < points.length; i++) {
            pathString += `L${points[i].x},${points[i].y} `;
          }
          pathString += "Z ";
        }
      }
    }
  }
  return pathString;
}

if (downloadSvgButton) {
  downloadSvgButton.addEventListener('click', () => {
    if (!maskData || !originalImageData) return alert('请先上传图片');
    showLoading();
    setTimeout(() => {
      const w = originalImageData.width;
      const h = originalImageData.height;
      const pathData = traceBitmapToSVGPath(maskData, w, h);

      const ratioParts = currentAspectRatio.split(':');
      const aspect = parseInt(ratioParts[0]) / parseInt(ratioParts[1]);
      let eW, eH;
      if (aspect >= 1) {eW = MAX_EXPORT_DIM;eH = Math.round(eW / aspect);} else
      {eH = MAX_EXPORT_DIM;eW = Math.round(eH * aspect);}

      const fitScale = Math.min(eW / w, eH / h);
      const tx = (eW - w * fitScale) / 2;
      const ty = (eH - h * fitScale) / 2;
      const svg = `
<svg width="${eW}" height="${eH}" viewBox="0 0 ${eW} ${eH}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
    <rect width="100%" height="100%" fill="${selectedBgColor}" />
    <g transform="translate(${tx}, ${ty}) scale(${fitScale})">
        <path d="${pathData}" fill="${selectedFgColor}" fill-rule="evenodd"/>
    </g>
</svg>`;
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;a.download = 'woodcut.svg';
      a.click();
      URL.revokeObjectURL(url);
      hideLoading();
    }, 50);
  });
}

// Init
updateUIValues();
updateCustomPickerVisuals();
updateCanvasBackground();
initializeStylePresets();

function initializeStylePresets() {
  if (!stylePresetSelect) return;
  stylePresetSelect.innerHTML = '';
  const names = { graphic: '图形风格', 'vans-style': 'VANS风格', 'roche-style': 'Roche风格', 'rough-woodcut': '粗糙木刻(纹理)' };
  for (const key in stylePresets) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = names[key] || key;
    stylePresetSelect.appendChild(opt);
  }
  stylePresetSelect.value = DEFAULT_STYLE;
}

// [修复] 画布拖拽监听放在最后，确保变量已初始化
if (canvasStage) {
  canvasStage.addEventListener('mousedown', e => {
    // 关键：防止图片拖动干扰
    e.preventDefault();
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvasStage.style.cursor = 'grabbing';
  });
  canvasStage.addEventListener('mousemove', e => {
    if (isDragging) {
      dx += e.clientX - lastX;
      dy += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      updateDisplay();
    }
  });
  canvasStage.addEventListener('mouseup', () => {isDragging = false;canvasStage.style.cursor = 'grab';});
  canvasStage.addEventListener('mouseleave', () => {isDragging = false;canvasStage.style.cursor = 'grab';});
}
window.addEventListener('resize', updateDisplay);