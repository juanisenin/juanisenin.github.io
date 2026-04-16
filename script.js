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
  g.append('text')
    .attr('x', aLabelX + 14).attr('y', aLabelY + 28)
    .attr('font-size', 11)
    .attr('font-family', 'Segoe UI, system-ui, sans-serif')
    .attr('fill', '#e05c2a')
    .attr('font-weight', '500')
    .text('Inicio de');
  g.append('text')
    .attr('x', aLabelX + 14).attr('y', aLabelY + 42)
    .attr('font-size', 11)
    .attr('font-family', 'Segoe UI, system-ui, sans-serif')
    .attr('fill', '#e05c2a')
    .attr('font-weight', '500')
    .text('lanzamientos')

    g.append('text')
    .attr('x', aLabelX + 14).attr('y', aLabelY + 56)
    .attr('font-size', 11)
    .attr('font-family', 'Segoe UI, system-ui, sans-serif')
    .attr('fill', '#e05c2a')
    .attr('font-weight', '500')
    .text('Starlink')

  
    ;

  // Axis labels
  g.append('text')
    .attr('class', 'axis-label')
    .attr('text-anchor', 'middle')
    .attr('x', w / 2)
    .attr('y', h + 48);

  g.append('text')
    .attr('class', 'axis-label')
    .attr('text-anchor', 'middle')
    .attr('transform', `translate(-52, ${h / 2}) rotate(-90)`)
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
fetch('data.json')
  .then(r => r.json())
  .then(data => buildChart(data))
  .catch(err => console.error('Error loading data:', err));
