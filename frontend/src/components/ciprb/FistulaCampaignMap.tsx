import { MapContainer, GeoJSON, useMap } from 'react-leaflet'
import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import type { PathOptions } from 'leaflet'
import 'leaflet/dist/leaflet.css'

const ADM3_URL = '/bangladesh-adm3.geojson'

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

interface UpazilaProps { key?: string; dkey?: string; name?: string; district?: string }
type UFeature = GeoJSON.Feature<GeoJSON.Geometry, UpazilaProps>

// Sequential orange ramp, light to dark. Five steps: enough to rank a handful
// of upazilas, few enough that neighbouring shades stay distinguishable.
const RAMP = ['#FFE3CC', '#FDC9A0', '#FBA76C', '#F5813C', '#D95A00']

function Fit({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap()
  useEffect(() => {
    if (bounds && bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] })
    // Leaflet blanks vectors that fall outside its clip region, so re-measure
    // whenever the panel resizes or shapes silently disappear.
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }))
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map, bounds])
  return null
}

/**
 * Where the community campaign ran, as an upazila choropleth.
 *
 * This replaces a dot map: six markers on a country-sized map carried neither
 * a name nor a magnitude, so "which upazila did what" was unreadable. Shading
 * the upazila itself fixes both, because the area is large enough to label and
 * colour depth carries the volume.
 *
 * Areas are chosen by the REPORTED upazila, never by device GPS: 30 of the 71
 * approved reports name a Gaibandha upazila while carrying Khagrachari
 * coordinates. Every polygon already carries the same canonical key the API
 * groups on, so no name matching happens in the browser.
 */
export function FistulaCampaignMap({ rows }: { rows: CampaignUpazila[] }) {
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(ADM3_URL)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setGeo(j) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [])

  const byKey = useMemo(() => {
    const m = new Map<string, CampaignUpazila>()
    rows.forEach((r) => m.set(r.key, r))
    return m
  }, [rows])

  const activeDistricts = useMemo(() => new Set(rows.map((r) => r.dkey)), [rows])
  const maxHh = Math.max(1, ...rows.map((r) => r.households || 0))
  const shade = (hh: number) =>
    RAMP[Math.min(RAMP.length - 1, Math.floor(((hh || 0) / maxHh) * RAMP.length))]

  // Only the districts that ran the campaign are drawn. The other 61 add
  // nothing and would shrink the working area to a thumbnail.
  const shown = useMemo(() => {
    if (!geo) return null
    const features = (geo.features as UFeature[])
      .filter((f) => activeDistricts.has(String(f.properties?.dkey ?? '')))
    return { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection
  }, [geo, activeDistricts])

  const styleFor = (feature?: UFeature): PathOptions => {
    const row = byKey.get(String(feature?.properties?.key ?? ''))
    return row
      ? { fillColor: shade(row.households), fillOpacity: 1, color: '#8A3B00', weight: 1.4 }
      : { fillColor: '#F4F6FA', fillOpacity: 1, color: '#C9D2E0', weight: 0.8 }
  }

  const shownKeys = useMemo(
    () => new Set((shown?.features ?? []).map(
      (f) => String((f.properties as UpazilaProps)?.key ?? ''))),
    [shown])
  const missing = rows.filter((r) => shown && !shownKeys.has(r.key))

  // Label + popup for one upazila polygon. Only upazilas WITH activity get a
  // permanent label, so the maps do not fill with text as coverage grows.
  const onEachFeature = (feature: GeoJSON.Feature, layer: L.Layer) => {
    const p = (feature as UFeature).properties
    const row = byKey.get(String(p?.key ?? ''))
    if (!row) {
      layer.bindTooltip(String(p?.name ?? ''), { sticky: true })
      return
    }
    const f = (n: number) => (n || 0).toLocaleString()
    layer.bindTooltip(row.upazila, {
      permanent: true, direction: 'center', className: 'fp-area-label',
    })
    layer.bindPopup(
      '<div style="font-size:12.5px;line-height:1.6;min-width:190px">'
      + `<b style="font-size:13.5px">${row.upazila}</b>`
      + `<span style="color:#5a606a"> · ${row.district}</span><br/>`
      + (row.date_from ? `${row.date_from} to ${row.date_to}<br/>` : '')
      + `Activity days: <b>${row.reports}</b><br/>`
      + `Households visited: <b>${f(row.households)}</b><br/>`
      + `Population covered: <b>${f(row.population)}</b><br/>`
      + `Suspected found: <b>${row.suspected || 0}</b>`
      + (row.spellings.length > 1
        ? `<div style="margin-top:6px;color:#5a606a;font-size:11.5px">Recorded as: ${row.spellings.join(', ')}</div>`
        : '')
      + '</div>')
  }

  // One mini map PER DISTRICT. The campaign runs in districts that sit on
  // opposite corners of the country, so a single frame containing all of them
  // renders each upazila about 24px wide. Zooming each district into its own
  // panel makes every upazila large enough to read and label.
  const groups = useMemo(() => {
    if (!shown) return []
    const byDistrict = new Map<string, { name: string; features: UFeature[]; rows: CampaignUpazila[] }>()
    ;(shown.features as UFeature[]).forEach((f) => {
      const dk = String(f.properties?.dkey ?? '')
      if (!byDistrict.has(dk)) {
        byDistrict.set(dk, {
          name: rows.find((r) => r.dkey === dk)?.district || String(f.properties?.district ?? ''),
          features: [], rows: [],
        })
      }
      byDistrict.get(dk)!.features.push(f)
    })
    rows.forEach((r) => byDistrict.get(r.dkey)?.rows.push(r))
    return [...byDistrict.entries()]
      .map(([dk, g]) => ({ dk, ...g,
        households: g.rows.reduce((s2, r) => s2 + (r.households || 0), 0) }))
      .sort((a, b) => b.households - a.households)
  }, [shown, rows])

  const fmt = (n: number) => (n || 0).toLocaleString()

  return (
    <div>
      {!shown ? (
        <div style={{
          height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, color: 'var(--muted)', border: '1px solid var(--hair-2)',
          borderRadius: 12,
        }}>
          {failed ? 'Upazila boundaries could not be loaded.' : 'Loading upazila boundaries…'}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))`,
          gap: 14,
        }}>
          {groups.map((g) => (
            <div key={g.dk} style={{
              border: '1px solid var(--hair-2)', borderRadius: 12,
              overflow: 'hidden', background: '#fff',
            }}>
              <div style={{ padding: '10px 13px 8px' }}>
                <div style={{ fontSize: 14.5, fontWeight: 750, color: 'var(--ink)', textTransform: 'capitalize' }}>
                  {g.name}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {g.rows.length} upazila{g.rows.length === 1 ? '' : 's'} · {fmt(g.households)} households
                </div>
              </div>
              <div style={{ height: 300 }}>
                <MapContainer
                  scrollWheelZoom={false}
                  dragging={false}
                  zoomControl={false}
                  doubleClickZoom={false}
                  style={{ height: '100%', width: '100%', background: '#fff' }}
                  attributionControl={false}
                >
                  <GeoJSON
                    key={g.dk + g.rows.map((r) => r.key + r.households).join('|')}
                    data={{ type: 'FeatureCollection', features: g.features } as never}
                    style={styleFor as never}
                    onEachFeature={onEachFeature}
                  />
                  <Fit bounds={L.geoJSON({ type: 'FeatureCollection', features: g.features } as never).getBounds()} />
                </MapContainer>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        margin: '12px 2px 0', fontSize: 11.5, color: 'var(--ink-2)',
      }}>
        <span style={{ fontWeight: 700, letterSpacing: '.04em' }}>HOUSEHOLDS VISITED</span>
        <span style={{ display: 'flex' }}>
          {RAMP.map((c) => (
            <span key={c} style={{ width: 30, height: 11, background: c, border: '1px solid rgba(0,0,0,.06)' }} />
          ))}
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>
          0 to {fmt(maxHh)}
        </span>
        <span style={{ color: 'var(--muted)' }}>Grey = no campaign activity</span>
      </div>

      {/* Names, days and volumes in full. The maps answer "where"; this
          answers "how much", and lists the spellings that were merged. */}
      <div className="card" style={{ marginTop: 14, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['UPAZILA', 'DAYS', 'HOUSEHOLDS', 'POPULATION', 'SUSPECTED'].map((c, i) => (
                <th key={c} style={{
                  textAlign: i === 0 ? 'left' : 'right',
                  padding: i === 0 ? '10px 16px' : '10px 14px',
                  fontSize: 10.5, letterSpacing: '.05em', color: 'var(--muted)',
                  borderBottom: '1px solid var(--hair-2)', background: 'var(--surface-2, #f7f9fc)',
                }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td style={{ padding: '9px 16px', borderBottom: '1px solid var(--hair-2)' }}>
                  <span style={{ fontWeight: 650 }}>{r.upazila}</span>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>
                    {r.district}
                    {r.spellings.length > 1
                      ? ` · also written ${r.spellings.filter((x) => x !== r.upazila).join(', ')}`
                      : ''}
                  </div>
                </td>
                {[r.reports, r.households, r.population, r.suspected].map((v, i) => (
                  <td key={i} style={{
                    padding: '9px 14px', textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: i === 1 ? 650 : 400,
                    borderBottom: '1px solid var(--hair-2)',
                  }}>{fmt(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {missing.length > 0 && (
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '9px 2px 0' }}>
          {missing.map((m) => m.upazila).join(', ')}
          {missing.length === 1 ? ' is' : ' are'} not in the national boundary
          atlas (newer upazila), so {missing.length === 1 ? 'it is' : 'they are'}
          {' '}in the table but not shaded on the maps.
        </p>
      )}
    </div>
  )
}
