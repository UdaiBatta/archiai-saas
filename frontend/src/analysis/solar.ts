/**
 * Solar position: the NOAA solar calculator's algorithm (after Meeus,
 * "Astronomical Algorithms"), good to ~0.01° in declination and a few
 * seconds in the equation of time for 1800-2100. Pure, no deps.
 *
 * Angles in degrees. Azimuth is measured from north, clockwise (90 = east).
 * Times are decimal hours. Without a UTC offset, `hour` is local apparent
 * solar time (12:00 = the sun due south/north); with one, it is clock time.
 * Altitudes are geometric (no refraction); sunrise/sunset use the standard
 * -0.833° (refraction + the sun's radius), as published tables do.
 */

const rad = Math.PI / 180
const sin = (d: number) => Math.sin(d * rad)
const cos = (d: number) => Math.cos(d * rad)

export interface SolarPosition {
  altitude: number
  azimuth: number
}

export interface Where {
  lat: number
  lon: number
  /** 'YYYY-MM-DD' */
  date: string
}

/** Julian day at 00:00 UTC of a 'YYYY-MM-DD' date. */
export function julianDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86400000 + 2440587.5
}

/** Sun's declination (°) and the equation of time (minutes) at a Julian day. */
export function sunCoordinates(jd: number): { declination: number; equationOfTime: number } {
  const T = (jd - 2451545) / 36525
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
  const C = sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) + sin(2 * M) * (0.019993 - 0.000101 * T) + sin(3 * M) * 0.000289
  const omega = 125.04 - 1934.136 * T
  const lambda = L0 + C - 0.00569 - 0.00478 * sin(omega)
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
  const eps = eps0 + 0.00256 * cos(omega)
  const declination = Math.asin(sin(eps) * sin(lambda)) / rad
  const y = Math.tan((eps / 2) * rad) ** 2
  const eot =
    y * sin(2 * L0) - 2 * e * sin(M) + 4 * e * y * sin(M) * cos(2 * L0) - 0.5 * y * y * sin(4 * L0) - 1.25 * e * e * sin(2 * M)
  return { declination, equationOfTime: (4 * eot) / rad }
}

/** Hour angle (°) → local apparent solar time and back; utcOffset switches to clock time. */
function hourAngle(where: Where, hour: number, utcOffset?: number) {
  if (utcOffset === undefined) {
    const { declination } = sunCoordinates(julianDay(where.date) + (hour - where.lon / 15) / 24)
    return { ha: (hour - 12) * 15, declination }
  }
  const { declination, equationOfTime } = sunCoordinates(julianDay(where.date) + (hour - utcOffset) / 24)
  const trueSolarMinutes = hour * 60 + equationOfTime + 4 * where.lon - 60 * utcOffset
  return { ha: trueSolarMinutes / 4 - 180, declination }
}

export function solarPosition(where: Where, hour: number, utcOffset?: number): SolarPosition {
  const { ha, declination: d } = hourAngle(where, hour, utcOffset)
  const lat = where.lat
  const sinAlt = sin(lat) * sin(d) + cos(lat) * cos(d) * cos(ha)
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / rad
  const azimuth = (Math.atan2(sin(ha), cos(ha) * sin(lat) - Math.tan(d * rad) * cos(lat)) / rad + 180 + 360) % 360
  return { altitude, azimuth }
}

/**
 * Sunrise and sunset in decimal hours (solar time, or clock time with a UTC
 * offset). Polar day gives 0..24, polar night 12..12.
 */
export function sunriseSunset(where: Where, utcOffset?: number): { sunrise: number; sunset: number } {
  const noonJd = julianDay(where.date) + (12 - where.lon / 15) / 24
  const { declination: d, equationOfTime } = sunCoordinates(noonJd)
  const cosH = (cos(90.833) - sin(where.lat) * sin(d)) / (cos(where.lat) * cos(d))
  const H = cosH <= -1 ? 180 : cosH >= 1 ? 0 : Math.acos(cosH) / rad
  const noon = utcOffset === undefined ? 12 : (720 - 4 * where.lon - equationOfTime) / 60 + utcOffset
  return { sunrise: noon - H / 15, sunset: noon + H / 15 }
}

/** Unit vector toward the sun in plan space: x = east, y = up, z = south. */
export function sunVector({ altitude, azimuth }: SolarPosition): [number, number, number] {
  const c = cos(altitude)
  return [c * sin(azimuth), sin(altitude), -c * cos(azimuth)]
}
