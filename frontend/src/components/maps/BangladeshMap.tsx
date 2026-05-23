import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'
import type { Layer, PathOptions } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { ActivityItem } from '@/types'

// geoBoundaries ADM2 simplified for Bangladesh
const GEOJSON_URL =
  'https://raw.githubusercontent.com/wmgeolab/geoBoundaries/main/releaseData/gbOpen/BGD/ADM2/geoBoundaries-BGD-ADM2_simplified.geojson'

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

  // Re-style when activityFeed changes
  useEffect(() => {
    if (!geoJsonRef.current) return
    geoJsonRef.current.eachLayer((layer: Layer) => {
      const f = (layer as any).feature as GeoJSON.Feature
      const name = normalize((f.properties?.shapeName as string) ?? '')
      const count = districtCounts[name] ?? 0
      const opacity = count > 0 ? 0.3 + (count / maxCount) * 0.6 : 0.08
      ;(layer as any).setStyle({
        fillColor: count > 0 ? '#00658C' : '#94a3b8',
        fillOpacity: opacity,
        color: '#004A66',
        weight: 0.5,
      })
    })
  }, [activityFeed]) // eslint-disable-line react-hooks/exhaustive-deps

  const styleFeature = (feature?: GeoJSON.Feature): PathOptions => {
    const name = normalize((feature?.properties?.shapeName as string) ?? '')
    const count = districtCounts[name] ?? 0
    const opacity = count > 0 ? 0.3 + (count / maxCount) * 0.6 : 0.08
    return {
      fillColor: count > 0 ? '#00658C' : '#94a3b8',
      fillOpacity: opacity,
      color: '#004A66',
      weight: 0.5,
    }
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
