// The course weather in Home's header: wind now (mph) and rain expected today (mm), from Open-Meteo (free, no key).
// Only the course's latitude and longitude are sent. Kept for 30 minutes, in memory and on the phone.
const KEEP = 30 * 60e3, STORE = 'teemate.weather'

export function weatherUrl(lat, lon) {
  const q = new URLSearchParams({ latitude: lat, longitude: lon, current: 'wind_speed_10m', daily: 'precipitation_sum',
    wind_speed_unit: 'mph', timezone: 'auto', forecast_days: 1 })
  return `https://api.open-meteo.com/v1/forecast?${q}`
}

/** Open-Meteo's answer → { windMph, rainMm } (rounded), or null if it isn't the shape we asked for. */
export function readWeather(json) {
  const wind = json?.current?.wind_speed_10m, rain = json?.daily?.precipitation_sum?.[0]
  if (!Number.isFinite(wind) || !Number.isFinite(rain)) return null
  return { windMph: Math.round(wind), rainMm: Math.round(rain) }
}

let kept = null // { key, at, value }
const keyOf = ({ lat, lon }) => `${lat.toFixed(2)},${lon.toFixed(2)}`
const stored = () => { try { return JSON.parse(localStorage.getItem(STORE)) } catch { return null } }

/** For tests: forget the kept weather. */
export function forgetWeather() {
  kept = null
  try { localStorage.removeItem(STORE) } catch { /* no storage */ }
}

/** The weather at { lat, lon }, or null (no location, service down, odd answer). Never throws. */
export async function getWeather(loc, fetchFn = fetch, now = Date.now()) {
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return null
  const key = keyOf(loc)
  kept ??= stored()
  if (kept?.key === key && now - kept.at < KEEP) return kept.value
  try {
    const res = await fetchFn(weatherUrl(loc.lat, loc.lon))
    const value = res.ok ? readWeather(await res.json()) : null
    if (!value) return null
    kept = { key, at: now, value }
    try { localStorage.setItem(STORE, JSON.stringify(kept)) } catch { /* no storage */ }
    return value
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
