import { describe, it, expect, vi, beforeEach } from 'vitest'
import { weatherUrl, readWeather, getWeather, forgetWeather } from './weather.js'

const ok = (wind = 13.6, rain = 2.24) => ({ current: { wind_speed_10m: wind }, daily: { precipitation_sum: [rain] } })
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
