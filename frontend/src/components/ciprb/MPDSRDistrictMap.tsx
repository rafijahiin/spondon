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
      <div style={{ marginBottom: 14 }}>
        <div className="kicker">
          <span className="dot" style={{ background: CIPRB_BLUE }} />
          {t('mpdsrMap.kicker')}
        </div>
        <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
          {t('mpdsrMap.title')}
        </h3>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
          {t('mpdsrMap.sub')}
        </p>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ position: 'relative', height: 520, borderRadius: 8, overflow: 'hidden' }}>
          {/* Live-pulse badge — Animesh's "districts light up as submissions arrive" */}
          <AnimatePresence>
            {latest && (
              <motion.div
                key={`${latest.partner}-${latest.district}-${latest.time_ago}`}
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  position: 'absolute', top: 12, left: 12, zIndex: 1000,
                  padding: '6px 12px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.96)',
                  border: '1px solid var(--hair)',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  fontSize: 12,
                }}
              >
                <motion.span
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    width: 8, height: 8, borderRadius: 999,
                    background: '#1A7A5A', flexShrink: 0,
                  }}
                />
                <b style={{ color: 'var(--ink)' }}>{latest.partner}</b>
                <span style={{ color: 'var(--ink-3)' }}>· {latest.district}</span>
                <span className="mono" style={{ color: 'var(--muted)', fontSize: 10 }}>
                  {latest.time_ago}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
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
