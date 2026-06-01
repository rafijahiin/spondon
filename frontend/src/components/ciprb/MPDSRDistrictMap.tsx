/**
 * MPDSRDistrictMap — Bangladesh choropleth highlighting SIDA / GAC / CP
 * focused-intervention districts per Animesh's spec.
 *
 * Three overlays:
 *   - SIDA districts (6): Noakhali, Chandpur, Bandarban, Dhaka, Sunamganj, Cox's Bazar
 *   - GAC districts (5): Sunamganj, Bhola, Sherpur, Kurigram, Khagrachari
 *   - CP districts (broader Country Programme footprint)
 *
 * Sunamganj appears in both SIDA and GAC (per Sayeed's overlap) — rendered
 * with a striped fill to signal multi-set membership.
 */
import { useEffect, useState } from 'react'
import { MapContainer, GeoJSON } from 'react-leaflet'
import type { Layer, PathOptions, LeafletEvent } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Info } from 'lucide-react'

const GEOJSON_URL = '/bangladesh-adm2.geojson'
const CIPRB_BLUE = '#0072BC'

// Mappings (mirrors MPDSRVisualizations — single source eventually).
const GAC = ['Sunamganj', 'Bhola', 'Sherpur', 'Kurigram', 'Khagrachari']
const SIDA = ['Noakhali', 'Chandpur', 'Bandarban', 'Dhaka', 'Sunamganj', "Cox's Bazar"]
const CP = [
  'Sunamganj', 'Sylhet', 'Hobiganj', 'Bhola', 'Bagerhat', 'Patuakhali',
  'Barguna', 'Bandarban', 'Khagrachari', 'Noakhali', 'Chandpur', 'Sherpur',
  'Sirajganj', 'Jamalpur', 'Gaibandha', 'Kurigram', "Cox's Bazar", 'Dhaka',
]

function normalise(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

const GAC_SET = new Set(GAC.map(normalise))
const SIDA_SET = new Set(SIDA.map(normalise))
const CP_SET = new Set(CP.map(normalise))

// Colour palette — CIPRB blue family with three shades so overlaps read.
const TINT = {
  both:     '#9B27B0',   // purple-ish — SIDA + GAC overlap (Sunamganj)
  gac:      '#0072BC',   // CIPRB blue
  sida:     '#00875A',   // teal-green
  cp:       '#7DB8DC',   // light blue
  none:     '#E5E7EB',   // light grey
  stroke:   '#003E66',
}

function tintFor(name: string): { fill: string; opacity: number; group: string } {
  const key = normalise(name)
  const inGAC = GAC_SET.has(key)
  const inSIDA = SIDA_SET.has(key)
  const inCP = CP_SET.has(key)
  if (inGAC && inSIDA) return { fill: TINT.both, opacity: 0.62, group: 'GAC + SIDA' }
  if (inGAC)            return { fill: TINT.gac,  opacity: 0.55, group: 'GAC' }
  if (inSIDA)           return { fill: TINT.sida, opacity: 0.55, group: 'SIDA' }
  if (inCP)             return { fill: TINT.cp,   opacity: 0.45, group: 'CP' }
  return { fill: TINT.none, opacity: 0.08, group: '' }
}

interface DistrictFeatureProps {
  shapeName: string
}

export function MPDSRDistrictMap() {
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(GEOJSON_URL)
      .then(r => r.json())
      .then(d => { if (!cancelled) setGeo(d) })
      .catch(() => { /* graceful — render legend without map */ })
    return () => { cancelled = true }
  }, [])

  const style = (feature?: GeoJSON.Feature): PathOptions => {
    const name = (feature?.properties as DistrictFeatureProps | undefined)?.shapeName ?? ''
    const { fill, opacity } = tintFor(name)
    return {
      fillColor: fill,
      fillOpacity: opacity,
      color: TINT.stroke,
      weight: 0.6,
      opacity: 0.4,
    }
  }

  const onEachFeature = (feature: GeoJSON.Feature, layer: Layer) => {
    const name = (feature.properties as DistrictFeatureProps | undefined)?.shapeName ?? ''
    const { group } = tintFor(name)
    if (group) {
      layer.bindTooltip(`<b>${name}</b><br/><span style="font-size:11px;color:#555">${group}</span>`, {
        sticky: true, direction: 'top',
      })
    } else {
      layer.bindTooltip(`<b>${name}</b>`, { sticky: true, direction: 'top' })
    }
    layer.on({
      mouseover: (e: LeafletEvent) => {
        (e.target as any).setStyle?.({ weight: 1.4, fillOpacity: 0.85 })
      },
      mouseout: (e: LeafletEvent) => {
        (e.target as any).setStyle?.(style(feature))
      },
    })
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div className="kicker">
          <span className="dot" style={{ background: CIPRB_BLUE }} />
          GEOGRAPHIC COVERAGE · MPDSR INTERVENTION DISTRICTS
        </div>
        <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
          Where focused MPDSR support is running
        </h3>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
          GAC + SIDA-funded intensive districts, layered over the broader Country Programme footprint.
        </p>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ position: 'relative', height: 520, borderRadius: 8, overflow: 'hidden' }}>
          {geo ? (
            <MapContainer
              center={[23.685, 90.3563]}
              zoom={7}
              style={{ height: '100%', width: '100%', background: 'var(--surface-2)' }}
              scrollWheelZoom={false}
              attributionControl={false}
              zoomControl={true}
            >
              <GeoJSON data={geo} style={style} onEachFeature={onEachFeature} />
            </MapContainer>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: 'var(--muted)', fontSize: 13,
            }}>
              <Info size={16} style={{ marginRight: 8 }} />
              Loading district boundaries…
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 16,
          marginTop: 16, fontSize: 12.5,
        }}>
          <LegendSwatch color={TINT.gac}  label="GAC districts (5)" sub="Focused intervention" />
          <LegendSwatch color={TINT.sida} label="SIDA districts (6)" sub="Focused intervention" />
          <LegendSwatch color={TINT.both} label="GAC + SIDA overlap" sub="Sunamganj" />
          <LegendSwatch color={TINT.cp}   label="CP districts" sub="Country Programme" />
          <LegendSwatch color={TINT.none} label="No focused MPDSR" sub="" />
        </div>
      </div>
    </div>
  )
}

function LegendSwatch({ color, label, sub }: { color: string; label: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        display: 'inline-block', width: 16, height: 16, borderRadius: 3,
        background: color, border: '1px solid rgba(0,0,0,0.08)', flexShrink: 0,
      }} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{label}</span>
        {sub && <span style={{ color: 'var(--muted)', fontSize: 11 }}>{sub}</span>}
      </div>
    </div>
  )
}
