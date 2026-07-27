import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Business } from '../api.ts'
import { useStore } from '../store.ts'

/**
 * Leaflet + OpenStreetMap tiles, deliberately not the Google Maps JS SDK.
 *
 * The Maps SDK bills roughly $7 per 1000 map loads and fetches no business
 * data — it only draws the picture. Every field shown here (name, phone,
 * rating) still comes from the Places API via the server. Swapping the
 * renderer costs us nothing and takes the API key out of the browser entirely.
 *
 * CircleMarker rather than the default pin: no marker image assets to bundle,
 * and colour carries the signal.
 */

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap()
  // A new search must move the viewport; MapContainer's center is init-only.
  useEffect(() => {
    map.setView(center)
  }, [center[0], center[1], map])
  return null
}

export default function MapView({
  businesses,
  center,
}: {
  businesses: Business[]
  center: { lat: number; lng: number }
}) {
  const dark = useStore((s) => s.dark)
  const pinned = useMemo(
    () => businesses.filter((b) => b.lat != null && b.lng != null),
    [businesses],
  )
  const position: [number, number] = [center.lat, center.lng]

  return (
    <MapContainer center={position} zoom={12} scrollWheelZoom className="h-full w-full">
      <Recenter center={position} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        // Dim the tiles in dark mode so the markers stay readable.
        className={dark ? 'brightness-[0.6] contrast-[1.1] grayscale-[0.3]' : ''}
      />

      {pinned.map((b) => (
        <CircleMarker
          key={b.placeId}
          center={[b.lat!, b.lng!]}
          radius={6 + Math.min(6, b.leadScore / 20)}
          pathOptions={{
            // Colour by opportunity, not category — no website is the signal.
            color: b.website ? '#64748b' : '#f59e0b',
            fillColor: b.website ? '#94a3b8' : '#fbbf24',
            fillOpacity: 0.8,
            weight: 2,
          }}
        >
          <Popup>
            <p className="font-semibold">{b.name}</p>
            <p className="mt-0.5 text-xs">{b.address}</p>
            {b.rating != null && (
              <p className="mt-1 text-xs">
                ★ {b.rating} ({b.reviews} reviews)
              </p>
            )}
            {b.phone && <p className="mt-1 text-xs">{b.phone}</p>}
            <p className="mt-1 text-xs font-medium">
              {b.website ? 'Has website' : 'No website — opportunity'} · score {b.leadScore}
            </p>
            {b.mapsUrl && (
              <a href={b.mapsUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs underline">
                Open in Google Maps
              </a>
            )}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
