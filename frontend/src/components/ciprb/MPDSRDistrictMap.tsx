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
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import { MapContainer, GeoJSON } from 'react-leaflet'
import { api } from '@/api/client'
import { normaliseDistrict } from '@/data/partnerDistricts'
import type { Layer, PathOptions, LeafletEvent } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Info } from 'lucide-react'

const GEOJSON_URL = '/bangladesh-adm2.geojson'
// UNFPA branding — orange instead of CIPRB blue.
const CIPRB_BLUE = '#F96000'

// Mappings — must mirror MPDSRVisualizations.tsx DISTRICT_MAPPING.
// Provided by CIPRB (Near Miss tool, June 2026): GAC + SIDA sit inside
// the canonical 18 CIPRB working districts. CP = the full 18.
const GAC  = ['Sunamganj', 'Bhola', 'Sherpur', 'Kurigram', 'Khagrachari']
const SIDA = ['Noakhali', 'Chandpur', 'Bandarban', 'Patuakhali', 'Barguna']
const CP   = [
  'Sunamganj', 'Sherpur', 'Bhola', 'Kurigram', 'Gaibandha',
  'Khagrachari', 'Noakhali', 'Patuakhali', 'Sirajganj', 'Barguna',
  'Jamalpur', 'Bagerhat', 'Habiganj', 'Moulavibazar', 'Sylhet',
  'Bandarban', 'Chandpur', 'Rangpur',
]

// Use the shared alias-aware normaliser (partnerDistricts.ts) so spelling
// variants match the GeoJSON — e.g. Khagrachari→Khagrachhari,
// Moulavibazar→Maulvibazar. The previous local version had no alias table,
// so those two districts silently never highlighted on this map.
const normalise = normaliseDistrict

const GAC_SET = new Set(GAC.map(normalise))
const SIDA_SET = new Set(SIDA.map(normalise))
const CP_SET = new Set(CP.map(normalise))

// Colour palette — UNFPA orange tonal scale. Three distinguishable shades
// of orange so GAC / SIDA / CP coverage layers stay readable, plus a deep
// shade for the GAC+SIDA overlap. No foreign hues.
const TINT = {
  both:     '#7A2E00',   // very deep orange — GAC + SIDA overlap (Sunamganj)
  gac:      '#F96000',   // UNFPA primary orange
  sida:     '#C44E00',   // UNFPA deep
  cp:       '#FDCFB3',   // UNFPA pale tint
  none:     '#E5E7EB',   // neutral grey — districts with no MPDSR focus
  stroke:   '#7A2E00',
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

interface RecentSubmission {
  district: string
  time_ago: string
  partner: string
}

export function MPDSRDistrictMap() {
  const { t } = useTranslation()
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null)
  const [latest, setLatest] = useState<RecentSubmission | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(GEOJSON_URL)
      .then(r => r.json())
      .then(d => { if (!cancelled) setGeo(d) })
      .catch(() => { /* graceful — render legend without map */ })
    return () => { cancelled = true }
  }, [])

  // Animesh's spec — the map should feel "live" as submissions arrive.
  // Pulses the most-recent submission's district name into a floating
  // badge over the map. Polls every 45s.
  useEffect(() => {
    let cancelled = false
    const fetchLatest = () =>
      api.get<any>('/dashboard/activity/?limit=1')
        .then(r => {
          if (cancelled) return
          const rows = Array.isArray(r.data) ? r.data : r.data.results ?? []
          const first = rows[0]
          if (first?.district) {
            setLatest({
              district: first.district,
              time_ago: first.time_ago,
              partner: first.partner,
            })
          }
        })
        .catch(() => {})
    fetchLatest()
    const id = setInterval(fetchLatest, 45_000)
    return () => { cancelled = true; clearInterval(id) }
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
      <div className="card" style={{ padding: 16 }}>
        {/* Header inside the card, one line of copy — the panel was a screen
            and a half tall for a static coverage picture (Rafi, 4 Aug 2026). */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <div className="kicker">
              <span className="dot" style={{ background: CIPRB_BLUE }} />
              {t('mpdsrMap.kicker')}
            </div>
            <h3 style={{ margin: '6px 0 0', fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>
              {t('mpdsrMap.title')}
            </h3>
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 380, textAlign: 'right' }}>
            {t('mpdsrMap.sub')}
          </span>
        </div>
        <div style={{ position: 'relative', height: 340, borderRadius: 8, overflow: 'hidden' }}>
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
              {t('mpdsrMap.loading')}
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 16,
          marginTop: 16, fontSize: 12.5,
        }}>
          <LegendSwatch color={TINT.gac}  label={t('mpdsrMap.legendGac')}  sub={t('mpdsrMap.intervention')} />
          <LegendSwatch color={TINT.sida} label={t('mpdsrMap.legendSida')} sub={t('mpdsrMap.intervention')} />
          <LegendSwatch color={TINT.both} label={t('mpdsrMap.legendOverlap')} sub="Sunamganj" />
          <LegendSwatch color={TINT.cp}   label={t('mpdsrMap.legendCp')}    sub={t('mpdsrMap.countryProgramme')} />
          <LegendSwatch color={TINT.none} label={t('mpdsrMap.legendNone')} sub="" />
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
