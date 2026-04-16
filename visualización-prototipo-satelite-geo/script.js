// ── Colour scale (5 levels, light → dark blue) ──────────────────────────────
function getColor(count) {
  if (!count) return '#dde3ef';
  if (count > 1000) return '#08306b';
  if (count > 100)  return '#2171b5';
  if (count > 30)   return '#6baed6';
  if (count > 10)   return '#c6dbef';
                    return '#e8f0f8';
}

// ── ISO numeric → UCS country name ───────────────────────────────────────────
const ISO_TO_NAME = {
  "004": "Afghanistan",
  "024": "Angola",
  "032": "Argentina",
  "036": "Australia",
  "040": "Austria",
  "050": "Bangladesh",
  "056": "Belgium",
  "068": "Bolivia",
  "076": "Brazil",
  "100": "Bulgaria",
  "124": "Canada",
  "152": "Chile",
  "156": "China",
  "170": "Colombia",
  "208": "Denmark",
  "218": "Ecuador",
  "818": "Egypt",
  "233": "Estonia",
  "246": "Finland",
  "250": "France",
  "276": "Germany",
  "300": "Greece",
  "348": "Hungary",
  "356": "India",
  "360": "Indonesia",
  "364": "Iran",
  "368": "Iraq",
  "376": "Israel",
  "380": "Italy",
  "392": "Japan",
  "400": "Jordan",
  "398": "Kazakhstan",
  "404": "Kenya",
  "414": "Kuwait",
  "418": "Laos",
  "440": "Lithuania",
  "442": "Luxembourg",
  "458": "Malaysia",
  "484": "Mexico",
  "492": "Monaco",
  "524": "Nepal",
  "528": "Netherlands",
  "554": "New Zealand",
  "566": "Nigeria",
  "578": "Norway",
  "586": "Pakistan",
  "604": "Peru",
  "616": "Poland",
  "643": "Russia",
  "682": "Saudi Arabia",
  "702": "Singapore",
  "705": "Slovenia",
  "710": "South Africa",
  "410": "South Korea",
  "724": "Spain",
  "729": "Sudan",
  "752": "Sweden",
  "756": "Switzerland",
  "158": "Taiwan",
  "764": "Thailand",
  "788": "Tunisia",
  "792": "Turkey",
  "804": "Ukraine",
  "784": "United Arab Emirates",
  "826": "United Kingdom",
  "840": "USA",
  "862": "Venezuela",
  "704": "Vietnam"
};

// ── Data processing ───────────────────────────────────────────────────────────
function processSatelliteData(records) {
  const lookup = {};
  records.forEach(d => { lookup[d.Name] = d.count; });
  return lookup;
}

// ── Legend ────────────────────────────────────────────────────────────────────
function addLegend() {
  const levels = [
    { label: '> 1 000',    color: '#08306b' },
    { label: '101 – 1 000', color: '#2171b5' },
    { label: '31 – 100',   color: '#6baed6' },
    { label: '11 – 30',    color: '#c6dbef' },
    { label: '1 – 10',     color: '#e8f0f8' },
    { label: 'Sin datos',  color: '#dde3ef' },
  ];

  const div = document.createElement('div');
  div.className = 'legend';

  const title = document.createElement('div');
  title.className = 'legend-title';
  title.textContent = 'Satélites';
  div.appendChild(title);

  levels.forEach(({ label, color }) => {
    const row = document.createElement('div');
    row.className = 'legend-item';
    row.innerHTML = `<div class="legend-swatch" style="background:${color}"></div><span>${label}</span>`;
    div.appendChild(row);
  });

  document.body.appendChild(div);
}

// ── Map ───────────────────────────────────────────────────────────────────────
function initializeMap(satelliteData) {
  const wrap = document.getElementById('map');
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;

  const svg = d3.select('#map').append('svg')
    .attr('width', W)
    .attr('height', H);

  const projection = d3.geoNaturalEarth1()
    .scale(W / 5.8)
    .translate([W / 2, H / 2]);

  const path = d3.geoPath().projection(projection);

  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
    .then(r => r.json())
    .then(world => {
      const countries = topojson.feature(world, world.objects.countries);

      svg.selectAll('path')
        .data(countries.features)
        .enter().append('path')
        .attr('d', path)
        .attr('fill', d => {
          const code  = String(d.id).padStart(3, '0');
          const name  = ISO_TO_NAME[code];
          const count = name ? (satelliteData[name] || 0) : 0;
          return getColor(count);
        })
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 0.5);
    });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
Promise.all([
  fetch('data.json').then(r => r.json())
]).then(([records]) => {
  const satelliteData = processSatelliteData(records);
  initializeMap(satelliteData);
  addLegend();
}).catch(err => console.error('Error loading data:', err));
