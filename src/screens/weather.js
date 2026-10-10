// Weather (tap the weather on Home): wind now with its direction drawn over a map of the course, and the rest of
// today hour by hour (wind, gusts, rain), to judge whether to call it a day after 9. Map: OpenStreetMap around the
// course location an admin set (Club admin → Club name & colours), which you can drag and zoom.
import * as api from '../api.js'
import { $, esc, header } from '../ui.js'
import { getForecast, compass } from '../weather.js'

export async function load() {
  const theme = await api.getTheme()
  const loc = theme?.courseLat != null ? { lat: theme.courseLat, lon: theme.courseLon, place: theme.coursePlace } : null
  return { loc, forecast: loc ? await getForecast(loc) : null }
}

// The course map (OpenStreetMap through Leaflet): drag to look around, pinch or +/− to zoom, a pin on the course.
// The wind arrow sits over the middle of the map (the wind is the same across it).
let map = null
async function showMap(loc) {
  // Loaded only here, so the rest of the app stays quick to open.
  const [{ default: L }] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
  if (!document.getElementById('wxleaf')) return // left the screen meanwhile
  map?.remove()
  map = L.map('wxleaf', { zoomControl: true, attributionControl: true, minZoom: 9, maxZoom: 18 }).setView([loc.lat, loc.lon], 15)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map)
  L.circleMarker([loc.lat, loc.lon], { radius: 7, color: '#e3c375', weight: 3, fillColor: '#141f3b', fillOpacity: 1 }).addTo(map)
}

// An arrow pointing the way the wind blows. Unturned it points down (south), the way a wind from the north (0°)
// blows, so it turns by the degrees the wind comes from.
const arrow = (dir, size, cls = '') => `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" style="transform:rotate(${dir}deg)" aria-hidden="true"><path d="M12 2v18M5 13l7 7 7-7"/></svg>`

// Lots of small arrows over the whole map, every one pointing the way the wind blows (the wind is the same across
// a course). One arrow, repeated as an SVG pattern turned to the wind; staggered rows so it doesn't look like a grid.
const windField = dir => `<svg class="wxfield" aria-hidden="true"><defs>
  <pattern id="wxp" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(${dir})">
    <path d="M11 4v14M7 13l4 5 4-5" /><path d="M33 26v14M29 35l4 5 4-5" />
  </pattern></defs><rect width="100%" height="100%" fill="url(#wxp)" /></svg>`

export function draw({ loc, forecast: f }) {
  header('Weather', loc ? esc(loc.place || 'At the course') : 'Course weather')
  if (!loc || !f) {
    $('main').innerHTML = `<div class="screen"><div class="empty-state">${loc ? 'The weather isn’t available just now. Try again in a few minutes.' : 'No course location set yet. An admin can set it in Account → Club name &amp; colours.'}</div></div>`
    return
  }
  const wet = f.hours.some(h => h.rainMm > 0)
  $('main').innerHTML = `<div class="screen wxs">
    <div class="card wxnow">
      <div class="wxbig">${arrow(f.now.dir, 44)}<span><b class="num">${f.now.windMph}</b> mph</span></div>
      <div class="wxfacts"><span>From the <b>${compass(f.now.dir)}</b></span><span>Gusts <b class="num">${f.now.gustMph}</b> mph</span><span>Rain today <b class="num">${f.now.rainMm}</b> mm</span></div>
    </div>
    <span class="kicker">Wind on the course</span>
    <div class="wxmap" role="img" aria-label="Map of the course with the wind blowing from the ${compass(f.now.dir)}">
      <div id="wxleaf" class="wxleaf"></div>
      ${windField(f.now.dir)}
    </div>
    <span class="hint">Drag the map to look around; pinch or use + and − to zoom. The arrows show which way the wind is blowing.</span>
    <span class="kicker">The rest of today</span>
    <div class="card list wxhours">${f.hours.length ? f.hours.map(h => `<div class="wxrow${h.rainMm > 0 ? ' wet' : ''}">
        <span class="num">${h.time}</span><span class="wxw">${arrow(h.dir, 18)}<b class="num">${h.windMph}</b> mph <small>gusts ${h.gustMph}</small></span>
        <span class="wxr"><b class="num">${h.rainMm}</b> mm <small>${h.rainPct}%</small></span></div>`).join('') : '<div class="empty-state">That’s the end of the day.</div>'}</div>
    <span class="hint">${wet ? 'Shaded hours have rain forecast. ' : 'No rain forecast for the rest of today. '}Forecast from Open-Meteo, updated every 30 minutes.</span>
  </div>`
  showMap(loc)
}
