// ── Dimensions ────────────────────────────────────────────────────────────────
const margin = { top: 16, right: 32, bottom: 64, left: 72 };

function getSize() {
  const el = document.getElementById('chart');
  const W  = el.clientWidth;
  const H  = Math.round(W * 0.48);
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

  // Line
  const line = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.total))
    .curve(d3.curveCatmullRom);

  const path = g.append('path')
    .datum(data)
    .attr('class', 'line')
    .attr('d', line);

  // Animate line drawing
  const len = path.node().getTotalLength();
  path
    .attr('stroke-dasharray', `${len} ${len}`)
    .attr('stroke-dashoffset', len)
    .transition()
    .duration(2400)
    .ease(d3.easeCubicInOut)
    .attr('stroke-dashoffset', 0);

  // Axes
  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).tickFormat(d3.format('d')).ticks(12));

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => d >= 1000 ? d / 1000 + 'k' : d));

  // ── Anotación Starlink ───────────────────────────────────────────────────
  const starlink = data.find(d => d.year === 2019);
  const sx = x(starlink.year);
  const sy = y(starlink.total);

  // Línea vertical punteada
  g.append('line')
    .attr('x1', sx).attr('x2', sx)
    .attr('y1', sy).attr('y2', h)
    .attr('stroke', '#e05c2a')
    .attr('stroke-width', 1.2)
    .attr('stroke-dasharray', '4 3');

  // Línea de anotación hacia el texto
  const aLabelX = sx + 10;
  const aLabelY = sy - 32;
  g.append('line')
    .attr('x1', sx).attr('x2', aLabelX + 10)
    .attr('y1', sy).attr('y2', aLabelY + 30)
    .attr('stroke', '#e05c2a')
    .attr('stroke-width', 1);

  // Punto en la curva
  g.append('circle')
    .attr('cx', sx).attr('cy', sy)
    .attr('r', 4)
    .attr('fill', '#e05c2a')
    .attr('stroke', '#f5f6fa')
    .attr('stroke-width', 1.5);

  // Texto
  ['Inicio de', 'lanzamientos', 'Starlink'].forEach((line, i) => {
    g.append('text')
      .attr('x', aLabelX + 14)
      .attr('y', aLabelY + 28 + i * 14)
      .attr('font-size', 11)
      .attr('font-family', 'Segoe UI, system-ui, sans-serif')
      .attr('fill', '#e05c2a')
      .attr('font-weight', '500')
      .text(line);
  });

  // ── Anotación Sputnik ───────────────────────────────────────────────────────
  const sputnik  = data.find(d => d.year === 1958);
  const spx = x(sputnik.year);
  const spy = y(sputnik.total);
  const spColor = '#2aaa58';

  const spLabelX = spx + 14;
  const spLabelY = spy - 58;

  // Línea vertical punteada
  g.append('line')
    .attr('x1', spx).attr('x2', spx)
    .attr('y1', spy).attr('y2', h)
    .attr('stroke', spColor)
    .attr('stroke-width', 1.2)
    .attr('stroke-dasharray', '4 3');

  // Línea de anotación hacia el texto
  g.append('line')
    .attr('x1', spx).attr('x2', spLabelX + 8)
    .attr('y1', spy).attr('y2', spLabelY + 44)
    .attr('stroke', spColor)
    .attr('stroke-width', 1);

  // Punto en la curva
  g.append('circle')
    .attr('cx', spx).attr('cy', spy)
    .attr('r', 4)
    .attr('fill', spColor)
    .attr('stroke', '#f5f6fa')
    .attr('stroke-width', 1.5);

  // Texto
  ['Sputnik 1,', 'primer satélite', 'en órbita'].forEach((line, i) => {
    g.append('text')
      .attr('x', spLabelX + 12)
      .attr('y', spLabelY + i * 14)
      .attr('font-size', 11)
      .attr('font-family', 'Segoe UI, system-ui, sans-serif')
      .attr('fill', spColor)
      .attr('font-weight', '500')
      .text(line);
  });

  // Axis labels
  g.append('text')
    .attr('class', 'axis-label')
    .attr('text-anchor', 'middle')
    .attr('x', w / 2)
    .attr('y', h + 48)
    .style('font-size', '14px')
    .text('AÑO');

  g.append('text')
    .attr('class', 'axis-label')
    .attr('text-anchor', 'middle')
    .attr('transform', `translate(-52, ${h / 2}) rotate(-90)`)
    .style('font-size', '16px');

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
      if (audioCtx.state === 'suspended') audioCtx.resume().then(startAmbient);
      else startAmbient();
      const [mx] = d3.pointer(event);
      const year = Math.round(x.invert(mx));
      const i = bisect(data, year);
      const d = data[i];
      if (!d) return;

      const px = x(d.year);
      const py = y(d.total);

      const dotColor = d.year === 1958  ? '#2aaa58'
                     : d.starlink > 0   ? '#e05c2a'
                     : '#2171b5';

      vline.attr('x1', px).attr('x2', px).style('opacity', 1);
      snapDot.attr('cx', px).attr('cy', py).style('opacity', 1).style('fill', dotColor);

      const ttNew = d.year === 1958
        ? `<span class="tt-new" style="color:#2aaa58;font-weight:600">Sputnik 1</span>`
        : `<span class="tt-new">+${d.new.toLocaleString()} nuevos</span>`;
      const ttVal = `${d.total.toLocaleString()} satélite${d.total === 1 ? '' : 's'}`;

      tooltip
        .style('opacity', 1)
        .html(`<span class="tt-year">${d.year}</span><br><span class="tt-val">${ttVal}</span><br>${ttNew}`)
        .style('left', (event.pageX + 18) + 'px')
        .style('top',  (event.pageY - 48) + 'px');

      if (d.year !== lastYear) {
        lastYear = d.year;
        playSounds(d.total);
        updateEarthDots(d.total, d.starlink);
        updateAmbientMix(d.total);
      }
    })
    .on('mouseleave', function() {
      vline.style('opacity', 0);
      snapDot.style('opacity', 0);
      tooltip.style('opacity', 0);
      stopSounds();
      lastYear = null;
    });
}

// ── Earth ─────────────────────────────────────────────────────────────────────
const EARTH_R    = 86;
const EARTH_SIZE = 300;
const MAX_DOTS   = 13890;

const VIEW_RX = -0.38;
const VIEW_RY =  0.22;

const COS_RX = Math.cos(VIEW_RX), SIN_RX = Math.sin(VIEW_RX);
const COS_RY = Math.cos(VIEW_RY), SIN_RY = Math.sin(VIEW_RY);

const DOT_COLOR      = [33, 113, 181];   // #2171b5
const STARLINK_COLOR = [224, 92, 42];    // #e05c2a

function srand(s) { const x = Math.sin(s + 1) * 10000; return x - Math.floor(x); }

const satellites = Array.from({ length: MAX_DOTS }, (_, i) => ({
  lat:    Math.acos(2 * srand(i * 7) - 1) - Math.PI / 2,
  lon:    srand(i * 7 + 1) * Math.PI * 2,
  omega:  (srand(i * 11) * 0.12 + 0.02) * (i % 2 ? 1 : -1),
  radius: EARTH_R * (1.30 + srand(i * 13) * 0.38),
}));

let activeDots         = 0;
let activeDotsStarlink = 0;

function updateEarthDots(total, starlinkTotal) {
  activeDots         = total;
  activeDotsStarlink = starlinkTotal;
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

    // Satellite positions — los últimos activeDotsStarlink son Starlink
    const nonStarlink = activeDots - activeDotsStarlink;
    const dots = satellites.slice(0, activeDots).map((s, i) => ({
      ...project(s.lat, s.lon + s.omega * t, s.radius, cx, cy),
      starlink: i >= nonStarlink,
    }));

    const behind = dots.filter(d => d.depth < 0);
    const front  = dots.filter(d => d.depth >= 0);

    // Behind satellites (drawn before globe)
    const [dr, dg, db] = DOT_COLOR;
    const [sr, sg, sb] = STARLINK_COLOR;

    ctx.beginPath();
    behind.filter(d => !d.starlink).forEach(d => {
      ctx.moveTo(d.sx + 0.9, d.sy);
      ctx.arc(d.sx, d.sy, 0.9, 0, Math.PI * 2);
    });
    ctx.fillStyle = `rgba(${dr},${dg},${db},0.28)`;
    ctx.fill();

    ctx.beginPath();
    behind.filter(d => d.starlink).forEach(d => {
      ctx.moveTo(d.sx + 0.9, d.sy);
      ctx.arc(d.sx, d.sy, 0.9, 0, Math.PI * 2);
    });
    ctx.fillStyle = `rgba(${sr},${sg},${sb},0.28)`;
    ctx.fill();

    // Globe fill (opaque)
    ctx.beginPath();
    ctx.arc(cx, cy, EARTH_R, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f6fa';
    ctx.fill();

    // Wireframe grid — only front-facing segments (depth >= 0)
    ctx.lineWidth = 0.65;
    ctx.strokeStyle = 'rgba(33,100,175,0.75)';

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
    ctx.strokeStyle = 'rgba(55,135,215,0.90)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Front satellites (drawn on top of globe)
    ctx.beginPath();
    front.filter(d => !d.starlink).forEach(d => {
      ctx.moveTo(d.sx + 1.1, d.sy);
      ctx.arc(d.sx, d.sy, 1.1, 0, Math.PI * 2);
    });
    ctx.fillStyle = `rgba(${dr},${dg},${db},0.88)`;
    ctx.fill();

    ctx.beginPath();
    front.filter(d => d.starlink).forEach(d => {
      ctx.moveTo(d.sx + 1.1, d.sy);
      ctx.arc(d.sx, d.sy, 1.1, 0, Math.PI * 2);
    });
    ctx.fillStyle = `rgba(${sr},${sg},${sb},0.88)`;
    ctx.fill();

    // Sputnik 1 — primer satélite, siempre verde y encima
    if (activeDots >= 1) {
      const sp = dots[0];
      ctx.beginPath();
      ctx.arc(sp.sx, sp.sy, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = '#2aaa58';
      ctx.fill();
    }

    requestAnimationFrame(frame);
  })();
}

// ── Audio (Web Audio API) ─────────────────────────────────────────────────────
const MAX_TOTAL    = 13890;
const MIN_INTERVAL = 80;
const MAX_INTERVAL = 2200;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let satBuffer     = null;
let repeatTimer   = null;
let activeSource  = null;
let activeGain    = null;
let lastYear      = null;

// Ambient crossfade
let ambientBuffer  = null;
let staticBuffer   = null;
let ambientGain    = null;
let staticGain     = null;
let ambientStarted = false;

Promise.all([
  fetch('Sonido_Satelite.mp3').then(r => r.arrayBuffer()).then(b => audioCtx.decodeAudioData(b)),
  fetch('Sonido_Ambiente.mp3').then(r => r.arrayBuffer()).then(b => audioCtx.decodeAudioData(b)),
  fetch('estatica.mp3').then(r => r.arrayBuffer()).then(b => audioCtx.decodeAudioData(b)),
]).then(([sat, amb, stat]) => {
  satBuffer     = sat;
  ambientBuffer = amb;
  staticBuffer  = stat;
  startAmbient();
}).catch(() => {});

function startAmbient() {
  if (ambientStarted || !ambientBuffer || !staticBuffer || audioCtx.state !== 'running') return;
  ambientStarted = true;

  ambientGain = audioCtx.createGain();
  ambientGain.gain.value = 0.75;
  ambientGain.connect(audioCtx.destination);

  staticGain = audioCtx.createGain();
  staticGain.gain.value = 0;
  staticGain.connect(audioCtx.destination);

  const ambSrc = audioCtx.createBufferSource();
  ambSrc.buffer = ambientBuffer;
  ambSrc.loop   = true;
  ambSrc.connect(ambientGain);
  ambSrc.start();

  const statSrc = audioCtx.createBufferSource();
  statSrc.buffer = staticBuffer;
  statSrc.loop   = true;
  statSrc.connect(staticGain);
  statSrc.start();
}

function updateAmbientMix(total) {
  if (!ambientGain || !staticGain) return;
  const t   = total / MAX_TOTAL;
  const now = audioCtx.currentTime;
  ambientGain.gain.linearRampToValueAtTime(0.75 * (1 - t), now + 0.5);
  staticGain.gain.linearRampToValueAtTime(1.0 * t,         now + 0.5);
}

function playOnce(interval) {
  if (!satBuffer) return;

  // Silencia el anterior suavemente — se desvanece y termina solo sin stop() abrupto
  if (activeGain) {
    activeGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.012);
  }

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.35, audioCtx.currentTime + 0.006);
  gain.connect(audioCtx.destination);

  const source = audioCtx.createBufferSource();
  source.buffer = satBuffer;
  source.playbackRate.value = 0.97 + Math.random() * 0.10;
  source.connect(gain);
  source.start();
  source.onended = () => { try { gain.disconnect(); } catch (_) {} };

  activeSource = source;
  activeGain   = gain;

  repeatTimer = setTimeout(() => playOnce(interval), interval);
}

function playSounds(total) {
  if (!satBuffer) return;
  stopSounds();
  const t        = total / MAX_TOTAL;
  const interval = Math.round(MAX_INTERVAL * Math.pow(MIN_INTERVAL / MAX_INTERVAL, t));
  repeatTimer = setTimeout(() => playOnce(interval), 160);
}

function stopSounds() {
  clearTimeout(repeatTimer);
  repeatTimer = null;
  if (activeGain) {
    activeGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.012);
  }
  activeSource = null;
  activeGain   = null;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
fetch('data.json')
  .then(r => r.json())
  .then(data => { buildChart(data); initEarth(); })
  .catch(err => console.error('Error loading data:', err));
