import { MapContainer, GeoJSON, CircleMarker, Popup, Tooltip } from 'react-leaflet'
import { useEffect, useMemo, useState } from 'react'
import type { PathOptions } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { FitToData } from '@/components/maps/FitToData'
import CENTROIDS from '@/data/upazilaCentroids.json'

const GEOJSON_URL = '/bangladesh-adm2.geojson'
const CIPRB_ORANGE = '#F96000'

export interface CampaignUpazila {
  key: string
  dkey: string
  district: string
  upazila: string
  spellings: string[]
  reports: number
  households: number
  population: number
  suspected: number
  confirmed: number
  referred: number
  gps_lat: number | null
  gps_lng: number | null
  gps_rows: number
  date_from: string | null
  date_to: string | null
}

type Lookup = { upazilas: Record<string, [number, number]>; districts: Record<string, [number, number]> }
const LOOK = CENTROIDS as unknown as Lookup

// Great-circle distance in km — used only to flag GPS that disagrees with the
// reported upazila, never to place a dot.
function km(a: [number, number], b: [number, number]) {
  const R = 6371
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLng = ((b[1] - a[1]) * Math.PI) / 180
  const la1 = (a[0] * Math.PI) / 180
  const la2 = (b[0] * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Dot map of community campaign activity, as CIPRB asked for on 3 Aug 2026
 * ("kothay meeting hoise ... dot mapping").
 *
 * Dots are placed on the REPORTED UPAZILA, not the device GPS. The GPS on this
 * form cannot carry the map: 30 of 71 approved reports name a Gaibandha
 * upazila while carrying Khagrachari coordinates, and the whole set collapses
 * onto 6 distinct points, so a raw-GPS plot draws one blob in the wrong
 * district. The upazila/district the field team types is internally
 * consistent, so that is what we trust; where GPS disagrees by more than
 * 50 km we say so instead of hiding it.
 */
export function FistulaCampaignMap({ rows }: { rows: CampaignUpazila[] }) {
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(GEOJSON_URL)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setGeo(j) })
      .catch(() => { /* base layer optional; dots still render */ })
    return () => { cancelled = true }
  }, [])

  const placed = useMemo(() => {
    return rows.map((r) => {
      const exact = LOOK.upazilas[r.key]
      const fallback = LOOK.districts[r.dkey]
      const at = exact || fallback || null
      const drift = at && r.gps_lat != null && r.gps_lng != null
        ? km(at, [r.gps_lat, r.gps_lng]) : null
      return { ...r, at, approx: !exact && !!fallback, drift }
    }).filter((r) => r.at)
  }, [rows])

  const unplaced = rows.length - placed.length
  const gpsOff = placed.filter((r) => r.drift != null && r.drift > 50).length
  const maxHh = Math.max(1, ...placed.map((r) => r.households || 0))
  // Area-proportional radius: encoding on the radius exaggerates big values.
  const radius = (hh: number) => 7 + 17 * Math.sqrt((hh || 0) / maxHh)

  const baseStyle: PathOptions = {
    fillColor: '#F3F5F9', fillOpacity: 1, color: '#D8DEE9', weight: 0.7,
  }

  return (
    <div>
      <div style={{ position: 'relative', height: 480, borderRadius: 12, overflow: 'hidden' }}>
        <MapContainer
          center={[23.8, 90.4]}
          zoom={7}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%', background: '#fff' }}
          attributionControl={false}
        >
          {geo ? <GeoJSON data={geo as never} style={() => baseStyle} /> : null}
          {placed.map((r) => (
            <CircleMarker
              key={r.key}
              center={r.at as [number, number]}
              radius={radius(r.households)}
              pathOptions={{
                color: '#fff', weight: 1.6,
                fillColor: CIPRB_ORANGE,
                fillOpacity: r.approx ? 0.38 : 0.66,
                dashArray: r.approx ? '3 3' : undefined,
              }}
            >
              <Tooltip direction="top" offset={[0, -4]}>
                <span style={{ fontSize: 12 }}>
                  <b>{r.upazila || r.district}</b>
                  {r.households ? ` · ${r.households.toLocaleString()} households` : ''}
                </span>
              </Tooltip>
              <Popup>
                <div style={{ fontSize: 12.5, lineHeight: 1.6, minWidth: 190 }}>
                  <b style={{ fontSize: 13.5 }}>{r.upazila}</b>
                  <span style={{ color: '#5a606a' }}> · {r.district}</span>
                  <br />
                  {r.date_from ? <>{r.date_from} to {r.date_to}<br /></> : null}
                  Activity reports: <b>{r.reports}</b><br />
                  Households visited: <b>{(r.households || 0).toLocaleString()}</b><br />
                  Population covered: <b>{(r.population || 0).toLocaleString()}</b><br />
                  Suspected found: <b>{r.suspected || 0}</b>
                  {r.spellings.length > 1 ? (
                    <div style={{ marginTop: 6, color: '#5a606a', fontSize: 11.5 }}>
                      Recorded as: {r.spellings.join(', ')}
                    </div>
                  ) : null}
                  {r.approx ? (
                    <div style={{ marginTop: 6, color: '#B45309', fontSize: 11.5 }}>
                      Shown at district centre: this upazila is not in the
                      boundary atlas.
                    </div>
                  ) : null}
                </div>
              </Popup>
            </CircleMarker>
          ))}
          <FitToData data={geo} />
        </MapContainer>
        <div style={{
          position: 'absolute', right: 12, bottom: 12, zIndex: 500,
          background: 'rgba(255,255,255,.94)', border: '1px solid var(--hair-2)',
          borderRadius: 9, padding: '8px 12px', fontSize: 11.5, color: 'var(--ink-2)',
        }}>
          <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
            background: CIPRB_ORANGE, opacity: 0.66, marginRight: 6,
          }} />
          One dot = one upazila · size = households visited
        </div>
      </div>
      {(gpsOff > 0 || unplaced > 0) && (
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '9px 2px 0' }}>
          {gpsOff > 0 && (
            <>Dots are placed on the reported upazila. {gpsOff}{' '}
              {gpsOff === 1 ? 'upazila carries' : 'upazilas carry'} device GPS
              more than 50 km from that upazila, which is a data-quality issue
              to raise with the field team.{' '}</>
          )}
          {unplaced > 0 && <>{unplaced} could not be located and are not shown.</>}
        </p>
      )}
    </div>
  )
}
