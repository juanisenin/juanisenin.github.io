// ── Datos ────────────────────────────────────────────────────────────────────
let SAT_DATA = [];
const MAX_TOTAL = 13890;
const YEAR_MIN  = 1958;
const YEAR_MAX  = 2025;

fetch('data.json')
  .then(r => r.json())
  .then(d => { SAT_DATA = d; })
  .catch(e => console.error('data.json no encontrado', e));

// ── Estado global ─────────────────────────────────────────────────────────────
let stream        = null;
let colorSamples  = [];   // { h, s, l }
let earthCircle   = null; // { cx, cy, r } en coordenadas del canvas de calibración
let circleDrawing = false;
let circleStart   = null;
let calStep       = 1;

// ── Pantallas ─────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANTALLA 1 — SETUP
// ═══════════════════════════════════════════════════════════════════════════════
async function initSetup() {
  const sel      = document.getElementById('camera-select');
  const btnStart = document.getElementById('btn-start');
  const errMsg   = document.getElementById('setup-error');

  // Limpiar listener anterior para evitar duplicados al volver desde main
  const freshBtn = btnStart.cloneNode(true);
  btnStart.parentNode.replaceChild(freshBtn, btnStart);
  const btn = document.getElementById('btn-start');

  try {
    // Pedir permiso de cámara para que navigator.mediaDevices.enumerateDevices
    // devuelva los labels correctos
    const tmpStream = await navigator.mediaDevices.getUserMedia({ video: true });
    tmpStream.getTracks().forEach(t => t.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(d => d.kind === 'videoinput');

    sel.innerHTML = cameras
      .map((c, i) => `<option value="${c.deviceId}">${c.label || 'Cámara ' + (i + 1)}</option>`)
      .join('');

    if (cameras.length > 0) btn.disabled = false;

  } catch (e) {
    errMsg.textContent = 'No se pudo acceder a la cámara. Revisa los permisos del navegador.';
  }

  btn.addEventListener('click', async () => {
    const deviceId = sel.value;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      showScreen('screen-calib');
      initCalib();
    } catch (e) {
      errMsg.textContent = 'No se pudo abrir la cámara seleccionada.';
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANTALLA 2 — CALIBRACIÓN
// ═══════════════════════════════════════════════════════════════════════════════
function initCalib() {
  const video  = document.getElementById('calib-video');
  const canvas = document.getElementById('calib-canvas');
  const ctx    = canvas.getContext('2d', { willReadFrequently: true });

  video.srcObject = stream;
  video.play();

  video.addEventListener('loadedmetadata', () => {
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    requestAnimationFrame(calibFrame);
  });

  function calibFrame() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (earthCircle) drawCircleOverlay(ctx, earthCircle, canvas.width, canvas.height);
    requestAnimationFrame(calibFrame);
  }

  // ── Paso 1: muestreo de color ─────────────────────────────────────────────
  canvas.addEventListener('click', e => {
    if (calStep !== 1) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = Math.round((e.clientX - rect.left)  * scaleX);
    const py = Math.round((e.clientY - rect.top)   * scaleY);

    const pixel = ctx.getImageData(px - 2, py - 2, 5, 5);
    const hsl   = avgPixelHSL(pixel.data);
    colorSamples.push(hsl);
    renderColorSamples();

    if (colorSamples.length >= 5) {
      document.getElementById('btn-next-step').disabled = false;
    }
  });

  document.getElementById('btn-next-step').addEventListener('click', () => {
    calStep = 2;
    document.getElementById('calib-step-1').classList.add('hidden');
    document.getElementById('calib-step-2').classList.remove('hidden');
    enableCircleDraw(canvas, ctx);
  });

  // ── Paso 2: definir círculo ───────────────────────────────────────────────
  document.getElementById('btn-reset-circle').addEventListener('click', () => {
    earthCircle = null;
    document.getElementById('circle-status').textContent = 'Sin definir';
    document.getElementById('btn-done-calib').disabled = true;
  });

  document.getElementById('btn-done-calib').addEventListener('click', () => {
    showScreen('screen-main');
    initMain();
  });
}

function enableCircleDraw(canvas, ctx) {
  canvas.addEventListener('mousedown', onCircleStart);
  canvas.addEventListener('mousemove', onCircleMove);
  canvas.addEventListener('mouseup',   onCircleEnd);

  // Touch
  canvas.addEventListener('touchstart', e => { e.preventDefault(); onCircleStart(touchToMouse(e, canvas)); }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); onCircleMove(touchToMouse(e, canvas));  }, { passive: false });
  canvas.addEventListener('touchend',   e => { e.preventDefault(); onCircleEnd(touchToMouse(e, canvas));   }, { passive: false });

  function toCanvas(e) {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY
    };
  }

  function onCircleStart(e) {
    circleDrawing = true;
    circleStart   = toCanvas(e);
  }

  function onCircleMove(e) {
    if (!circleDrawing) return;
    const cur = toCanvas(e);
    const r   = Math.hypot(cur.x - circleStart.x, cur.y - circleStart.y);
    earthCircle = { cx: circleStart.x, cy: circleStart.y, r };
  }

  function onCircleEnd(e) {
    if (!circleDrawing) return;
    circleDrawing = false;
    const cur = toCanvas(e);
    const r   = Math.hypot(cur.x - circleStart.x, cur.y - circleStart.y);
    if (r > 20) {
      earthCircle = { cx: circleStart.x, cy: circleStart.y, r };
      document.getElementById('circle-status').textContent =
        `Centro (${Math.round(circleStart.x)}, ${Math.round(circleStart.y)}) · Radio ${Math.round(r)}px`;
      document.getElementById('btn-done-calib').disabled = false;
    }
  }
}

function touchToMouse(e, canvas) {
  const rect  = canvas.getBoundingClientRect();
  const touch = e.touches[0] || e.changedTouches[0];
  return { clientX: touch.clientX, clientY: touch.clientY };
}

function drawCircleOverlay(ctx, circle, W, H) {
  // Oscurecer fuera del círculo
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(circle.cx, circle.cy, circle.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Borde del círculo
  ctx.save();
  ctx.beginPath();
  ctx.arc(circle.cx, circle.cy, circle.r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(79,142,247,0.9)';
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Punto central
  ctx.beginPath();
  ctx.arc(circle.cx, circle.cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(79,142,247,0.9)';
  ctx.fill();
  ctx.restore();
}

function renderColorSamples() {
  const container = document.getElementById('color-samples');
  const count     = document.getElementById('sample-count');

  container.innerHTML = colorSamples
    .map(({ h, s, l }, i) =>
      `<div class="color-swatch" style="background:hsl(${h},${s}%,${l}%)" data-i="${i}">
        <span class="swatch-x">✕</span>
      </div>`)
    .join('');

  container.querySelectorAll('.color-swatch').forEach(el => {
    el.addEventListener('click', () => {
      colorSamples.splice(Number(el.dataset.i), 1);
      renderColorSamples();
      document.getElementById('btn-next-step').disabled = colorSamples.length < 5;
    });
  });

  count.textContent = colorSamples.length;
}

// ── Utilidades de color ───────────────────────────────────────────────────────
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function avgPixelHSL(data) {
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]; count++;
  }
  if (count === 0) return { h: 0, s: 0, l: 50 };
  return rgbToHsl(rSum / count, gSum / count, bSum / count);
}

function getColorRange() {
  if (colorSamples.length === 0) return null;
  const hues = colorSamples.map(c => c.h);
  const sats = colorSamples.map(c => c.s);
  const lums = colorSamples.map(c => c.l);
  return {
    hMin: Math.min(...hues) - 18, hMax: Math.max(...hues) + 18,
    sMin: Math.min(...sats) - 22, sMax: Math.max(...sats) + 22,
    lMin: Math.min(...lums) - 22, lMax: Math.max(...lums) + 22,
  };
}

function matchesGrain(h, s, l, range) {
  // Manejo de hue circular (rojo cruza 0/360)
  let hMatch = h >= range.hMin && h <= range.hMax;
  if (!hMatch) {
    const hShifted = h < 180 ? h + 360 : h - 360;
    hMatch = hShifted >= range.hMin && hShifted <= range.hMax;
  }
  return hMatch && s >= range.sMin && s <= range.sMax && l >= range.lMin && l <= range.lMax;
}

// ── Mapeo cobertura → año ─────────────────────────────────────────────────────
function coverageToYearData(coveragePct) {
  if (SAT_DATA.length === 0) return null;
  // 80% o más → año más reciente (2025)
  if (coveragePct >= 80) return SAT_DATA[SAT_DATA.length - 1];
  // Escalar para que 80% equivalga al 100% del rango de datos
  const scaledPct = (coveragePct / 80) * 100;
  const targetCount = (scaledPct / 100) * MAX_TOTAL;
  let best = SAT_DATA[0];
  let bestDiff = Math.abs(best.total - targetCount);
  for (const d of SAT_DATA) {
    const diff = Math.abs(d.total - targetCount);
    if (diff < bestDiff) { bestDiff = diff; best = d; }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANTALLA 3 — VISTA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
function initMain() {
  const video  = document.getElementById('main-video');
  const canvas = document.getElementById('main-canvas');
  const ctx    = canvas.getContext('2d', { willReadFrequently: true });

  video.srcObject = stream;
  video.play();

  video.addEventListener('loadedmetadata', () => {
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    requestAnimationFrame(mainLoop);
  });

  const colorRange = getColorRange();
  let   lastYear   = null;
  let   prevCov    = 0;

  function mainLoop() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const coverage = analyzeFrame(ctx, canvas.width, canvas.height, colorRange);
    drawMainOverlay(ctx, canvas.width, canvas.height, coverage);

    const pct = Math.round(coverage * 100);
    if (Math.abs(pct - Math.round(prevCov * 100)) >= 1) {
      const yearData = coverageToYearData(pct);
      updateInfoPanel(pct, yearData);
      updateAudio(pct, yearData, lastYear);
      if (yearData) lastYear = yearData.year;
      prevCov = coverage;
    }

    requestAnimationFrame(mainLoop);
  }

  function resetToSetup() {
    stopAudio();
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    colorSamples = [];
    earthCircle  = null;
    calStep      = 1;
    lastAudioPct = -1;
    document.getElementById('calib-step-1').classList.remove('hidden');
    document.getElementById('calib-step-2').classList.add('hidden');
    document.getElementById('btn-next-step').disabled = true;
    document.getElementById('btn-done-calib').disabled = true;
    document.getElementById('circle-status').textContent = 'Sin definir';
    document.getElementById('btn-audio').textContent = '▶ Activar sonido';
    document.getElementById('btn-audio').classList.remove('active');
    audioOn = false;
    renderColorSamples();
    showScreen('screen-setup');
    initSetup();
  }

  document.getElementById('btn-recalib').addEventListener('click', () => {
    stopAudio();
    audioOn = false;
    document.getElementById('btn-audio').textContent = '▶ Activar sonido';
    document.getElementById('btn-audio').classList.remove('active');
    colorSamples = [];
    earthCircle  = null;
    calStep      = 1;
    lastAudioPct = -1;
    document.getElementById('calib-step-1').classList.remove('hidden');
    document.getElementById('calib-step-2').classList.add('hidden');
    document.getElementById('btn-next-step').disabled = true;
    document.getElementById('btn-done-calib').disabled = true;
    document.getElementById('circle-status').textContent = 'Sin definir';
    renderColorSamples();
    showScreen('screen-calib');
    initCalib();
  });

  document.getElementById('btn-restart').addEventListener('click', resetToSetup);
}

// ── Análisis de frame ─────────────────────────────────────────────────────────
function analyzeFrame(ctx, W, H, colorRange) {
  if (!earthCircle || !colorRange) return 0;

  const { cx, cy, r } = earthCircle;
  const scaleX = W / ctx.canvas.width;   // canvas coords = video coords here
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw <= 0 || bh <= 0) return 0;

  const imageData = ctx.getImageData(x0, y0, bw, bh);
  const data      = imageData.data;
  const r2        = r * r;
  let total = 0, grains = 0;

  for (let row = 0; row < bh; row++) {
    for (let col = 0; col < bw; col++) {
      const dx = (x0 + col) - cx;
      const dy = (y0 + row) - cy;
      if (dx * dx + dy * dy > r2) continue;
      total++;
      const idx = (row * bw + col) * 4;
      const { h, s, l } = rgbToHsl(data[idx], data[idx + 1], data[idx + 2]);
      if (matchesGrain(h, s, l, colorRange)) grains++;
    }
  }
  return total > 0 ? grains / total : 0;
}

// ── Overlay visual en el feed principal ──────────────────────────────────────
function drawMainOverlay(ctx, W, H, coverage) {
  if (!earthCircle) return;
  const { cx, cy, r } = earthCircle;

  // Círculo de la Tierra con borde según era
  const isStarlink = coverage > 0.32; // >2019 aprox
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = isStarlink ? 'rgba(224,92,42,0.85)' : 'rgba(79,142,247,0.85)';
  ctx.lineWidth   = 2.5;
  ctx.stroke();

  // Anillos de órbita decorativos
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * (1 + i * 0.18), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(79,142,247,${0.12 - i * 0.03})`;
    ctx.lineWidth   = 1;
    ctx.stroke();
  }
  ctx.restore();

}

// ── Panel de información ──────────────────────────────────────────────────────
function updateInfoPanel(pct, d) {
  if (!d) return;

  document.getElementById('info-year').textContent    = d.year;
  document.getElementById('info-total').textContent   = d.total.toLocaleString('es-CL');
  document.getElementById('bk-gov').textContent        = d.gov.toLocaleString('es-CL');
  document.getElementById('bk-gnss').textContent       = d.gnss.toLocaleString('es-CL');
  document.getElementById('bk-commercial').textContent = d.commercial.toLocaleString('es-CL');
  document.getElementById('bk-starlink').textContent   = d.starlink.toLocaleString('es-CL');

  // Timeline
  const progress = (d.year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN) * 100;
  document.getElementById('timeline-fill').style.width    = progress + '%';
  document.getElementById('timeline-marker').style.left   = progress + '%';

  // Era Starlink
  const panel = document.getElementById('screen-main');
  if (d.year >= 2019 && d.starlink > 0) {
    panel.classList.add('starlink-era');
  } else {
    panel.classList.remove('starlink-era');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SONIFICACIÓN  (distinta a entrega 2)
// ─────────────────────────────────────────────────────────────────────────────
// Entrega 2 usó: beeps periódicos por categoría + ruido filtrado + música MP3
// Entrega 3 usa: drone polifónico que evoluciona por era + crackle de radio
//               + sonidos de evento (lanzamiento / re-entrada)
// ═══════════════════════════════════════════════════════════════════════════════
let audioCtx      = null;
let audioOn       = false;

// Nodos persistentes
let droneGain     = null;
let crackleGain   = null;
let droneOscs     = [];   // 3 osciladores para el drone
let crackleNode   = null;
let crackleFilter = null;
let lfoNode       = null;
let lfoGain       = null;

// Valores actuales para evitar actualizaciones redundantes
let lastAudioPct  = -1;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // ── Drone: 3 osciladores en acorde ────────────────────────────────────────
  droneGain = audioCtx.createGain();
  droneGain.gain.value = 0;
  droneGain.connect(audioCtx.destination);

  // LFO suave para vibrato / movimiento orbital
  lfoNode = audioCtx.createOscillator();
  lfoNode.type = 'sine';
  lfoNode.frequency.value = 0.18;
  lfoGain = audioCtx.createGain();
  lfoGain.gain.value = 3;
  lfoNode.connect(lfoGain);
  lfoNode.start();

  const oscTypes = ['sine', 'triangle', 'sine'];
  const oscDetunes = [0, 7, -5];   // semitones de detune para crear armonía
  for (let i = 0; i < 3; i++) {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = oscTypes[i];
    osc.detune.value = oscDetunes[i] * 100;
    gain.gain.value  = i === 0 ? 0.5 : 0.25;
    lfoGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(droneGain);
    osc.start();
    droneOscs.push({ osc, gain });
  }

  // ── Crackle de radio: ruido blanco + filtro paso-banda ───────────────────
  const bufSize  = 4096;
  crackleNode    = audioCtx.createScriptProcessor(bufSize, 1, 1);
  crackleNode.onaudioprocess = e => {
    const out = e.outputBuffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      // Ruido con ráfagas esporádicas (crackle)
      out[i] = (Math.random() < 0.03)
        ? (Math.random() * 2 - 1) * 1.2
        : (Math.random() * 2 - 1) * 0.15;
    }
  };

  crackleFilter = audioCtx.createBiquadFilter();
  crackleFilter.type      = 'bandpass';
  crackleFilter.frequency.value = 1200;
  crackleFilter.Q.value   = 1.2;

  crackleGain = audioCtx.createGain();
  crackleGain.gain.value  = 0;

  crackleNode.connect(crackleFilter);
  crackleFilter.connect(crackleGain);
  crackleGain.connect(audioCtx.destination);
}

// Frecuencias base del drone por era
function droneFreqForYear(year) {
  if (year <= 1969) return 80;    // era espacial temprana — tono grave y solitario
  if (year <= 1990) return 100;
  if (year <= 2010) return 130;
  if (year <= 2018) return 160;
  return 200;                     // era Starlink — más tenso
}

// Tipo de acorde por era (detune en cents del segundo y tercer oscilador)
function droneDetuneForYear(year) {
  if (year <= 1990) return [700, -500];   // quinta + cuarta — consonante
  if (year <= 2015) return [500, -300];   // algo de tensión
  return [300, 100];                      // disonante, claustrofóbico
}

function updateAudio(pct, yearData, prevYear) {
  if (!audioOn || !audioCtx) return;
  if (pct === lastAudioPct) return;
  lastAudioPct = pct;

  const t    = audioCtx.currentTime;
  const frac = pct / 100;
  const year = yearData ? yearData.year : YEAR_MIN;

  // ── Drone ──────────────────────────────────────────────────────────────────
  const baseFreq   = droneFreqForYear(year);
  const detuneVals = droneDetuneForYear(year);
  const droneVol   = 0.08 + frac * 0.28;  // sube con la cobertura

  droneGain.gain.linearRampToValueAtTime(droneVol, t + 0.6);
  droneOscs[0].osc.frequency.linearRampToValueAtTime(baseFreq,              t + 1.2);
  droneOscs[1].osc.frequency.linearRampToValueAtTime(baseFreq * 1.5,        t + 1.2);
  droneOscs[2].osc.frequency.linearRampToValueAtTime(baseFreq * 0.75,       t + 1.2);
  droneOscs[1].osc.detune.linearRampToValueAtTime(detuneVals[0],            t + 1.2);
  droneOscs[2].osc.detune.linearRampToValueAtTime(detuneVals[1],            t + 1.2);

  // LFO más rápido con más satélites (órbitas más caóticas)
  lfoNode.frequency.linearRampToValueAtTime(0.12 + frac * 0.6, t + 1.0);

  // ── Crackle ────────────────────────────────────────────────────────────────
  const crackleVol  = frac < 0.05 ? 0 : 0.02 + frac * 0.35;
  const crackleFreq = 400 + frac * 4000;  // sube con la saturación del espectro
  crackleGain.gain.linearRampToValueAtTime(crackleVol, t + 0.4);
  crackleFilter.frequency.linearRampToValueAtTime(crackleFreq, t + 0.5);

  // ── Evento de cambio de año ───────────────────────────────────────────────
  if (yearData && prevYear !== null && yearData.year !== prevYear) {
    const yearDiff = yearData.year - prevYear;
    playYearEvent(yearDiff > 0, yearData.year);
  }
}

function playYearEvent(goingForward, year) {
  if (!audioCtx || !audioOn) return;
  const t    = audioCtx.currentTime;
  const gain = audioCtx.createGain();
  const osc  = audioCtx.createOscillator();

  osc.type = 'sine';
  gain.connect(audioCtx.destination);
  osc.connect(gain);

  if (goingForward) {
    // Lanzamiento: tono ascendente corto
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(640, t + 0.12);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  } else {
    // Re-entrada: tono descendente
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.18);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  }

  osc.start(t);
  osc.stop(t + 0.3);
  osc.onended = () => { try { gain.disconnect(); } catch (_) {} };
}

function stopAudio() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  droneGain  && droneGain.gain.linearRampToValueAtTime(0, t + 0.5);
  crackleGain && crackleGain.gain.linearRampToValueAtTime(0, t + 0.3);
}

// ── Botón de audio ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-audio').addEventListener('click', () => {
    const btn = document.getElementById('btn-audio');
    if (!audioOn) {
      initAudio();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      audioOn = true;
      btn.textContent = '⏸ Desactivar sonido';
      btn.classList.add('active');
      lastAudioPct = -1; // forzar actualización en el próximo frame
    } else {
      audioOn = false;
      stopAudio();
      btn.textContent = '▶ Activar sonido';
      btn.classList.remove('active');
    }
  });

  initSetup();
});
