import { MapContainer, GeoJSON, CircleMarker, Popup, Tooltip } from 'react-leaflet'
import { useEffect, useState } from 'react'
import type { PathOptions } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { FitToData } from '@/components/maps/FitToData'

const GEOJSON_URL = '/bangladesh-adm2.geojson'
const CIPRB_ORANGE = '#F96000'

export interface CampaignPoint {
  lat: number
  lng: number
  district: string
  upazila: string
  union?: string
  village?: string
  date: string | null
  households: number
  population: number
  suspected: number
}

// Dot map of community-level campaign activity, as CIPRB asked for on
// 3 Aug 2026 ("ekta map banaye kothay meeting hoise eita show kora. Dot
// mapping."). One dot per daily CHW activity report that carries GPS; the
// dot AREA scales with households visited so a heavy day reads bigger,
// while the districts behind stay a quiet base layer.
export function FistulaCampaignMap({ points }: { points: CampaignPoint[] }) {
  const [geo, setGeo] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false
    fetch(GEOJSON_URL)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setGeo(j) })
      .catch(() => { /* base layer is optional; dots still render */ })
    return () => { cancelled = true }
  }, [])

  const maxHh = Math.max(1, ...points.map((p) => p.households || 0))
  // Area-proportional radius (never linear on the radius, which exaggerates).
  const radius = (hh: number) => 5 + 11 * Math.sqrt((hh || 0) / maxHh)

  const baseStyle: PathOptions = {
    fillColor: '#F2F4F8', fillOpacity: 1, color: '#D8DEE9', weight: 0.7,
  }

  return (
    <div style={{ position: 'relative', height: 460, borderRadius: 12, overflow: 'hidden' }}>
      <MapContainer
        center={[23.8, 90.4]}
        zoom={7}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%', background: '#fff' }}
        attributionControl={false}
      >
        {geo ? <GeoJSON data={geo as never} style={() => baseStyle} /> : null}
        {points.map((p, i) => (
          <CircleMarker
            key={`${p.lat},${p.lng},${i}`}
            center={[p.lat, p.lng]}
            radius={radius(p.households)}
            pathOptions={{
              color: '#fff', weight: 1.4,
              fillColor: CIPRB_ORANGE, fillOpacity: 0.62,
            }}
          >
            <Tooltip direction="top" offset={[0, -4]}>
              <span style={{ fontSize: 12 }}>
                <b>{p.upazila || p.district}</b>
                {p.households ? ` · ${p.households.toLocaleString()} households` : ''}
              </span>
            </Tooltip>
            <Popup>
              <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                <b>{[p.village, p.union, p.upazila, p.district].filter(Boolean).join(', ')}</b>
                <br />
                {p.date ? <>Date: {p.date}<br /></> : null}
                Households visited: <b>{(p.households || 0).toLocaleString()}</b><br />
                Population covered: <b>{(p.population || 0).toLocaleString()}</b><br />
                Suspected found: <b>{p.suspected || 0}</b>
              </div>
            </Popup>
          </CircleMarker>
        ))}
        <FitToData data={geo as GeoJSON.FeatureCollection | null} />
      </MapContainer>
      <div style={{
        position: 'absolute', right: 12, bottom: 12, zIndex: 500,
        background: 'rgba(255,255,255,.94)', border: '1px solid var(--hair-2)',
        borderRadius: 9, padding: '8px 12px', fontSize: 11.5, color: 'var(--ink-2)',
      }}>
        <span style={{
          display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
          background: CIPRB_ORANGE, opacity: 0.62, marginRight: 6,
        }} />
        One dot = one CHW activity day · size = households visited
      </div>
    </div>
  )
}
