import { MapContainer, GeoJSON, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet'
import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
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

type Lookup = {
  upazilas: Record<string, [number, number]>
  districts: Record<string, [number, number]>
  districtNames: Record<string, string>
}
const LOOK = CENTROIDS as unknown as Lookup

/**
 * Leaflet fixes its SVG clip region to the container size it saw at init. This
 * map lives in a responsive 2-column grid, so the container grows AFTER init
 * and every marker near the edge gets sliced into a sliver (Gaibandha rendered
 * as a 2px orange line). Re-measure whenever the box changes.
 */
function InvalidateOnResize() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }))
    ro.observe(el)
    const t = setTimeout(() => map.invalidateSize({ animate: false }), 250)
    return () => { ro.disconnect(); clearTimeout(t) }
  }, [map])
  return null
}

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

  // Leaflet's SVG renderer BLANKS (sets d='') any vector outside its clip
  // region, which by default is the viewport plus 10%. After the container
  // resizes and the map recentres, that region no longer covers everything on
  // screen: the Gaibandha and Sirajganj dots were emptied to zero-size paths
  // parked off-canvas, so the north-west looked like it had no activity while
  // its district sat tinted. A padding of 2 viewports keeps every marker
  // rendered at any size this panel takes.
  const renderer = useMemo(() => L.svg({ padding: 2 }), [])

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
  const radius = (hh: number) => 4.5 + 9.5 * Math.sqrt((hh || 0) / maxHh)

  // Districts with activity get a light tint: 6 upazilas on a 64-district map
  // are easy to miss, and the tint tells you WHERE to look before you find the
  // dots. The dots still carry the quantity.
  // Match on the atlas's own district name, resolved through the same canon
  // key the API groups on, so no fold logic is duplicated in TypeScript.
  const activeNames = useMemo(
    () => new Set(placed.map((r) => LOOK.districtNames[r.dkey]).filter(Boolean)),
    [placed])

  const styleFor = (feature?: { properties?: Record<string, unknown> }): PathOptions => {
    const nm = String(feature?.properties?.shapeName ?? '')
    return activeNames.has(nm)
      ? { fillColor: '#FFE6D2', fillOpacity: 1, color: '#F7A76C', weight: 1.1 }
      : { fillColor: '#F3F5F9', fillOpacity: 1, color: '#D8DEE9', weight: 0.7 }
  }

  const fmt = (n: number) => (n || 0).toLocaleString()

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.05fr) minmax(300px, 1fr)', gap: 16, alignItems: 'stretch' }}>
      <div style={{ position: 'relative', height: 480, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--hair-2)' }}>
        <MapContainer
          center={[23.8, 90.4]}
          zoom={7}
          scrollWheelZoom={false}
          renderer={renderer}
          style={{ height: '100%', width: '100%', background: '#fff' }}
          attributionControl={false}
        >
          {geo ? <GeoJSON data={geo as never} style={styleFor as never} /> : null}
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
              {/* Hover only. Permanent labels would pile up as the campaign
                  adds upazilas; the table beside the map already names every
                  place, so the map stays clean. */}
              <Tooltip direction="top" offset={[0, -3]} className="fp-dot-label">
                <span style={{ fontSize: 11.5, fontWeight: 650 }}>
                  {r.upazila || r.district}
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
          <InvalidateOnResize />
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

      {/* The map answers "where"; this answers "how much", and gives CIPRB the
          upazila names to check against their own field plan. */}
      <div className="card" style={{ padding: '4px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: '.08em', fontWeight: 700, color: 'var(--muted)', padding: '12px 16px 8px' }}>
          WHERE THE CAMPAIGN RAN
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 16px', fontSize: 10.5, letterSpacing: '.05em', color: 'var(--muted)', borderBottom: '1px solid var(--hair-2)', background: 'var(--surface-2, #f7f9fc)' }}>UPAZILA</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10.5, letterSpacing: '.05em', color: 'var(--muted)', borderBottom: '1px solid var(--hair-2)', background: 'var(--surface-2, #f7f9fc)' }}>DAYS</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10.5, letterSpacing: '.05em', color: 'var(--muted)', borderBottom: '1px solid var(--hair-2)', background: 'var(--surface-2, #f7f9fc)' }}>HOUSEHOLDS</th>
                <th style={{ textAlign: 'right', padding: '8px 16px', fontSize: 10.5, letterSpacing: '.05em', color: 'var(--muted)', borderBottom: '1px solid var(--hair-2)', background: 'var(--surface-2, #f7f9fc)' }}>POPULATION</th>
              </tr>
            </thead>
            <tbody>
              {placed.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: '9px 16px', borderBottom: '1px solid var(--hair-2)' }}>
                    <span style={{ fontWeight: 650 }}>{r.upazila}</span>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {r.district}
                      {r.spellings.length > 1 ? ` · also written ${r.spellings.filter((s2) => s2 !== r.upazila).join(', ')}` : ''}
                    </div>
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--hair-2)' }}>{r.reports}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 650, borderBottom: '1px solid var(--hair-2)' }}>{fmt(r.households)}</td>
                  <td style={{ padding: '9px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--hair-2)' }}>{fmt(r.population)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
