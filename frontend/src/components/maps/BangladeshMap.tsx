import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'
import type { Layer, PathOptions } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { ActivityItem } from '@/types'

// geoBoundaries ADM2 simplified for Bangladesh — pinned commit SHA resolves Git LFS correctly
const GEOJSON_URL =
  'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/BGD/ADM2/geoBoundaries-BGD-ADM2_simplified.geojson'

const CP10_DISTRICTS = new Set([
  'coxsbazar', 'bandarban', 'noakhali', 'dhaka',
  'sirajganj', 'jamalpur', 'gaibandha', 'patuakhali',
  'barguna', 'bagerhat',
])

interface Props {
  activityFeed: ActivityItem[]
  className?: string
}

function normalize(name: string) {
  return name.toLowerCase().replace(/[^a-z]/g, '')
}

export function BangladeshMap({ activityFeed, className }: Props) {
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
      const f = (layer as any).feature as GeoJSON.Feature
      const name = normalize((f.properties?.shapeName as string) ?? '')
      ;(layer as any).setStyle(districtStyle(name, districtCounts[name] ?? 0))
    })
  }, [activityFeed]) // eslint-disable-line react-hooks/exhaustive-deps

  const styleFeature = (feature?: GeoJSON.Feature): PathOptions => {
    const name = normalize((feature?.properties?.shapeName as string) ?? '')
    return districtStyle(name, districtCounts[name] ?? 0)
  }

  const onEachFeature = (feature: GeoJSON.Feature, layer: Layer) => {
    const name = (feature.properties?.shapeName as string) ?? 'Unknown'
    const count = districtCounts[normalize(name)] ?? 0
    ;(layer as any).bindTooltip?.(`${name}: ${count} submission${count !== 1 ? 's' : ''}`, {
      direction: 'top',
      className: 'leaflet-tooltip-custom',
    })
  }

  return (
    <div className={className} style={{ minHeight: 320 }}>
      {error && (
        <div className="flex h-80 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-400 text-sm">
          Map unavailable — check internet connection
        </div>
      )}
      {!error && (
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
              ref={(r) => {
                if (r) geoJsonRef.current = r
              }}
            >
            </GeoJSON>
          )}
        </MapContainer>
      )}
    </div>
  )
}
