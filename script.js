// ── Estado de filtros ─────────────────────────────────────────────────────────
const LEGEND_TYPES = [
  { key: 'gov',        label: 'Gubernamentales / científicos', color: '#2171b5', shape: 'circle'   },
  { key: 'gnss',       label: 'GNSS / Navegación',             color: '#2aaa58', shape: 'diamond'  },
  { key: 'commercial', label: 'Constelaciones comerciales',    color: '#9b59b6', shape: 'triangle' },
  { key: 'starlink',   label: 'Starlink',                      color: '#e05c2a', shape: 'cross'    },
];

const activeTypes    = new Set(['gov', 'gnss', 'commercial', 'starlink']);
let _currentYearData = null;
let _updateAreas     = null;

function getEarthData(d) {
  return {
    gov:        activeTypes.has('gov')        ? d.gov        : 0,
    gnss:       activeTypes.has('gnss')       ? d.gnss       : 0,
    commercial: activeTypes.has('commercial') ? d.commercial : 0,
    starlink:   activeTypes.has('starlink')   ? d.starlink   : 0,
  };
}

function getFilteredTotal(d) {
  if (!d) return 0;
  const f = getEarthData(d);
  return f.gov + f.gnss + f.commercial + f.starlink;
}

// ── Dimensions ────────────────────────────────────────────────────────────────
const margin = { top: 16, right: 32, bottom: 64, left: 64 };

function getSize() {
  const el = document.getElementById('chart');
  const W  = el.clientWidth;
  const H  = Math.round(W * 0.62);
  return {
    W, H,
    w: W - margin.left - margin.right,
    h: H - margin.top  - margin.bottom
  };
}

// ── Chart ─────────────────────────────────────────────────────────────────────
function buildChart(data) {
  const { W, H, w, h } = getSize();

  const svg = d3.select('#chart')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('height', H);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Scales
  const x = d3.scaleLinear()
    .domain(d3.extent(data, d => d.year))
    .range([0, w]);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.total) * 1.05])
    .range([h, 0]);

  // Grid
  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(y).ticks(6).tickSize(-w).tickFormat(''));

  // Áreas apiladas con degradado: gov → gnss → commercial → starlink
  const clipRect = g.append('clipPath')
    .attr('id', 'area-clip')
    .append('rect')
    .attr('x', 0).attr('y', 0)
    .attr('height', h).attr('width', 0);

  clipRect.transition()
    .duration(2400)
    .ease(d3.easeCubicInOut)
    .attr('width', w);

  const curve = d3.curveCatmullRom;
  const ORDER = ['gov', 'gnss', 'commercial', 'starlink'];

  // Degradados
  const defs = svg.append('defs');
  const gradSpecs = [
    { id: 'grad-gov',  color: '#2171b5', topOp: 0.55, botOp: 0.06 },
    { id: 'grad-gnss', color: '#2aaa58', topOp: 0.60, botOp: 0.07 },
    { id: 'grad-comm', color: '#9b59b6', topOp: 0.60, botOp: 0.07 },
    { id: 'grad-sl',   color: '#e05c2a', topOp: 0.65, botOp: 0.07 },
  ];
  gradSpecs.forEach(({ id, color, topOp, botOp }) => {
    const grad = defs.append('linearGradient').attr('id', id)
      .attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1)
      .attr('gradientUnits', 'objectBoundingBox');
    grad.append('stop').attr('offset',   '0%').attr('stop-color', color).attr('stop-opacity', topOp);
    grad.append('stop').attr('offset', '100%').attr('stop-color', color).attr('stop-opacity', botOp);
  });

  // Función que calcula los límites del área según filtros activos
  function makeAreaFn(type) {
    return d3.area().x(d => x(d.year))
      .y0(d => {
        let cum = 0;
        for (const t of ORDER) { if (t === type) break; if (activeTypes.has(t)) cum += d[t]; }
        return y(cum);
      })
      .y1(d => {
        let cum = 0;
        for (const t of ORDER) { if (t === type) break; if (activeTypes.has(t)) cum += d[t]; }
        if (activeTypes.has(type)) cum += d[type];
        return y(cum);
      })
      .curve(curve);
  }

  const gradIds = { gov: 'grad-gov', gnss: 'grad-gnss', commercial: 'grad-comm', starlink: 'grad-sl' };
  const areaPaths = {};
  ORDER.forEach(type => {
    areaPaths[type] = g.append('path')
      .datum(data)
      .attr('d', makeAreaFn(type)(data))
      .attr('fill', `url(#${gradIds[type]})`)
      .attr('clip-path', 'url(#area-clip)');
  });

  // Line
  function makeLineFn() {
    return d3.line()
      .x(d => x(d.year))
      .y(d => { let t = 0; ORDER.forEach(k => { if (activeTypes.has(k)) t += d[k]; }); return y(t); })
      .curve(d3.curveCatmullRom);
  }

  const linePath = g.append('path')
    .datum(data)
    .attr('class', 'line')
    .attr('d', makeLineFn());

  // Animate line drawing — limpiar dasharray al terminar para que las actualizaciones no se vean recortadas
  const len = linePath.node().getTotalLength();
  linePath
    .attr('stroke-dasharray', `${len} ${len}`)
    .attr('stroke-dashoffset', len)
    .transition()
    .duration(2400)
    .ease(d3.easeCubicInOut)
    .attr('stroke-dashoffset', 0)
    .on('end', () => linePath.attr('stroke-dasharray', null).attr('stroke-dashoffset', null));

  // Función de actualización al cambiar filtros
  _updateAreas = () => {
    ORDER.forEach(type => {
      areaPaths[type]
        .attr('display', activeTypes.has(type) ? null : 'none')
        .transition().duration(350).ease(d3.easeCubicInOut)
        .attr('d', makeAreaFn(type)(data));
    });
    linePath
      .transition().duration(350).ease(d3.easeCubicInOut)
      .attr('d', makeLineFn()(data));
  };

  // Axes
  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).tickFormat(d3.format('d')).ticks(12));

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => d >= 1000 ? d / 1000 + 'k' : d));

  // Axis labels
  g.append('text')
    .attr('class', 'axis-label')
    .attr('text-anchor', 'middle')
    .attr('x', w / 2)
    .attr('y', h + 50)
    .style('font-size', '13px')
    .text('AÑO');

  g.append('text')
    .attr('class', 'axis-label')
    .attr('text-anchor', 'middle')
    .attr('transform', `translate(-66, ${h / 2}) rotate(-90)`)
    .style('font-size', '13px')
    .text('SATÉLITES EN ÓRBITA');

  // ── Interactividad: crosshair + tooltip ──────────────────────────────────────
  const bisect = d3.bisector(d => d.year).center;

  const tooltip = d3.select('body').append('div')
    .attr('class', 'tooltip')
    .style('opacity', 0);

  const vline = g.append('line')
    .attr('class', 'crosshair')
    .attr('y1', 0)
    .attr('y2', h)
    .style('opacity', 0);

  const snapDot = g.append('circle')
    .attr('class', 'snap-dot')
    .attr('r', 5)
    .style('opacity', 0);

  g.append('rect')
    .attr('width', w)
    .attr('height', h)
    .attr('fill', 'none')
    .attr('pointer-events', 'all')
    .on('mousemove', function(event) {
      const [mx] = d3.pointer(event);
      const year = Math.round(x.invert(mx));
      const i = bisect(data, year);
      const d = data[i];
      if (!d) return;

      const px          = x(d.year);
      const filteredNow = getEarthData(d);
      const filtNow     = filteredNow.gov + filteredNow.gnss + filteredNow.commercial + filteredNow.starlink;
      const py          = y(filtNow);

      vline.attr('x1', px).attr('x2', px).style('opacity', 1);
      snapDot.attr('cx', px).attr('cy', py).style('opacity', 1);

      const filtered   = getEarthData(d);
      const filtTotal  = filtered.gov + filtered.gnss + filtered.commercial + filtered.starlink;
      const ttVal      = `${filtTotal.toLocaleString()} satélite${filtTotal === 1 ? '' : 's'}`;

      const BREAKDOWN = [
        { key: 'gov',        icon: '●', label: 'Gubernamentales', color: '#2171b5' },
        { key: 'gnss',       icon: '◆', label: 'GNSS',            color: '#2aaa58' },
        { key: 'commercial', icon: '▲', label: 'Comerciales',     color: '#9b59b6' },
        { key: 'starlink',   icon: '✕', label: 'Starlink',        color: '#e05c2a' },
      ];

      const ttNew = BREAKDOWN
        .filter(t => activeTypes.has(t.key) && filtered[t.key] > 0)
        .map(t => `<span class="tt-new"><span style="color:${t.color}">${t.icon}</span> ${t.label}: ${filtered[t.key].toLocaleString()}</span>`)
        .join('<br>');

      const ttSputnik = (d.year === 1958 && activeTypes.has('gov'))
        ? `<br><span class="tt-new">Sputnik 1</span>`
        : '';

      tooltip
        .style('opacity', 1)
        .html(`<span class="tt-year">${d.year}</span><br><span class="tt-val">${ttVal}</span><br>${ttNew}${ttSputnik}`)






// Posición del tooltip según el año
let leftPos, topPos;
if (d.year >= 2005) {
  // A partir de 2005: arriba a la izquierda del cursor
  leftPos = event.pageX - 200;
  topPos = event.pageY - 90;
} else {
  // Antes de 2005: posición original (derecha y arriba)
  leftPos = event.pageX + 18;
  topPos = event.pageY - 90;
}



// Evitar que el cuadro de info tape al Mapa Geo
leftPos = Math.max(10, leftPos);
topPos = Math.max(10, topPos);

tooltip
  .style('opacity', 1)
  .html(`<span class="tt-year">${d.year}</span><br><span class="tt-val">${ttVal}</span><br>${ttNew}${ttSputnik}`)
  .style('left', leftPos + 'px')
  .style('top', topPos + 'px');

      if (d.year !== lastYear) {
        lastYear = d.year;
        playSounds(d);
      }
      updateAmbientMix(filtNow);
      _currentYearData = d;
      updateEarthDots(getEarthData(d));
    })
    .on('mouseleave', function() {
      vline.style('opacity', 0);
      snapDot.style('opacity', 0);
      tooltip.style('opacity', 0);
      stopSounds();
      lastYear = null;
      updateAmbientMix(0);
    });
}




// ── Earth ─────────────────────────────────────────────────────────────────────
const EARTH_R    = 108;
const EARTH_SIZE = 380;

// Cada categoría ocupa un rango FIJO en el pool — las posiciones nunca cambian
const MAX_GOV  = 5584;
const MAX_GNSS = 321;
const MAX_COMM = 1215;
const MAX_SL   = 6770;
const MAX_DOTS = MAX_GOV + MAX_GNSS + MAX_COMM + MAX_SL; // 13890

const GNSS_OFF = MAX_GOV;
const COMM_OFF = MAX_GOV + MAX_GNSS;
const SL_OFF   = MAX_GOV + MAX_GNSS + MAX_COMM;

const VIEW_RX = -0.38;
const VIEW_RY =  0.22;

const COS_RX = Math.cos(VIEW_RX), SIN_RX = Math.sin(VIEW_RX);
const COS_RY = Math.cos(VIEW_RY), SIN_RY = Math.sin(VIEW_RY);

const GOV_COLOR        = [33,  113, 181];  // #2171b5
const GNSS_COLOR       = [42,  170, 88];   // #2aaa58
const COMMERCIAL_COLOR = [155, 89,  182];  // #9b59b6
const STARLINK_COLOR   = [224, 92,  42];   // #e05c2a
const DOT_COLOR        = GOV_COLOR;        // alias para compatibilidad

function srand(s) { const x = Math.sin(s + 1) * 10000; return x - Math.floor(x); }

const satellites = Array.from({ length: MAX_DOTS }, (_, i) => ({
  lat:    Math.acos(2 * srand(i * 7) - 1) - Math.PI / 2,
  lon:    srand(i * 7 + 1) * Math.PI * 2,
  omega:  (srand(i * 11) * 0.12 + 0.02) * (i % 2 ? 1 : -1),
  radius: EARTH_R * (1.30 + srand(i * 13) * 0.38),
}));

let activeDots       = 0;
let activeGov        = 0;
let activeGnss       = 0;
let activeCommercial = 0;
let activeStarlink   = 0;

function updateEarthDots(d) {
  activeDots       = d.total;
  activeGov        = d.gov;
  activeGnss       = d.gnss;
  activeCommercial = d.commercial;
  activeStarlink   = d.starlink;
}

function project(lat, lon, r, cx, cy) {
  const x0 = r * Math.cos(lat) * Math.cos(lon);
  const y0 = r * Math.sin(lat);
  const z0 = r * Math.cos(lat) * Math.sin(lon);
  const y1 = y0 * COS_RX - z0 * SIN_RX;
  const z1 = y0 * SIN_RX + z0 * COS_RX;
  const x2 = x0 * COS_RY + z1 * SIN_RY;
  const z2 = -x0 * SIN_RY + z1 * COS_RY;
  return { sx: cx + x2, sy: cy - y1, depth: z2 };
}

function initEarth() {
  const canvas = document.getElementById('earth');
  const dpr    = window.devicePixelRatio || 1;
  canvas.width  = EARTH_SIZE * dpr;
  canvas.height = EARTH_SIZE * dpr;
  canvas.style.width  = EARTH_SIZE + 'px';
  canvas.style.height = EARTH_SIZE + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const cx = EARTH_SIZE / 2;
  const cy = EARTH_SIZE / 2;
  const STEPS = 64;

  (function frame() {
    ctx.clearRect(0, 0, EARTH_SIZE, EARTH_SIZE);
    const t    = performance.now() / 1000;
    const gRot = t * 0.12;   // globe surface rotation

    // Cada categoría usa su rango fijo del pool — posiciones estables entre años
    const projSat  = s => project(s.lat, s.lon + s.omega * t, s.radius, cx, cy);
    const govDots  = satellites.slice(0,        activeGov)                    .map(s => ({...projSat(s), cat: 0}));
    const gnssDots = satellites.slice(GNSS_OFF, GNSS_OFF + activeGnss)        .map(s => ({...projSat(s), cat: 1}));
    const commDots = satellites.slice(COMM_OFF, COMM_OFF + activeCommercial)  .map(s => ({...projSat(s), cat: 2}));
    const slDots   = satellites.slice(SL_OFF,   SL_OFF   + activeStarlink)   .map(s => ({...projSat(s), cat: 3}));
    const dots     = [...govDots, ...gnssDots, ...commDots, ...slDots];

    const behind = dots.filter(d => d.depth < 0);
    const front  = dots.filter(d => d.depth >= 0);

    // Círculos (gov)
    function drawCircles(list, r, style) {
      ctx.beginPath();
      list.forEach(d => { ctx.moveTo(d.sx + r, d.sy); ctx.arc(d.sx, d.sy, r, 0, Math.PI * 2); });
      ctx.fillStyle = style; ctx.fill();
    }
    // Diamantes ◆ (gnss)
    function drawDiamonds(list, style) {
      ctx.beginPath();
      list.forEach(d => {
        ctx.moveTo(d.sx,       d.sy - 2.4);
        ctx.lineTo(d.sx + 2.4, d.sy);
        ctx.lineTo(d.sx,       d.sy + 2.4);
        ctx.lineTo(d.sx - 2.4, d.sy);
        ctx.closePath();
      });
      ctx.fillStyle = style; ctx.fill();
    }
    // Triángulos ▲ (commercial)
    function drawTriangles(list, style) {
      ctx.beginPath();
      list.forEach(d => {
        ctx.moveTo(d.sx,       d.sy - 2.5);
        ctx.lineTo(d.sx + 2.2, d.sy + 1.6);
        ctx.lineTo(d.sx - 2.2, d.sy + 1.6);
        ctx.closePath();
      });
      ctx.fillStyle = style; ctx.fill();
    }
    // Cruces ✕ (starlink)
    function drawCrosses(list, style) {
      ctx.fillStyle = style;
      list.forEach(d => {
        ctx.fillRect(d.sx - 2.2, d.sy - 0.55, 4.4, 1.1);
        ctx.fillRect(d.sx - 0.55, d.sy - 2.2, 1.1, 4.4);
      });
    }

    const [gr, gg, gb] = GOV_COLOR;
    const [nr, ng, nb] = GNSS_COLOR;
    const [cr, cg, cb] = COMMERCIAL_COLOR;
    const [sr, sg, sb] = STARLINK_COLOR;

    // Behind (antes del globo)
    drawCircles  (behind.filter(d => d.cat === 0), 0.9, `rgba(${gr},${gg},${gb},0.25)`);
    drawDiamonds (behind.filter(d => d.cat === 1),      `rgba(${nr},${ng},${nb},0.25)`);
    drawTriangles(behind.filter(d => d.cat === 2),      `rgba(${cr},${cg},${cb},0.25)`);
    drawCrosses  (behind.filter(d => d.cat === 3),      `rgba(${sr},${sg},${sb},0.25)`);

    // Globe fill (opaque)
    ctx.beginPath();
    ctx.arc(cx, cy, EARTH_R, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f6fa';
    ctx.fill();

    // Wireframe grid — only front-facing segments (depth >= 0)
    ctx.lineWidth = 0.65;
    ctx.strokeStyle = 'rgba(58,63,92,0.55)';

    for (let latDeg = -75; latDeg <= 75; latDeg += 15) {
      const lat = latDeg * Math.PI / 180;
      ctx.beginPath();
      let penDown = false;
      for (let i = 0; i <= STEPS; i++) {
        const p = project(lat, (i / STEPS) * Math.PI * 2 + gRot, EARTH_R, cx, cy);
        if (p.depth >= 0) {
          penDown ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy);
          penDown = true;
        } else {
          penDown = false;
        }
      }
      ctx.stroke();
    }

    for (let lonDeg = 0; lonDeg < 360; lonDeg += 15) {
      const lon = lonDeg * Math.PI / 180 + gRot;
      ctx.beginPath();
      let penDown = false;
      for (let i = 0; i <= STEPS; i++) {
        const p = project(-Math.PI / 2 + (i / STEPS) * Math.PI, lon, EARTH_R, cx, cy);
        if (p.depth >= 0) {
          penDown ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy);
          penDown = true;
        } else {
          penDown = false;
        }
      }
      ctx.stroke();
    }

    // Globe outline
    ctx.beginPath();
    ctx.arc(cx, cy, EARTH_R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(58,63,92,0.85)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Front (encima del globo)
    drawCircles  (front.filter(d => d.cat === 0), 1.1, `rgba(${gr},${gg},${gb},0.88)`);
    drawDiamonds (front.filter(d => d.cat === 1),      `rgba(${nr},${ng},${nb},0.88)`);
    drawTriangles(front.filter(d => d.cat === 2),      `rgba(${cr},${cg},${cb},0.88)`);
    drawCrosses  (front.filter(d => d.cat === 3),      `rgba(${sr},${sg},${sb},0.88)`);

    // Sputnik 1 — opacidad máxima siempre, encima de todo
    if (activeGov >= 1) {
      const sp = govDots[0];
      ctx.beginPath();
      ctx.arc(sp.sx, sp.sy, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${gr},${gg},${gb})`;
      ctx.fill();
    }

    requestAnimationFrame(frame);
  })();
}

// ── Audio (Web Audio API) ─────────────────────────────────────────────────────
const MAX_TOTAL    = 13890;
const MIN_INTERVAL = 80;
const MAX_INTERVAL = 2200;

let audioCtx       = null;
let satBuffer      = null;
let ambientBuffer  = null;
let staticBuffer   = null;
let ambientGain    = null;
let staticGain     = null;
let ambientStarted = false;
let lastYear       = null;
let _audioStarted  = false;
let soundMode      = 'beeps';
let modeBtn        = null;




let noiseNode      = null;   // generador de ruido sintético
let filterNode     = null;   // filtro para el ruido
let noiseGain      = null;   // ganancia del ruido


// 4 pistas independientes — una por tipo de satélite
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
      const [sa, aa, sta] = await Promise.all([
        fetch('Sonido_Satelite.mp3').then(r => r.arrayBuffer()),
        fetch('Sonido_Ambiente.mp3').then(r => r.arrayBuffer()), 
        fetch('Estatica.mp3').then(r => r.arrayBuffer()),
      ]);
      [satBuffer, ambientBuffer, staticBuffer] = await Promise.all([
        audioCtx.decodeAudioData(sa),
        audioCtx.decodeAudioData(aa),
        audioCtx.decodeAudioData(sta),
      ]);
      if (_audioOn) startAmbient();
    } catch (e) {
      console.error('Audio init error:', e);
      _audioStarted = false;
    }
  })();
}





let _ambSrc  = null;
let _statSrc = null;

let _ambientEnabled = true;





// Funcion para crear ruido
function startAmbient() {
  if (ambientStarted || !_ambientEnabled) return;
  ambientStarted = true;

  // Música de fondo (ambiente) – solo si existe el buffer
  if (ambientBuffer) {
    ambientGain = audioCtx.createGain();
    ambientGain.gain.value = 0.75;
    ambientGain.connect(audioCtx.destination);
    _ambSrc = audioCtx.createBufferSource();
    _ambSrc.buffer = ambientBuffer;
    _ambSrc.loop = true;
    _ambSrc.connect(ambientGain);
    _ambSrc.start();
  } else {
    ambientGain = audioCtx.createGain();
    ambientGain.gain.value = 0;
    ambientGain.connect(audioCtx.destination);
  }

  // Ruido sintético – solo si el modo lo requiere
  if (soundMode === 'noise') {
    createNoise();
  }

  // staticGain para compatibilidad (no se usa)
  staticGain = audioCtx.createGain();
  staticGain.gain.value = 0;
  staticGain.connect(audioCtx.destination);
}

function createNoise() {
  if (noiseNode) return; // ya existe
  const bufferSize = 4096;
  noiseNode = audioCtx.createScriptProcessor(bufferSize, 1, 1);
  noiseNode.onaudioprocess = (e) => {
    const output = e.outputBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
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
  if (noiseNode) {
    try { noiseNode.disconnect(); } catch(e) {}
    noiseNode = null;
  }
  if (filterNode) {
    try { filterNode.disconnect(); } catch(e) {}
    filterNode = null;
  }
  if (noiseGain) {
    try { noiseGain.disconnect(); } catch(e) {}
    noiseGain = null;
  }
}







function stopAmbient() {
  try { if (_ambSrc)  _ambSrc.stop();  } catch (_) {}
  try { if (_statSrc) _statSrc.stop(); } catch (_) {}
  _ambSrc = null; _statSrc = null;
  ambientGain = null; staticGain = null;
  ambientStarted = false;
}






function updateAmbientMix(total) {
  if (!audioCtx) return;
  const t = Math.min(1, total / MAX_TOTAL);
  const now = audioCtx.currentTime;

  if (soundMode === 'noise' && filterNode) {
    const minFreq = 500;
    const maxFreq = 7500;
    const freq = minFreq + t * (maxFreq - minFreq);
    filterNode.frequency.linearRampToValueAtTime(freq, now + 0.3);
    if (noiseGain && noiseGain.gain.value !== 0.25) {
      noiseGain.gain.value = 0.25;
    }
  }
}









function playOnceType(type, interval) {
  if (soundMode !== 'beeps') return;

  if (!satBuffer || !audioCtx || !_audioOn) return;
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

function playSounds(d) {
  if (soundMode !== 'beeps') return;

  if (!satBuffer) return;
  stopSounds();

  // Normalizar contra el máximo histórico global (Starlink 2025 = 6770)
  // → en años tempranos los beeps son lentos; en 2025 Starlink alcanza MIN_INTERVAL
  const GLOBAL_MAX = MAX_SL; // 6770 — el mayor valor de cualquier categoría en cualquier año

  Object.keys(SOUND_TYPES).forEach(type => {
    const val = d[type] || 0;
    if (!activeTypes.has(type) || val <= 0) return;
    const t        = val / GLOBAL_MAX;
    const interval = Math.round(MAX_INTERVAL * Math.pow(MIN_INTERVAL / MAX_INTERVAL, t));
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






// ── Bootstrap ─────────────────────────────────────────────────────────────────
// ── Leyenda interactiva ───────────────────────────────────────────────────────


function previewSound(type, btn) {
  // Si el audio no está inicializado, lo inicializamos y esperamos
  if (!audioCtx || !satBuffer) {
    // Guardamos temporalmente el tipo y el botón para reproducir después de la inicialización
    if (!_audioStarted) {
      // Inicializar audio si no se ha hecho
      initAudio().then(() => {
        // Esperar un poco a que se decodifiquen los buffers
        setTimeout(() => {
          if (satBuffer && audioCtx) {
            playPreviewSound(type, btn);
          }
        }, 200);
      }).catch(e => console.error(e));
      return;
    } else {
      // Ya se inició pero quizás aún no hay buffer
      setTimeout(() => {
        if (satBuffer && audioCtx) {
          playPreviewSound(type, btn);
        }
      }, 200);
      return;
    }
  }
  playPreviewSound(type, btn);
}

function playPreviewSound(type, btn) {
  if (!satBuffer || !audioCtx) return;
  const spec = SOUND_TYPES[type];
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.45, audioCtx.currentTime + 0.008);
  gain.gain.setTargetAtTime(0, audioCtx.currentTime + 0.05, 0.08);
  gain.connect(audioCtx.destination);
  const source = audioCtx.createBufferSource();
  source.buffer = satBuffer;
  source.playbackRate.value = spec.pitch;
  source.connect(gain);
  source.start();
  source.onended = () => { try { gain.disconnect(); } catch (_) {} };
  btn.textContent = '♪';
  setTimeout(() => { btn.textContent = '▶'; }, 400);
}






function buildLegend() {
  const container = document.getElementById('legend');
  const SHAPE_SVG = {
    circle:   c => `<circle cx="7" cy="7" r="6" fill="${c}"/>`,
    diamond:  c => `<polygon points="7,0 14,7 7,14 0,7" fill="${c}"/>`,
    triangle: c => `<polygon points="7,1 14,13 0,13" fill="${c}"/>`,
    cross:    c => `<rect x="0" y="5" width="14" height="4" fill="${c}"/><rect x="5" y="0" width="4" height="14" fill="${c}"/>`,
  };

  LEGEND_TYPES.forEach(({ key, label, color, shape }) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    const playBtn = document.createElement('button');
    playBtn.className = 'legend-play';
    playBtn.textContent = '▶';
    playBtn.title = `Previsualizar sonido: ${label}`;
    playBtn.addEventListener('click', e => {
      e.stopPropagation();
      previewSound(key, playBtn);
    });

    item.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14">${SHAPE_SVG[shape](color)}</svg><span>${label}</span>`;
    item.appendChild(playBtn);

    item.addEventListener('click', () => {
      if (activeTypes.has(key)) {
        if (activeTypes.size === 1) return; // siempre al menos uno activo
        activeTypes.delete(key);
        item.classList.add('inactive');
      } else {
        activeTypes.add(key);
        item.classList.remove('inactive');
      }
      if (_updateAreas) _updateAreas();
      if (_currentYearData) {
        updateEarthDots(getEarthData(_currentYearData));
        playSounds(_currentYearData);
        updateAmbientMix(getFilteredTotal(_currentYearData));
      }
    });

    container.appendChild(item);
  });
}







fetch('data.json')
  .then(r => r.json())
  .then(data => { buildChart(data); initEarth(); buildLegend(); })
  .catch(err => console.error('Error loading data:', err));

const audioBtn   = document.getElementById('audio-btn');
const ambientBtn = document.getElementById('ambient-btn');
let _audioOn = false;



modeBtn = document.getElementById('mode-btn');
if (modeBtn) {
  modeBtn.addEventListener('click', () => {
    if (!_audioOn) return;
    modeBtn.disabled = false;
    const newMode = soundMode === 'noise' ? 'beeps' : 'noise';
    setSoundMode(newMode);
  });
}








audioBtn.addEventListener('click', () => {
  if (!_audioOn) {
    // ACTIVAR AUDIOO
    _audioOn = true;
    
    if (_audioStarted && audioCtx && ambientBuffer) {
      startAmbient();
    } else {
      initAudio();
    }
    

    audioBtn.textContent = '⏸ Desactivar audio';
    audioBtn.style.color = '#2aaa58';
    audioBtn.style.borderColor = '#2aaa58';
    

    ambientBtn.disabled = false;
    ambientBtn.textContent = '◎ Ambiente';
    ambientBtn.style.color = '#2aaa58';
    ambientBtn.style.borderColor = '#2aaa58';
    

    if (modeBtn) {
      modeBtn.disabled = false;
      modeBtn.textContent = soundMode === 'noise' ? '▶ Modo ruido' : '▶ Modo pitido';
    }
    
    document.getElementById('legend').classList.add('audio-active');
    
  } else {

    _audioOn = false;
    stopAmbient();
    stopSounds();
    
    audioBtn.textContent = '▶ Activar audio';
    audioBtn.style.color = '';
    audioBtn.style.borderColor = '';
    
    _ambientEnabled = true;
    ambientBtn.disabled = true;
    ambientBtn.textContent = '◎ Ambiente';
    ambientBtn.style.color = '';
    ambientBtn.style.borderColor = '';
    
    if (modeBtn) modeBtn.disabled = true;
    
    document.getElementById('legend').classList.remove('audio-active');
    

    if (noiseNode) {
      try { noiseNode.disconnect(); } catch(e) {}
      noiseNode = null;
    }
    if (filterNode) {
      try { filterNode.disconnect(); } catch(e) {}
      filterNode = null;
    }
    if (noiseGain) {
      try { noiseGain.disconnect(); } catch(e) {}
      noiseGain = null;
    }
  }
});







ambientBtn.addEventListener('click', () => {
  if (_ambientEnabled) {
    _ambientEnabled = false;
    stopAmbient();
    ambientBtn.textContent = '◎ Ambiente';
    ambientBtn.style.color       = '';
    ambientBtn.style.borderColor = '';
  } else {
    _ambientEnabled = true;
    startAmbient();
    ambientBtn.textContent = '◎ Ambiente';
    ambientBtn.style.color       = '#2aaa58';
    ambientBtn.style.borderColor = '#2aaa58';
  }
})









function setSoundMode(mode) {  
  if (!audioCtx || !_audioOn) return;
  if (soundMode === mode) return;
  soundMode = mode;

  if (soundMode === 'beeps') {
    destroyNoise();      
    stopSounds();        

  } else { 
    stopSounds();       
    destroyNoise();     
    createNoise();      
    updateAmbientMix(0); 
  }

  if (modeBtn) {
    modeBtn.textContent = soundMode === 'noise' ? '▶ Modo ruido' : '▶ Modo pitidos';
  }
}



