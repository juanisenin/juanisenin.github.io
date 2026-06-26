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
let calibAC       = null; // AbortController para limpiar listeners de calibración

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
  // Cancelar listeners de una calibración previa para evitar duplicados
  if (calibAC) calibAC.abort();
  calibAC = new AbortController();
  const { signal } = calibAC;

  const video  = document.getElementById('calib-video');
  const canvas = document.getElementById('calib-canvas');
  const ctx    = canvas.getContext('2d', { willReadFrequently: true });

  video.srcObject = stream;
  video.play();

  let loopStarted = false;
  function startLoop() {
    if (loopStarted || signal.aborted) return;
    loopStarted = true;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    requestAnimationFrame(calibFrame);
  }

  video.addEventListener('loadedmetadata', startLoop, { signal });
  if (video.readyState >= 1) startLoop();

  function calibFrame() {
    if (signal.aborted) return;
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
  }, { signal });

  document.getElementById('btn-next-step').addEventListener('click', () => {
    calStep = 2;
    document.getElementById('calib-step-1').classList.add('hidden');
    document.getElementById('calib-step-2').classList.remove('hidden');
    enableCircleDraw(canvas, ctx, signal);
  }, { signal });

  // ── Paso 2: definir círculo ───────────────────────────────────────────────
  document.getElementById('btn-reset-circle').addEventListener('click', () => {
    earthCircle = null;
    document.getElementById('circle-status').textContent = 'Sin definir';
    document.getElementById('btn-done-calib').disabled = true;
  }, { signal });

  document.getElementById('btn-done-calib').addEventListener('click', () => {
    showScreen('screen-main');
    initMain();
  }, { signal });
}

function enableCircleDraw(canvas, ctx, signal) {
  canvas.addEventListener('mousedown', onCircleStart, { signal });
  canvas.addEventListener('mousemove', onCircleMove,  { signal });
  canvas.addEventListener('mouseup',   onCircleEnd,   { signal });

  // Touch
  canvas.addEventListener('touchstart', e => { e.preventDefault(); onCircleStart(touchToMouse(e, canvas)); }, { passive: false, signal });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); onCircleMove(touchToMouse(e, canvas));  }, { passive: false, signal });
  canvas.addEventListener('touchend',   e => { e.preventDefault(); onCircleEnd(touchToMouse(e, canvas));   }, { passive: false, signal });

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

// Tolerancias del rango de color. Más ajustadas que antes para no abarcar
// sombras ni el fondo de la hoja.
const H_PAD   = 14;   // padding de tono
const S_PAD   = 16;   // padding de saturación
const L_PAD   = 14;   // padding de luminosidad
// Pisos/topes absolutos: las sombras son oscuras y poco saturadas (grises),
// así que exigimos un mínimo de saturación y de luz para descartarlas.
const S_FLOOR = 25;   // saturación mínima — descarta grises/sombras del fondo
const L_FLOOR = 22;   // luminosidad mínima — descarta zonas muy oscuras (sombras)
const L_CEIL  = 96;   // luminosidad máxima — descarta brillos/reflejos

function getColorRange() {
  if (colorSamples.length === 0) return null;
  const hues = colorSamples.map(c => c.h);
  const sats = colorSamples.map(c => c.s);
  const lums = colorSamples.map(c => c.l);
  return {
    hMin: Math.min(...hues) - H_PAD,
    hMax: Math.max(...hues) + H_PAD,
    sMin: Math.max(Math.min(...sats) - S_PAD, S_FLOOR),
    sMax: Math.min(Math.max(...sats) + S_PAD, 100),
    lMin: Math.max(Math.min(...lums) - L_PAD, L_FLOOR),
    lMax: Math.min(Math.max(...lums) + L_PAD, L_CEIL),
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
// VISUALIZACIÓN EMBEBIDA (gráfico + globo + leyenda de la Entrega 2)
// Controlada por visión por computador: el gráfico se revela solo hasta el año
// que representan las lentejas, y el globo muestra los satélites de ese año.
// ═══════════════════════════════════════════════════════════════════════════════
const VIZ_LEGEND = [
  { key: 'gov',        label: 'Gubernamentales / científicos', color: '#2171b5', shape: 'circle'   },
  { key: 'gnss',       label: 'GNSS / Navegación',             color: '#2aaa58', shape: 'diamond'  },
  { key: 'commercial', label: 'Constelaciones comerciales',    color: '#9b59b6', shape: 'triangle' },
  { key: 'starlink',   label: 'Starlink',                      color: '#e05c2a', shape: 'cross'    },
];

const vizActive        = new Set(['gov', 'gnss', 'commercial', 'starlink']);
let   vizState         = null;   // { revealTo, updateAreasLine } expuesto por el gráfico
let   vizEarthStarted  = false;  // el loop del globo arranca una sola vez
let   currentVizYearData = null;

function vizEarthData(d) {
  const f = {
    gov:        vizActive.has('gov')        ? d.gov        : 0,
    gnss:       vizActive.has('gnss')       ? d.gnss       : 0,
    commercial: vizActive.has('commercial') ? d.commercial : 0,
    starlink:   vizActive.has('starlink')   ? d.starlink   : 0,
  };
  f.total = f.gov + f.gnss + f.commercial + f.starlink;
  return f;
}

function initViz(data) {
  if (!data || !data.length || typeof d3 === 'undefined') return;
  buildVizChart(data);
  buildVizLegend();
  if (!vizEarthStarted) { initVizEarth(); vizEarthStarted = true; }
  if (currentVizYearData) vizSetYear(currentVizYearData);
}

// Llamada desde commit(): actualiza gráfico + globo al año detectado.
function vizSetYear(yearData) {
  if (!yearData) return;
  currentVizYearData = yearData;
  const inline = document.getElementById('viz-year-inline');
  if (inline) inline.textContent = yearData.year;
  if (vizState) vizState.revealTo(yearData.year);
  updateVizEarthDots(vizEarthData(yearData));
}

// ── Gráfico de áreas/línea con revelado por año ───────────────────────────────
function buildVizChart(data) {
  const margin = { top: 16, right: 24, bottom: 48, left: 56 };
  const el = document.getElementById('chart');
  const W  = el.clientWidth || 600;
  const H  = Math.round(W * 0.58);
  const w  = W - margin.left - margin.right;
  const h  = H - margin.top  - margin.bottom;

  d3.select('#chart').selectAll('*').remove();

  const svg = d3.select('#chart').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
  const g   = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain(d3.extent(data, d => d.year)).range([0, w]);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.total) * 1.05]).range([h, 0]);

  g.append('g').attr('class', 'grid')
    .call(d3.axisLeft(y).ticks(6).tickSize(-w).tickFormat(''));

  // Clip controlado por el año: revela el gráfico de izquierda a derecha.
  const clip = g.append('clipPath').attr('id', 'viz-reveal-clip').append('rect')
    .attr('x', 0).attr('y', 0).attr('height', h).attr('width', 0);

  const ORDER = ['gov', 'gnss', 'commercial', 'starlink'];
  const curve = d3.curveCatmullRom;

  const defs = svg.append('defs');
  const gradSpecs = [
    { id: 'viz-grad-gov',  color: '#2171b5', topOp: 0.55, botOp: 0.06 },
    { id: 'viz-grad-gnss', color: '#2aaa58', topOp: 0.60, botOp: 0.07 },
    { id: 'viz-grad-comm', color: '#9b59b6', topOp: 0.60, botOp: 0.07 },
    { id: 'viz-grad-sl',   color: '#e05c2a', topOp: 0.65, botOp: 0.07 },
  ];
  gradSpecs.forEach(({ id, color, topOp, botOp }) => {
    const grad = defs.append('linearGradient').attr('id', id)
      .attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1)
      .attr('gradientUnits', 'objectBoundingBox');
    grad.append('stop').attr('offset',   '0%').attr('stop-color', color).attr('stop-opacity', topOp);
    grad.append('stop').attr('offset', '100%').attr('stop-color', color).attr('stop-opacity', botOp);
  });
  const gradIds = { gov: 'viz-grad-gov', gnss: 'viz-grad-gnss', commercial: 'viz-grad-comm', starlink: 'viz-grad-sl' };

  function makeAreaFn(type) {
    return d3.area().x(d => x(d.year))
      .y0(d => { let cum = 0; for (const t of ORDER) { if (t === type) break; if (vizActive.has(t)) cum += d[t]; } return y(cum); })
      .y1(d => { let cum = 0; for (const t of ORDER) { if (t === type) break; if (vizActive.has(t)) cum += d[t]; } if (vizActive.has(type)) cum += d[type]; return y(cum); })
      .curve(curve);
  }
  function makeLineFn() {
    return d3.line().x(d => x(d.year))
      .y(d => { let t = 0; ORDER.forEach(k => { if (vizActive.has(k)) t += d[k]; }); return y(t); })
      .curve(curve);
  }

  const areaPaths = {};
  ORDER.forEach(type => {
    areaPaths[type] = g.append('path').datum(data)
      .attr('d', makeAreaFn(type)(data))
      .attr('fill', `url(#${gradIds[type]})`)
      .attr('clip-path', 'url(#viz-reveal-clip)');
  });

  const linePath = g.append('path').datum(data)
    .attr('class', 'line')
    .attr('d', makeLineFn()(data))
    .attr('clip-path', 'url(#viz-reveal-clip)');

  g.append('g').attr('class', 'axis').attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).tickFormat(d3.format('d')).ticks(10));
  g.append('g').attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => d >= 1000 ? d / 1000 + 'k' : d));

  g.append('text').attr('class', 'axis-label').attr('text-anchor', 'middle')
    .attr('x', w / 2).attr('y', h + 40).text('AÑO');
  g.append('text').attr('class', 'axis-label').attr('text-anchor', 'middle')
    .attr('transform', `translate(-42, ${h / 2}) rotate(-90)`).text('SATÉLITES');

  // Marcador del año actual.
  const cursor    = g.append('line').attr('class', 'viz-cursor').attr('y1', 0).attr('y2', h).style('opacity', 0);
  const cursorDot = g.append('circle').attr('class', 'viz-cursor-dot').attr('r', 5).style('opacity', 0);

  const minYear = data[0].year;

  function updateAreasLine() {
    ORDER.forEach(type => {
      areaPaths[type].attr('display', vizActive.has(type) ? null : 'none')
        .transition().duration(300).ease(d3.easeCubicInOut).attr('d', makeAreaFn(type)(data));
    });
    linePath.transition().duration(300).ease(d3.easeCubicInOut).attr('d', makeLineFn()(data));
  }

  function revealTo(year) {
    const px  = Math.max(0, x(year));
    const d   = data.find(r => r.year === year) || data[data.length - 1];
    const tot = vizEarthData(d).total;
    const show = year > minYear ? 1 : 0;

    clip.transition().duration(450).ease(d3.easeCubicOut).attr('width', px);
    cursor.style('opacity', show).transition().duration(450).ease(d3.easeCubicOut)
      .attr('x1', px).attr('x2', px);
    cursorDot.style('opacity', show).transition().duration(450).ease(d3.easeCubicOut)
      .attr('cx', px).attr('cy', y(tot));
  }

  vizState = { revealTo, updateAreasLine };
}

// ── Leyenda interactiva (toggle de categorías) ────────────────────────────────
function buildVizLegend() {
  const container = document.getElementById('legend');
  if (!container) return;
  container.innerHTML = '';

  const SHAPE_SVG = {
    circle:   c => `<circle cx="7" cy="7" r="6" fill="${c}"/>`,
    diamond:  c => `<polygon points="7,0 14,7 7,14 0,7" fill="${c}"/>`,
    triangle: c => `<polygon points="7,1 14,13 0,13" fill="${c}"/>`,
    cross:    c => `<rect x="0" y="5" width="14" height="4" fill="${c}"/><rect x="5" y="0" width="4" height="14" fill="${c}"/>`,
  };

  VIZ_LEGEND.forEach(({ key, label, color, shape }) => {
    const item = document.createElement('div');
    item.className = 'legend-item' + (vizActive.has(key) ? '' : ' inactive');
    item.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14">${SHAPE_SVG[shape](color)}</svg><span>${label}</span>`;
    item.addEventListener('click', () => {
      if (vizActive.has(key)) {
        if (vizActive.size === 1) return;       // siempre al menos una categoría
        vizActive.delete(key); item.classList.add('inactive');
      } else {
        vizActive.add(key); item.classList.remove('inactive');
      }
      if (vizState) vizState.updateAreasLine();
      if (currentVizYearData) {
        if (vizState) vizState.revealTo(currentVizYearData.year);
        updateVizEarthDots(vizEarthData(currentVizYearData));
        updateSound(currentVizYearData);
      }
    });
    container.appendChild(item);
  });
}

// ── Globo terráqueo con satélites orbitando ───────────────────────────────────
const EARTH_R    = 96;
const EARTH_SIZE = 340;

const MAX_GOV  = 5584;
const MAX_GNSS = 321;
const MAX_COMM = 1215;
const MAX_SL   = 6770;
const MAX_DOTS = MAX_GOV + MAX_GNSS + MAX_COMM + MAX_SL;

const GNSS_OFF = MAX_GOV;
const COMM_OFF = MAX_GOV + MAX_GNSS;
const SL_OFF   = MAX_GOV + MAX_GNSS + MAX_COMM;

const VIEW_RX = -0.38, VIEW_RY = 0.22;
const COS_RX = Math.cos(VIEW_RX), SIN_RX = Math.sin(VIEW_RX);
const COS_RY = Math.cos(VIEW_RY), SIN_RY = Math.sin(VIEW_RY);

const GOV_COLOR = [33, 113, 181], GNSS_COLOR = [42, 170, 88];
const COMMERCIAL_COLOR = [155, 89, 182], STARLINK_COLOR = [224, 92, 42];

function vizSrand(s) { const v = Math.sin(s + 1) * 10000; return v - Math.floor(v); }

const vizSatellites = Array.from({ length: MAX_DOTS }, (_, i) => ({
  lat:    Math.acos(2 * vizSrand(i * 7) - 1) - Math.PI / 2,
  lon:    vizSrand(i * 7 + 1) * Math.PI * 2,
  omega:  (vizSrand(i * 11) * 0.12 + 0.02) * (i % 2 ? 1 : -1),
  radius: EARTH_R * (1.30 + vizSrand(i * 13) * 0.38),
}));

let activeGov = 0, activeGnss = 0, activeCommercial = 0, activeStarlink = 0;

function updateVizEarthDots(d) {
  activeGov        = d.gov;
  activeGnss       = d.gnss;
  activeCommercial = d.commercial;
  activeStarlink   = d.starlink;
}

function vizProject(lat, lon, r, cx, cy) {
  const x0 = r * Math.cos(lat) * Math.cos(lon);
  const y0 = r * Math.sin(lat);
  const z0 = r * Math.cos(lat) * Math.sin(lon);
  const y1 = y0 * COS_RX - z0 * SIN_RX;
  const z1 = y0 * SIN_RX + z0 * COS_RX;
  const x2 = x0 * COS_RY + z1 * SIN_RY;
  const z2 = -x0 * SIN_RY + z1 * COS_RY;
  return { sx: cx + x2, sy: cy - y1, depth: z2 };
}

function initVizEarth() {
  const canvas = document.getElementById('earth');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = EARTH_SIZE * dpr;
  canvas.height = EARTH_SIZE * dpr;
  canvas.style.width  = EARTH_SIZE + 'px';
  canvas.style.height = EARTH_SIZE + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const cx = EARTH_SIZE / 2, cy = EARTH_SIZE / 2;
  const STEPS = 64;

  (function frame() {
    ctx.clearRect(0, 0, EARTH_SIZE, EARTH_SIZE);
    const t    = performance.now() / 1000;
    const gRot = t * 0.12;

    const projSat  = s => vizProject(s.lat, s.lon + s.omega * t, s.radius, cx, cy);
    const govDots  = vizSatellites.slice(0,        activeGov)                   .map(s => ({ ...projSat(s), cat: 0 }));
    const gnssDots = vizSatellites.slice(GNSS_OFF, GNSS_OFF + activeGnss)       .map(s => ({ ...projSat(s), cat: 1 }));
    const commDots = vizSatellites.slice(COMM_OFF, COMM_OFF + activeCommercial) .map(s => ({ ...projSat(s), cat: 2 }));
    const slDots   = vizSatellites.slice(SL_OFF,   SL_OFF   + activeStarlink)   .map(s => ({ ...projSat(s), cat: 3 }));
    const dots     = [...govDots, ...gnssDots, ...commDots, ...slDots];

    const behind = dots.filter(d => d.depth < 0);
    const front  = dots.filter(d => d.depth >= 0);

    function drawCircles(list, r, style) {
      ctx.beginPath();
      list.forEach(d => { ctx.moveTo(d.sx + r, d.sy); ctx.arc(d.sx, d.sy, r, 0, Math.PI * 2); });
      ctx.fillStyle = style; ctx.fill();
    }
    function drawDiamonds(list, style) {
      ctx.beginPath();
      list.forEach(d => { ctx.moveTo(d.sx, d.sy - 2.4); ctx.lineTo(d.sx + 2.4, d.sy); ctx.lineTo(d.sx, d.sy + 2.4); ctx.lineTo(d.sx - 2.4, d.sy); ctx.closePath(); });
      ctx.fillStyle = style; ctx.fill();
    }
    function drawTriangles(list, style) {
      ctx.beginPath();
      list.forEach(d => { ctx.moveTo(d.sx, d.sy - 2.5); ctx.lineTo(d.sx + 2.2, d.sy + 1.6); ctx.lineTo(d.sx - 2.2, d.sy + 1.6); ctx.closePath(); });
      ctx.fillStyle = style; ctx.fill();
    }
    function drawCrosses(list, style) {
      ctx.fillStyle = style;
      list.forEach(d => { ctx.fillRect(d.sx - 2.2, d.sy - 0.55, 4.4, 1.1); ctx.fillRect(d.sx - 0.55, d.sy - 2.2, 1.1, 4.4); });
    }

    const [gr, gg, gb] = GOV_COLOR, [nr, ng, nb] = GNSS_COLOR, [cr, cg, cb] = COMMERCIAL_COLOR, [sr, sg, sb] = STARLINK_COLOR;

    drawCircles  (behind.filter(d => d.cat === 0), 0.9, `rgba(${gr},${gg},${gb},0.25)`);
    drawDiamonds (behind.filter(d => d.cat === 1),      `rgba(${nr},${ng},${nb},0.25)`);
    drawTriangles(behind.filter(d => d.cat === 2),      `rgba(${cr},${cg},${cb},0.25)`);
    drawCrosses  (behind.filter(d => d.cat === 3),      `rgba(${sr},${sg},${sb},0.25)`);

    ctx.beginPath(); ctx.arc(cx, cy, EARTH_R, 0, Math.PI * 2); ctx.fillStyle = '#f5f6fa'; ctx.fill();

    ctx.lineWidth = 0.65; ctx.strokeStyle = 'rgba(58,63,92,0.55)';
    for (let latDeg = -75; latDeg <= 75; latDeg += 15) {
      const lat = latDeg * Math.PI / 180;
      ctx.beginPath(); let pen = false;
      for (let i = 0; i <= STEPS; i++) {
        const p = vizProject(lat, (i / STEPS) * Math.PI * 2 + gRot, EARTH_R, cx, cy);
        if (p.depth >= 0) { pen ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); pen = true; } else pen = false;
      }
      ctx.stroke();
    }
    for (let lonDeg = 0; lonDeg < 360; lonDeg += 15) {
      const lon = lonDeg * Math.PI / 180 + gRot;
      ctx.beginPath(); let pen = false;
      for (let i = 0; i <= STEPS; i++) {
        const p = vizProject(-Math.PI / 2 + (i / STEPS) * Math.PI, lon, EARTH_R, cx, cy);
        if (p.depth >= 0) { pen ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); pen = true; } else pen = false;
      }
      ctx.stroke();
    }

    ctx.beginPath(); ctx.arc(cx, cy, EARTH_R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(58,63,92,0.85)'; ctx.lineWidth = 1.4; ctx.stroke();

    drawCircles  (front.filter(d => d.cat === 0), 1.1, `rgba(${gr},${gg},${gb},0.88)`);
    drawDiamonds (front.filter(d => d.cat === 1),      `rgba(${nr},${ng},${nb},0.88)`);
    drawTriangles(front.filter(d => d.cat === 2),      `rgba(${cr},${cg},${cb},0.88)`);
    drawCrosses  (front.filter(d => d.cat === 3),      `rgba(${sr},${sg},${sb},0.88)`);

    if (activeGov >= 1) {
      const sp = govDots[0];
      ctx.beginPath(); ctx.arc(sp.sx, sp.sy, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${gr},${gg},${gb})`; ctx.fill();
    }

    requestAnimationFrame(frame);
  })();
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

  // Visualización de la Entrega 2 embebida (gráfico + globo + leyenda).
  if (SAT_DATA.length) {
    initViz(SAT_DATA);
  } else {
    fetch('data.json').then(r => r.json()).then(d => { SAT_DATA = d; initViz(d); }).catch(() => {});
  }

  const colorRange = getColorRange();
  let   lastYear   = null;

  // ── Estabilización temporal de la cobertura ────────────────────────────────
  // La cobertura cruda (% de píxeles del color) tiembla por ruido de cámara,
  // sombras y autoexposición. Para que el año solo cambie cuando realmente
  // cambia la cantidad de granos, suavizamos y exigimos que el nuevo valor se
  // sostenga antes de comprometerlo.
  const COV_WINDOW    = 15;   // frames para la mediana (descarta picos puntuales)
  const COV_EMA       = 0.15; // factor de suavizado exponencial (0–1, menor = más suave)
  const DEADBAND_PCT  = 2;    // cambio mínimo de % para considerar que se movió un grano
  const STABLE_FRAMES = 18;   // frames que el nuevo valor debe sostenerse antes de aplicar
  const CANDIDATE_TOL = 1;    // tolerancia de % para considerar "el mismo" candidato
  const COV_FLOOR     = 0.03; // piso de ruido: por debajo de este % se asume "sin granos"

  let covBuffer    = [];      // ventana de coberturas crudas
  let covSmooth    = null;    // valor suavizado (EMA sobre la mediana)
  let committedPct = null;    // % actualmente mostrado en pantalla
  let candidatePct = null;    // % candidato esperando confirmación
  let candidateRun = 0;       // frames que el candidato lleva estable

  function commit(pct) {
    committedPct = pct;
    candidatePct = pct;
    candidateRun = 0;
    const yearData = coverageToYearData(pct);
    updateInfoPanel(pct, yearData);
    updateSound(yearData);
    vizSetYear(yearData);
    currentPct      = pct;
    currentYearData = yearData;
    currentLastYear = lastYear;
    if (yearData) lastYear = yearData.year;
  }

  function mainLoop() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const coverage = analyzeFrame(ctx, canvas.width, canvas.height, colorRange);

    // 1) Mediana de una ventana corta — elimina spikes de un frame.
    covBuffer.push(coverage);
    if (covBuffer.length > COV_WINDOW) covBuffer.shift();
    const sorted = [...covBuffer].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // 2) Suavizado exponencial sobre la mediana — quita el jitter residual.
    covSmooth = covSmooth === null ? median : covSmooth + COV_EMA * (median - covSmooth);

    drawMainOverlay(ctx, canvas.width, canvas.height, covSmooth);

    // 3) Piso de ruido: descontamos la cobertura residual (sombras, ruido) y
    //    reescalamos, de modo que "sin granos" caiga a 0 (año 1958) y justo por
    //    encima del piso arranque suave en vez de saltar de golpe.
    const covEff = covSmooth <= COV_FLOOR ? 0 : (covSmooth - COV_FLOOR) / (1 - COV_FLOOR);
    const pct    = Math.round(covEff * 100);

    // 4) Histéresis + debounce: solo cambiamos el año cuando el valor suavizado
    //    se aparta del actual (zona muerta) Y se sostiene varios frames seguidos.
    if (committedPct === null) {
      commit(pct);
    } else if (Math.abs(pct - committedPct) >= DEADBAND_PCT) {
      if (candidatePct !== null && Math.abs(pct - candidatePct) <= CANDIDATE_TOL) {
        candidateRun++;
      } else {
        candidatePct = pct;
        candidateRun = 1;
      }
      if (candidateRun >= STABLE_FRAMES) commit(candidatePct);
    } else {
      // Dentro de la zona muerta: el valor sigue siendo el actual, descartamos
      // cualquier candidato a medio confirmar.
      candidatePct = committedPct;
      candidateRun = 0;
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
// SONIFICACIÓN — sistema portado de la Entrega 2
// Beeps por categoría (Sonido_Satelite.mp3) cuyo ritmo sube con la cantidad de
// satélites, música ambiente (Sonido_Ambiente.mp3) y un modo de ruido sintético.
// Aquí lo controla el año que sale de la visión por computador (no el mouse).
// ═══════════════════════════════════════════════════════════════════════════════
let audioCtx = null;
let audioOn  = false;

// Último estado comprometido (para re-sincronizar el audio al activarlo).
let currentPct      = 0;
let currentYearData = null;
let currentLastYear = null;
let lastAudioPct    = -1;   // usado por los handlers de recalibrar / volver

// Buffers de audio (MP3).
let satBuffer     = null;
let ambientBuffer = null;
let _audioStarted = false;

// Ambiente (música de fondo en loop).
let ambientGain    = null;
let _ambSrc        = null;
let ambientStarted = false;
let ambientEnabled = true;

// Modo de sonido: 'beeps' (por defecto) | 'noise' (ruido sintético filtrado).
let soundMode  = 'beeps';
let noiseNode  = null;
let filterNode = null;
let noiseGain  = null;

const SND_MIN_INTERVAL = 80;
const SND_MAX_INTERVAL = 2200;

// Una pista por categoría — distinto pitch para diferenciarlas al oído.
const SOUND_TYPES = {
  gov:        { pitch: 0.45, pitchVar: 0.04 },
  gnss:       { pitch: 0.85, pitchVar: 0.04 },
  commercial: { pitch: 1.45, pitchVar: 0.04 },
  starlink:   { pitch: 2.30, pitchVar: 0.04 },
};
const soundState = Object.fromEntries(
  Object.keys(SOUND_TYPES).map(k => [k, { timer: null, source: null, gain: null }])
);

function initAudio() {
  if (_audioStarted) return Promise.resolve();
  _audioStarted = true;
  return (async () => {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const [sa, aa] = await Promise.all([
        fetch('Sonido_Satelite.mp3').then(r => r.arrayBuffer()),
        fetch('Sonido_Ambiente.mp3').then(r => r.arrayBuffer()),
      ]);
      [satBuffer, ambientBuffer] = await Promise.all([
        audioCtx.decodeAudioData(sa),
        audioCtx.decodeAudioData(aa),
      ]);
    } catch (e) {
      console.error('Error al iniciar audio:', e);
      _audioStarted = false;
    }
  })();
}

function startAmbient() {
  if (ambientStarted || !ambientEnabled || !audioCtx) return;
  ambientStarted = true;
  if (ambientBuffer) {
    ambientGain = audioCtx.createGain();
    ambientGain.gain.value = 0.75;
    ambientGain.connect(audioCtx.destination);
    _ambSrc = audioCtx.createBufferSource();
    _ambSrc.buffer = ambientBuffer;
    _ambSrc.loop = true;
    _ambSrc.connect(ambientGain);
    _ambSrc.start();
  }
  if (soundMode === 'noise') createNoise();
}

function stopAmbient() {
  try { if (_ambSrc) _ambSrc.stop(); } catch (_) {}
  _ambSrc = null;
  ambientGain = null;
  ambientStarted = false;
}

function createNoise() {
  if (noiseNode || !audioCtx) return;
  const bufferSize = 4096;
  noiseNode = audioCtx.createScriptProcessor(bufferSize, 1, 1);
  noiseNode.onaudioprocess = e => {
    const out = e.outputBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) out[i] = Math.random() * 2 - 1;
  };
  filterNode = audioCtx.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.value = 200;
  filterNode.Q.value = 1;
  noiseGain = audioCtx.createGain();
  noiseGain.gain.value = 0.1;
  noiseNode.connect(filterNode);
  filterNode.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);
}

function destroyNoise() {
  [noiseNode, filterNode, noiseGain].forEach(n => { if (n) { try { n.disconnect(); } catch (_) {} } });
  noiseNode = filterNode = noiseGain = null;
}

// Ajusta el ruido sintético según la saturación del espectro (solo modo 'noise').
function updateAmbientMix(total) {
  if (!audioCtx) return;
  const t   = Math.min(1, total / MAX_TOTAL);
  const now = audioCtx.currentTime;
  if (soundMode === 'noise' && filterNode) {
    const freq = 500 + t * (7500 - 500);
    filterNode.frequency.linearRampToValueAtTime(freq, now + 0.3);
    if (noiseGain && noiseGain.gain.value !== 0.25) noiseGain.gain.value = 0.25;
  }
}

function playOnceType(type, interval) {
  if (soundMode !== 'beeps' || !satBuffer || !audioCtx || !audioOn) return;
  const st   = soundState[type];
  const spec = SOUND_TYPES[type];
  if (st.gain) st.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.012);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.30, audioCtx.currentTime + 0.006);
  gain.connect(audioCtx.destination);

  const source = audioCtx.createBufferSource();
  source.buffer = satBuffer;
  source.playbackRate.value = spec.pitch + Math.random() * spec.pitchVar;
  source.connect(gain);
  source.start();
  source.onended = () => { try { gain.disconnect(); } catch (_) {} };

  st.source = source;
  st.gain   = gain;
  st.timer  = setTimeout(() => playOnceType(type, interval), interval);
}

// Reinicia los beeps para el año actual; el ritmo de cada categoría sube con su
// cantidad de satélites. Respeta las categorías activas de la leyenda (vizActive).
function playSounds(d) {
  if (soundMode !== 'beeps' || !satBuffer || !d) return;
  stopSounds();
  const GLOBAL_MAX = MAX_SL; // mayor cantidad de cualquier categoría (Starlink 2025)
  Object.keys(SOUND_TYPES).forEach(type => {
    const val = d[type] || 0;
    if (!vizActive.has(type) || val <= 0) return;
    const frac     = val / GLOBAL_MAX;
    const interval = Math.round(SND_MAX_INTERVAL * Math.pow(SND_MIN_INTERVAL / SND_MAX_INTERVAL, frac));
    soundState[type].timer = setTimeout(() => playOnceType(type, interval), 160);
  });
}

function stopSoundType(type) {
  const st = soundState[type];
  clearTimeout(st.timer);
  st.timer = null;
  if (st.gain && audioCtx) st.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.012);
  st.source = null;
  st.gain   = null;
}

function stopSounds() {
  Object.keys(SOUND_TYPES).forEach(stopSoundType);
}

// Llamada desde commit() en cada cambio de año confirmado.
function updateSound(yearData) {
  if (!audioOn || !yearData) return;
  playSounds(yearData);
  updateAmbientMix(vizEarthData(yearData).total);
}

// Apaga todo y resetea los botones secundarios.
function stopAudio() {
  stopSounds();
  stopAmbient();
  destroyNoise();
  const amb  = document.getElementById('btn-ambient');
  const mode = document.getElementById('btn-mode');
  if (amb)  { amb.disabled  = true; amb.classList.remove('active'); }
  if (mode) { mode.disabled = true; mode.classList.remove('active'); mode.textContent = '♪ Modo ruido'; }
}

function setSoundMode(mode) {
  if (!audioCtx || !audioOn || soundMode === mode) return;
  soundMode = mode;
  const mb = document.getElementById('btn-mode');
  if (soundMode === 'beeps') {
    destroyNoise();
    if (currentYearData) playSounds(currentYearData);
    if (mb) { mb.textContent = '♪ Modo ruido'; mb.classList.remove('active'); }
  } else {
    stopSounds();
    destroyNoise();
    createNoise();
    updateAmbientMix(currentYearData ? vizEarthData(currentYearData).total : 0);
    if (mb) { mb.textContent = '♪ Modo pitidos'; mb.classList.add('active'); }
  }
}

// ── Wiring de botones ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const btnAudio   = document.getElementById('btn-audio');
  const btnAmbient = document.getElementById('btn-ambient');
  const btnMode    = document.getElementById('btn-mode');

  btnAudio.addEventListener('click', () => {
    if (!audioOn) {
      audioOn = true;
      btnAudio.textContent = '⏸ Desactivar sonido';
      btnAudio.classList.add('active');
      if (btnAmbient) { btnAmbient.disabled = false; btnAmbient.classList.toggle('active', ambientEnabled); }
      if (btnMode)    { btnMode.disabled = false; btnMode.textContent = soundMode === 'noise' ? '♪ Modo pitidos' : '♪ Modo ruido'; btnMode.classList.toggle('active', soundMode === 'noise'); }

      const start = () => {
        if (!audioOn) return;
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        startAmbient();
        if (currentYearData) updateSound(currentYearData);
      };
      if (_audioStarted && audioCtx && ambientBuffer) start();
      else initAudio().then(start);

    } else {
      audioOn = false;
      stopAudio();
      btnAudio.textContent = '▶ Activar sonido';
      btnAudio.classList.remove('active');
    }
  });

  if (btnAmbient) btnAmbient.addEventListener('click', () => {
    if (!audioOn) return;
    if (ambientEnabled) {
      ambientEnabled = false;
      stopAmbient();
      btnAmbient.classList.remove('active');
    } else {
      ambientEnabled = true;
      startAmbient();
      btnAmbient.classList.add('active');
    }
  });

  if (btnMode) btnMode.addEventListener('click', () => {
    if (!audioOn) return;
    setSoundMode(soundMode === 'noise' ? 'beeps' : 'noise');
  });

  initSetup();
});
