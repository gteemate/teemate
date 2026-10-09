import { describe, it, expect, vi, beforeEach } from 'vitest'
import { weatherUrl, readWeather, getWeather, forgetWeather, readForecast, getForecast, compass, parseLatLon } from './weather.js'

// An Open-Meteo answer at 14:00 (course local time): hourly from midnight, rain in the 16:00 hour.
const HRS = Array.from({ length: 24 }, (_, h) => `2026-10-10T${String(h).padStart(2, '0')}:00`)
const ok = (wind = 13.6, rain = 2.24) => ({
  current: { time: '2026-10-10T14:15', wind_speed_10m: wind, wind_gusts_10m: 21.7, wind_direction_10m: 225 },
  daily: { precipitation_sum: [rain] },
  hourly: { time: HRS, wind_speed_10m: HRS.map((_, h) => 10 + h / 2), wind_gusts_10m: HRS.map(() => 20.4), wind_direction_10m: HRS.map(() => 230),
    precipitation: HRS.map((_, h) => (h === 16 ? 1.6 : 0)), precipitation_probability: HRS.map((_, h) => (h === 16 ? 80 : 10)) },
})
const fetchOf = json => vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(json) }))
const LOC = { lat: 55.2, lon: -6.6 }

describe('weatherUrl', () => {
  it('asks Open-Meteo for wind now and rain today at the course', () => {
    const u = weatherUrl(55.2, -6.6)
    expect(u.startsWith('https://api.open-meteo.com/v1/forecast?')).toBe(true)
    for (const p of ['latitude=55.2', 'longitude=-6.6', 'current=wind_speed_10m', 'daily=precipitation_sum', 'wind_speed_unit=mph', 'timezone=auto', 'forecast_days=1'])
      expect(u).toContain(p)
  })
})

describe('readWeather', () => {
  it('rounds wind (mph) and rain (mm)', () => expect(readWeather(ok())).toEqual({ windMph: 14, rainMm: 2 }))
  it('a trace of rain is 0', () => expect(readWeather(ok(5, 0.04)).rainMm).toBe(0))
  it('anything odd: null', () => {
    expect(readWeather({})).toBeNull()
    expect(readWeather(null)).toBeNull()
    expect(readWeather({ current: { wind_speed_10m: 'x' }, daily: { precipitation_sum: [] } })).toBeNull()
  })
})

describe('getWeather', () => {
  beforeEach(() => forgetWeather())
  it('no course location: null, nothing fetched', async () => {
    const f = fetchOf(ok())
    expect(await getWeather(null, f)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })
  it('the weather service is down: null', async () => {
    expect(await getWeather(LOC, () => Promise.reject(new Error('down')))).toBeNull()
  })
  it('a bad answer from the service: null', async () => {
    expect(await getWeather(LOC, () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }))).toBeNull()
  })
  it('kept for 30 minutes, then fetched again', async () => {
    const f = fetchOf(ok()), t = 1_000_000
    expect(await getWeather(LOC, f, t)).toEqual({ windMph: 14, rainMm: 2 })
    await getWeather(LOC, f, t + 29 * 60e3)
    expect(f).toHaveBeenCalledTimes(1)
    await getWeather(LOC, f, t + 31 * 60e3)
    expect(f).toHaveBeenCalledTimes(2)
  })
})

import { searchPlaces } from './weather.js'
describe('searchPlaces (Club admin → Course location)', () => {
  it('names, where they are, and the map point', async () => {
    const f = fetchOf({ results: [{ name: 'Portrush', admin1: 'Northern Ireland', country: 'United Kingdom', latitude: 55.2, longitude: -6.65 }] })
    expect(await searchPlaces(' Portrush ', f)).toEqual([{ name: 'Portrush', detail: 'Northern Ireland, United Kingdom', lat: 55.2, lon: -6.65 }])
    expect(f.mock.calls[0][0]).toContain('geocoding-api.open-meteo.com/v1/search?name=Portrush&count=5')
  })
  it('nothing found: an empty list', async () => expect(await searchPlaces('zzqx', fetchOf({}))).toEqual([]))
  it('nothing typed: nothing asked', async () => {
    const f = fetchOf({})
    expect(await searchPlaces('  ', f)).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })
})

describe('readForecast: the Weather screen', () => {
  it('now: wind, gusts, where it comes from, rain today', () =>
    expect(readForecast(ok()).now).toEqual({ windMph: 14, gustMph: 22, dir: 225, rainMm: 2 }))
  it('hour by hour from this hour to the end of the day', () => {
    const { hours } = readForecast(ok())
    expect(hours.map(h => h.time)).toEqual(['14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'])
    expect(hours[0]).toEqual({ time: '14:00', windMph: 17, gustMph: 20, dir: 230, rainMm: 0, rainPct: 10 })
    expect(hours[2]).toMatchObject({ rainMm: 1.6, rainPct: 80 })
  })
  it('no hourly part: null', () => { const j = ok(); delete j.hourly; expect(readForecast(j)).toBeNull() })
  it('the header uses the same answer', () => expect(readWeather(ok())).toEqual({ windMph: 14, rainMm: 2 }))
})

describe('compass: where the wind comes from', () => {
  it('8 points', () => {
    expect(compass(225)).toBe('SW')
    expect(compass(359)).toBe('N')
    expect(compass(22.4)).toBe('N')
    expect(compass(22.6)).toBe('NE')
    expect(compass(90)).toBe('E')
  })
})

describe('parseLatLon: a point pasted from a map app', () => {
  it('two numbers', () => expect(parseLatLon(' 55.2066, -6.6519 ')).toEqual({ lat: 55.2066, lon: -6.6519 }))
  it('a place name or a point off the map: null', () => {
    expect(parseLatLon('Portrush')).toBeNull()
    expect(parseLatLon('95, 0')).toBeNull()
    expect(parseLatLon('55.2')).toBeNull()
  })
})

describe('getForecast', () => {
  beforeEach(() => forgetWeather())
  it('one request serves the header and the Weather screen', async () => {
    const f = fetchOf(ok())
    expect((await getForecast(LOC, f)).hours.length).toBe(10)
    expect(await getWeather(LOC, f)).toEqual({ windMph: 14, rainMm: 2 })
    expect(f).toHaveBeenCalledTimes(1)
  })
})
