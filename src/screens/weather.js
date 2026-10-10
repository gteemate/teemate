// Weather (tap the weather on Home): wind now with its direction drawn over a map of the course, and the rest of
// today hour by hour (wind, gusts, rain), to judge whether to call it a day after 9. Map: OpenStreetMap tiles
// around the course location an admin set (Club admin → Club name & colours).
import * as api from '../api.js'
import { $, esc, header } from '../ui.js'
import { S } from '../state.js'
import { getForecast, compass } from '../weather.js'

export async function load() {
  const theme = await api.getTheme()
  const loc = theme?.courseLat != null ? { lat: theme.courseLat, lon: theme.courseLon, place: theme.coursePlace } : null
  return { loc, forecast: loc ? await getForecast(loc) : null }
}

const Z = 15, ZMIN = 11, ZMAX = 17 // map zoom: 15 is about a mile across, a course; − zooms out to the area around it
/** The 3×3 tiles around a point, and where the point sits in that block (0–1). */
export function tileBlock(lat, lon, z = Z) {
  const n = 2 ** z, rad = lat * Math.PI / 180
  const fx = (lon + 180) / 360 * n, fy = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n
  const x0 = Math.floor(fx) - 1, y0 = Math.floor(fy) - 1
  return { tiles: [0, 1, 2].flatMap(r => [0, 1, 2].map(c => ({ x: x0 + c, y: y0 + r, url: `https://tile.openstreetmap.org/${z}/${x0 + c}/${y0 + r}.png` }))),
    px: (fx - x0) / 3, py: (fy - y0) / 3 }
}

// An arrow pointing the way the wind blows. Unturned it points down (south), the way a wind from the north (0°)
// blows, so it turns by the degrees the wind comes from.
const arrow = (dir, size, cls = '') => `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" style="transform:rotate(${dir}deg)" aria-hidden="true"><path d="M12 2v18M5 13l7 7 7-7"/></svg>`

export function draw({ loc, forecast: f }) {
  header('Weather', loc ? esc(loc.place || 'At the course') : 'Course weather')
  if (!loc || !f) {
    $('main').innerHTML = `<div class="screen"><div class="empty-state">${loc ? 'The weather isn’t available just now. Try again in a few minutes.' : 'No course location set yet. An admin can set it in Account → Club name &amp; colours.'}</div></div>`
    return
  }
  const z = S.wxZoom ?? Z
  const { tiles, px, py } = tileBlock(loc.lat, loc.lon, z)
  const wet = f.hours.some(h => h.rainMm > 0)
  $('main').innerHTML = `<div class="screen wxs">
    <div class="card wxnow">
      <div class="wxbig">${arrow(f.now.dir, 44)}<span><b class="num">${f.now.windMph}</b> mph</span></div>
      <div class="wxfacts"><span>From the <b>${compass(f.now.dir)}</b></span><span>Gusts <b class="num">${f.now.gustMph}</b> mph</span><span>Rain today <b class="num">${f.now.rainMm}</b> mm</span></div>
    </div>
    <span class="kicker">Wind on the course</span>
    <div class="wxmap" role="img" aria-label="Map of the course with the wind blowing from the ${compass(f.now.dir)}">
      <div class="wxtiles" style="left:${50 - px * 300}%;top:${50 - py * 300}%">${tiles.map(t => `<img src="${t.url}" alt="" onerror="this.style.visibility='hidden'">`).join('')}</div>
      ${arrow(f.now.dir, 120, 'wxarrow')}
      <div class="wxzoom"><button type="button" id="wx-in" aria-label="Zoom in" ${z >= ZMAX ? 'disabled' : ''}>+</button><button type="button" id="wx-out" aria-label="Zoom out" ${z <= ZMIN ? 'disabled' : ''}>−</button></div>
      <span class="wxcredit">© OpenStreetMap contributors</span>
    </div>
    <span class="kicker">The rest of today</span>
    <div class="card list wxhours">${f.hours.length ? f.hours.map(h => `<div class="wxrow${h.rainMm > 0 ? ' wet' : ''}">
        <span class="num">${h.time}</span><span class="wxw">${arrow(h.dir, 18)}<b class="num">${h.windMph}</b> mph <small>gusts ${h.gustMph}</small></span>
        <span class="wxr"><b class="num">${h.rainMm}</b> mm <small>${h.rainPct}%</small></span></div>`).join('') : '<div class="empty-state">That’s the end of the day.</div>'}</div>
    <span class="hint">${wet ? 'Shaded hours have rain forecast. ' : 'No rain forecast for the rest of today. '}Forecast from Open-Meteo, updated every 30 minutes.</span>
  </div>`
  // Zoom the map out (the area around the course) or back in; the arrow stays in the middle.
  const zoom = d => { S.wxZoom = Math.min(ZMAX, Math.max(ZMIN, z + d)); draw({ loc, forecast: f }) }
  $('wx-in').onclick = () => zoom(1)
  $('wx-out').onclick = () => zoom(-1)
}
