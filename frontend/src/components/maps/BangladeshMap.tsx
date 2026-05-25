import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup } from 'react-leaflet'
import type { Layer, PathOptions } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { ActivityItem, ServiceCenter } from '@/types'
import { useState } from 'react'

// GeoJSON bundled in frontend/public — avoids GitHub LFS CDN CORS issues
const GEOJSON_URL = '/bangladesh-adm2.geojson'

const CP10_DISTRICTS = new Set([
  'coxsbazar', 'bandarban', 'noakhali', 'dhaka',
  'sirajganj', 'jamalpur', 'gaibandha', 'patuakhali',
  'barguna', 'bagerhat',
])

const CENTER_COLORS: Record<string, string> = {
  DIC: '#7c3aed',
  BROTHEL: '#00658C',
  SUB_DIC: '#059669',
  MOBILE: '#d97706',
}

interface Props {
  activityFeed: ActivityItem[]
  centers?: ServiceCenter[]
  className?: string
}

function normalize(name: string) {
  return name.toLowerCase().replace(/[^a-z]/g, '')
}

export function BangladeshMap({ activityFeed, centers = [], className }: Props) {
  const [geoData, setGeoData] = useState<GeoJSON.FeatureCollection | null>(null)
  const [error, setError] = useState(false)
  const geoJsonRef = useRef<L.GeoJSON | null>(null)

  // Count submissions per district
  const districtCounts: Record<string, number> = {}
  for (const item of activityFeed) {
    const key = normalize(item.district)
    districtCounts[key] = (districtCounts[key] ?? 0) + 1
  }

  const maxCount = Math.max(1, ...Object.values(districtCounts))

  useEffect(() => {
    fetch(GEOJSON_URL)
      .then((r) => {
        if (!r.ok) throw new Error('GeoJSON fetch failed')
        return r.json()
      })
      .then((data) => setGeoData(data))
      .catch(() => setError(true))
  }, [])

  function districtStyle(name: string, count: number): PathOptions {
    if (count > 0) return { fillColor: '#00658C', fillOpacity: 0.3 + (count / maxCount) * 0.6, color: '#004A66', weight: 0.5 }
    if (CP10_DISTRICTS.has(name)) return { fillColor: '#f59e0b', fillOpacity: 0.25, color: '#004A66', weight: 0.5 }
    return { fillColor: '#94a3b8', fillOpacity: 0.08, color: '#004A66', weight: 0.5 }
  }

  // Re-style when activityFeed changes
  useEffect(() => {
    if (!geoJsonRef.current) return
    geoJsonRef.current.eachLayer((layer: Layer) => {
      const f = (layer as unknown as { feature: GeoJSON.Feature }).feature
      const name = normalize((f.properties?.shapeName as string) ?? '')
      ;(layer as unknown as { setStyle: (s: PathOptions) => void }).setStyle(
        districtStyle(name, districtCounts[name] ?? 0)
      )
    })
  }, [activityFeed]) // eslint-disable-line react-hooks/exhaustive-deps

  const styleFeature = (feature?: GeoJSON.Feature): PathOptions => {
    const name = normalize((feature?.properties?.shapeName as string) ?? '')
    return districtStyle(name, districtCounts[name] ?? 0)
  }

  const onEachFeature = (feature: GeoJSON.Feature, layer: Layer) => {
    const name = (feature.properties?.shapeName as string) ?? 'Unknown'
    const count = districtCounts[normalize(name)] ?? 0
    ;(layer as unknown as { bindTooltip: (s: string, o: object) => void }).bindTooltip(
      `${name}: ${count} submission${count !== 1 ? 's' : ''}`,
      { direction: 'top', className: 'leaflet-tooltip-custom' }
    )
  }

  const mappableCenters = centers.filter(
    (c) => c.latitude !== null && c.longitude !== null
  )

  return (
    <div className={className}>
      {error && (
        <div className="flex h-80 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-400 text-sm">
          Map unavailable — check internet connection
        </div>
      )}
      {!error && (
        <>
          <MapContainer
            center={[23.7, 90.4]}
            zoom={6}
            scrollWheelZoom={false}
            className="h-80 w-full rounded-xl"
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              opacity={0.35}
            />
            {geoData && (
              <GeoJSON
                key={JSON.stringify(districtCounts)}
                data={geoData}
                style={styleFeature}
                onEachFeature={onEachFeature}
                ref={(r) => { if (r) geoJsonRef.current = r }}
              />
            )}
            {/* Service center markers */}
            {mappableCenters.map((c) => (
              <CircleMarker
                key={c.id}
                center={[c.latitude!, c.longitude!]}
                radius={7}
                pathOptions={{
                  fillColor: CENTER_COLORS[c.center_type] ?? '#6b7280',
                  fillOpacity: 0.9,
                  color: '#fff',
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="text-sm">
                    <p className="font-semibold">{c.name}</p>
                    {c.name_bangla && <p className="font-bangla text-xs text-gray-500">{c.name_bangla}</p>}
                    <p className="mt-1 text-xs text-gray-600">{c.center_type} · {c.district}</p>
                    <p className="text-xs text-gray-500">{c.organisation}</p>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
          {/* Map legend */}
          {mappableCenters.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-gray-500 dark:text-gray-400">
              {Object.entries(CENTER_COLORS).map(([type, color]) => (
                <span key={type} className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                  {type}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
