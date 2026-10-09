// The course weather: wind now (mph) and rain today (mm) in Home's header, and the Weather screen (tap it) with
// gusts, wind direction and the rest of today hour by hour. From Open-Meteo (free, no key): only the course's
// latitude and longitude are sent. One request serves both, kept for 30 minutes in memory and on the phone.
const KEEP = 30 * 60e3, STORE = 'teemate.forecast'
const HOURLY = 'wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,precipitation_probability'

export function weatherUrl(lat, lon) {
  const q = new URLSearchParams({ latitude: lat, longitude: lon, current: 'wind_speed_10m,wind_gusts_10m,wind_direction_10m',
    daily: 'precipitation_sum', hourly: HOURLY, wind_speed_unit: 'mph', timezone: 'auto', forecast_days: 1 })
  return `https://api.open-meteo.com/v1/forecast?${q}`
}

const num = Number.isFinite
const r1 = v => Math.round(v * 10) / 10

/**
 * Open-Meteo's answer → { now: { windMph, gustMph, dir, rainMm }, hours: [{ time: 'HH:MM', windMph, gustMph, dir, rainMm, rainPct }] }
 * (hours from the current one to the end of the day; dir = degrees the wind comes from), or null if it isn't the
 * shape we asked for.
 */
export function readForecast(json) {
  const c = json?.current, h = json?.hourly, rain = json?.daily?.precipitation_sum?.[0]
  if (!c || !h || !Array.isArray(h.time) || !num(c.wind_speed_10m) || !num(rain)) return null
  const thisHour = String(c.time ?? '').slice(0, 13) // 'YYYY-MM-DDTHH'
  const hours = h.time.map((t, i) => ({ t, i })).filter(({ t }) => t.slice(0, 13) >= thisHour && t.slice(0, 10) === thisHour.slice(0, 10))
    .map(({ t, i }) => ({ time: t.slice(11, 16), windMph: Math.round(h.wind_speed_10m?.[i] ?? 0), gustMph: Math.round(h.wind_gusts_10m?.[i] ?? 0),
      dir: h.wind_direction_10m?.[i] ?? 0, rainMm: r1(h.precipitation?.[i] ?? 0), rainPct: h.precipitation_probability?.[i] ?? 0 }))
  return {
    now: { windMph: Math.round(c.wind_speed_10m), gustMph: Math.round(num(c.wind_gusts_10m) ? c.wind_gusts_10m : c.wind_speed_10m),
      dir: num(c.wind_direction_10m) ? c.wind_direction_10m : 0, rainMm: Math.round(rain) },
    hours,
  }
}

/** Home's header: { windMph, rainMm }, or null. */
export function readWeather(json) {
  const f = readForecast(json) ?? readNowOnly(json)
  return f ? { windMph: f.now.windMph, rainMm: f.now.rainMm } : null
}
// (an answer without the hourly part still gives the header its two numbers)
function readNowOnly(json) {
  const wind = json?.current?.wind_speed_10m, rain = json?.daily?.precipitation_sum?.[0]
  return num(wind) && num(rain) ? { now: { windMph: Math.round(wind), rainMm: Math.round(rain) } } : null
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
/** Degrees the wind comes from → 'N' … 'NW' (8 points). */
export const compass = deg => POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]

/** A point pasted from a map app ("55.2066, -6.6519") → { lat, lon }, or null. */
export function parseLatLon(text) {
  const m = String(text).trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const lat = +m[1], lon = +m[2]
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? { lat, lon } : null
}

let kept = null // { key, at, json }
const keyOf = ({ lat, lon }) => `${lat.toFixed(2)},${lon.toFixed(2)}`
const stored = () => { try { return JSON.parse(localStorage.getItem(STORE)) } catch { return null } }

/** For tests: forget the kept forecast. */
export function forgetWeather() {
  kept = null
  try { localStorage.removeItem(STORE) } catch { /* no storage */ }
}

/** The forecast at { lat, lon } (readForecast's shape), or null (no location, service down, odd answer). Never throws. */
export async function getForecast(loc, fetchFn = fetch, now = Date.now()) {
  const json = await getJson(loc, fetchFn, now)
  return json && readForecast(json)
}

/** Home's header: { windMph, rainMm } at { lat, lon }, or null. Never throws. */
export async function getWeather(loc, fetchFn = fetch, now = Date.now()) {
  const json = await getJson(loc, fetchFn, now)
  return json && readWeather(json)
}

async function getJson(loc, fetchFn, now) {
  if (!loc || !num(loc.lat) || !num(loc.lon)) return null
  const key = keyOf(loc)
  kept ??= stored()
  if (kept?.key === key && now - kept.at < KEEP) return kept.json
  try {
    const res = await fetchFn(weatherUrl(loc.lat, loc.lon))
    const json = res.ok ? await res.json() : null
    if (!readWeather(json)) return null
    kept = { key, at: now, json }
    try { localStorage.setItem(STORE, JSON.stringify(kept)) } catch { /* no storage */ }
    return json
  } catch {
    return null
  }
}

/** Club admin → Course location: places matching what was typed (town or postcode), from Open-Meteo's place search.
 *  → [{ name, detail: 'Region, Country', lat, lon }] (up to 5). Throws if the search service can't be reached. */
export async function searchPlaces(q, fetchFn = fetch) {
  const name = q.trim()
  if (!name) return []
  const res = await fetchFn(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name, count: 5, language: 'en', format: 'json' })}`)
  if (!res.ok) throw new Error('The place search isn’t answering. Try again in a minute.')
  const { results = [] } = await res.json()
  return results.filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
    .map(r => ({ name: r.name, detail: [r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude }))
}
