/**
 * Google caps any single search at 60 results. A 50 km radius over a city
 * therefore returns 60 businesses and silently hides thousands.
 *
 * Fix: cover the search circle with a grid of smaller overlapping circles and
 * search each one. Every tile gets its own 60-result budget, so coverage scales
 * with tile count instead of being pinned at 60.
 *
 * Cost scales linearly with tiles — this is the single most expensive knob in
 * the app, which is why the cost meter reads from the same tile count.
 */

export interface Tile {
  lat: number
  lng: number
  radiusMeters: number
}

const EARTH_R = 6371 // km

/**
 * Hex-packed centers covering a circle. Rows are offset by half a step and
 * spaced by sqrt(3)/2, which is the tightest packing that still leaves the
 * gaps between three adjacent circles covered.
 */
export function tileCircle(
  lat: number,
  lng: number,
  radiusKm: number,
  tileRadiusKm: number,
): Tile[] {
  // One tile is enough when it already covers the whole request.
  if (tileRadiusKm >= radiusKm) {
    return [{ lat, lng, radiusMeters: Math.round(radiusKm * 1000) }]
  }

  // 1.5 < sqrt(3) — deliberate overlap so nothing falls between tiles.
  const step = tileRadiusKm * 1.5
  const rowStep = step * (Math.sqrt(3) / 2)
  const rows = Math.ceil(radiusKm / rowStep)

  const tiles: Tile[] = []
  for (let row = -rows; row <= rows; row++) {
    const dLat = row * rowStep
    const offset = row % 2 === 0 ? 0 : step / 2
    const cols = Math.ceil(radiusKm / step)
    for (let col = -cols; col <= cols; col++) {
      const dLng = col * step + offset
      // Skip tiles whose centre is well outside the requested circle. The
      // tolerance keeps edge tiles that still overlap the boundary.
      if (Math.hypot(dLat, dLng) > radiusKm + tileRadiusKm * 0.5) continue
      tiles.push({
        lat: lat + kmToLat(dLat),
        lng: lng + kmToLng(dLng, lat),
        radiusMeters: Math.round(tileRadiusKm * 1000),
      })
    }
  }
  return tiles
}

/** How many tiles a request will produce, without building them. */
export function tileCount(radiusKm: number, tileRadiusKm: number): number {
  return tileCircle(0, 0, radiusKm, tileRadiusKm).length
}

const kmToLat = (km: number) => (km / EARTH_R) * (180 / Math.PI)

const kmToLng = (km: number, atLat: number) =>
  (km / (EARTH_R * Math.cos((atLat * Math.PI) / 180))) * (180 / Math.PI)
