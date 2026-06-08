/**
 * ChoroplethMap — a single report-grade choropleth for the MPDSR Atlas.
 *
 * One component renders both the DISTRICT view (each district shaded by its
 * own value) and the DIVISION view (each district shaded by its division's
 * aggregate — we have no adm1 geojson, so colouring the adm2 polygons by
 * division total gives a clean division read without an extra asset).
 *
 * Cartography:
 *  - Quantile classification (5 classes) — robust for the heavily skewed
 *    counts (neonatal 8 → 545). Legend shows the real numeric ranges.
 *  - ColorBrewer sequential ramps: maternal = Reds, neonatal = Blues
 *    (perceptually uniform, colour-blind- and print-safe). Grey = no data.
 *  - Furniture baked in for export: title, classed legend, north arrow,
 *    scale bar, and a source/year caption — so the PNG is report-ready.
 *  - Export renders on a WHITE background regardless of app theme.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, GeoJSON } from 'react-leaflet'
import type { Layer, PathOptions } from 'leaflet'
import { domToPng } from 'modern-screenshot'
import { Download } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

import { FitToData } from '@/components/maps/FitToData'
import { normaliseDistrict } from '@/data/partnerDistricts'
import {
  MPDSR_2024, MPDSR_SOURCE, type Metric, type Indicator,
  districtValues, divisionValues, divisionOfDistrict,
} from '@/data/mpdsr2024'

const GEOJSON_URL = '/bangladesh-adm2.geojson'

// ColorBrewer 5-class sequential ramps.
const RAMPS: Record<Metric, string[]> = {
  maternal: ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15'], // Reds
  neonatal: ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'], // Blues
}
const NO_DATA = '#e5e7eb'

const INDICATOR_LABEL: Record<Indicator, string> = {
  notified: 'Deaths notified',
  reviewed: 'Deaths reviewed',
  pct: '% of deaths reviewed',
}
const METRIC_LABEL: Record<Metric, string> = {
  maternal: 'Maternal',
  neonatal: 'Neonatal',
}

/** Quantile class breaks → returns up to `n` ascending upper-bounds. Dedupes
 *  ties so skewed/ small sets don't create empty classes. */
function quantileBreaks(values: number[], n: number): number[] {
  const v = values.filter(x => x > 0).sort((a, b) => a - b)
  if (v.length === 0) return [0]
  const breaks: number[] = []
  for (let i = 1; i <= n; i++) {
    const q = v[Math.min(v.length - 1, Math.floor((i / n) * v.length) - 1 < 0 ? 0 : Math.ceil((i / n) * v.length) - 1)]
    breaks.push(q)
  }
  // ensure last break is the max, dedupe ascending
  breaks[breaks.length - 1] = v[v.length - 1]
  return [...new Set(breaks)].sort((a, b) => a - b)
}

function classIndex(value: number, breaks: number[]): number {
  for (let i = 0; i < breaks.length; i++) if (value <= breaks[i]) return i
  return breaks.length - 1
}

function rangeLabels(breaks: number[], indicator: Indicator): string[] {
  const suffix = indicator === 'pct' ? '%' : ''
  const out: string[] = []
  let lo = 1
  for (let i = 0; i < breaks.length; i++) {
    const hi = breaks[i]
    out.push(lo === hi ? `${lo}${suffix}` : `${lo}–${hi}${suffix}`)
    lo = hi + 1
  }
  return out
}

interface Props {
  metric: Metric
  level: 'district' | 'division'
  indicator: Indicator
  geoData: GeoJSON.FeatureCollection | null
  geoError?: boolean
}

export function ChoroplethMap({ metric, level, indicator, geoData, geoError }: Props) {
  const exportRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)

  // Full per-district rows for tooltips.
  const rowByKey = useMemo(() => {
    const o: Record<string, typeof MPDSR_2024[number]> = {}
    for (const r of MPDSR_2024) o[normaliseDistrict(r.district)] = r
    return o
  }, [])

  // value lookup keyed by normalised district name.
  const valueByKey = useMemo(() => {
    const o: Record<string, number> = {}
    if (level === 'district') {
      const dv = districtValues(metric, indicator)
      for (const [name, val] of Object.entries(dv)) o[normaliseDistrict(name)] = val
    } else {
      const dv = divisionValues(metric, indicator)
      const map = divisionOfDistrict()
      for (const [name, div] of Object.entries(map)) o[normaliseDistrict(name)] = dv[div]
    }
    return o
  }, [metric, level, indicator])

  const breaks = useMemo(() => {
    const vals = level === 'district'
      ? Object.values(districtValues(metric, indicator))
      : Object.values(divisionValues(metric, indicator))
    return quantileBreaks(vals, 5)
  }, [metric, level, indicator])

  const ramp = RAMPS[metric]
  const labels = rangeLabels(breaks, indicator)

  const colorFor = (key: string): string => {
    const v = valueByKey[key]
    if (v === undefined || v === null) return NO_DATA
    if (v === 0) return NO_DATA
    return ramp[Math.min(ramp.length - 1, classIndex(v, breaks))]
  }

  const styleFeature = (feature?: GeoJSON.Feature): PathOptions => {
    const key = normaliseDistrict((feature?.properties?.shapeName as string) ?? '')
    return {
      fillColor: colorFor(key),
      fillOpacity: 0.92,
      color: '#ffffff',
      weight: level === 'division' ? 0.5 : 0.7,
    }
  }

  const onEach = (feature: GeoJSON.Feature, layer: Layer) => {
    const name = (feature.properties?.shapeName as string) ?? 'Unknown'
    const key = normaliseDistrict(name)
    const row = rowByKey[key]
    const c = row ? row[metric] : null
    const html = row
      ? `<b>${name}</b> · ${row.division}<br/>`
        + `Notified: <b>${c!.notified}</b> · Reviewed: <b>${c!.reviewed}</b> · ${c!.pct}% reviewed`
      : `<b>${name}</b><br/>No data`
    ;(layer as unknown as { bindTooltip: (s: string, o: object) => void })
      .bindTooltip(html, { direction: 'top', sticky: true, className: 'leaflet-tooltip-custom' })
  }

  const title = `${METRIC_LABEL[metric]} deaths — ${INDICATOR_LABEL[indicator]} (2024)`
  const subtitle = level === 'district'
    ? 'By district · 64 districts'
    : 'By division · 8 divisions'

  const handleExport = async () => {
    if (!exportRef.current) return
    setBusy(true)
    try {
      const png = await domToPng(exportRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        filter: (n) => {
          if (n instanceof HTMLElement) {
            if (n.dataset?.noExport === 'true') return false
            // Drop Leaflet UI chrome (zoom +/- buttons, attribution) so the
            // exported map stays clean for reports.
            if (n.classList?.contains('leaflet-control')) return false
          }
          return true
        },
      })
      const a = document.createElement('a')
      a.href = png
      a.download = `MPDSR2024_${metric}_${level}_${indicator}.png`
      a.click()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Export wrapper — everything inside renders into the PNG on white. */}
      <div ref={exportRef} style={{ background: '#ffffff', padding: 16, color: '#111827' }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{title}</div>
          <div style={{ fontSize: 11.5, color: '#6b7280' }}>{subtitle}</div>
        </div>

        <div style={{ position: 'relative', height: 460, borderRadius: 8, overflow: 'hidden', background: '#ffffff' }}>
          {geoError ? (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 13 }}>
              Map unavailable — could not load district boundaries.
            </div>
          ) : (
            <MapContainer
              center={[23.7, 90.4]} zoom={6} minZoom={6} maxZoom={10}
              zoomControl={true} scrollWheelZoom={false} doubleClickZoom={true}
              dragging={true} attributionControl={false}
              style={{ height: '100%', width: '100%', background: '#ffffff' }}
            >
              {geoData && (
                <>
                  <FitToData data={geoData} />
                  <GeoJSON key={`${metric}-${level}-${indicator}`} data={geoData} style={styleFeature} onEachFeature={onEach} />
                </>
              )}
            </MapContainer>
          )}

          {/* North arrow (overlay; part of export) */}
          <div style={{ position: 'absolute', top: 10, right: 12, zIndex: 500, textAlign: 'center', color: '#374151', fontSize: 10, fontWeight: 700 }}>
            <div style={{ fontSize: 16, lineHeight: 1 }}>↑</div>N
          </div>

          {/* Legend (overlay; part of export) */}
          <div style={{
            position: 'absolute', bottom: 10, left: 12, zIndex: 500,
            background: 'rgba(255,255,255,0.94)', border: '1px solid #e5e7eb',
            borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#111827',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 5, fontSize: 10.5, color: '#374151' }}>
              {INDICATOR_LABEL[indicator]}
            </div>
            {ramp.slice(0, labels.length).map((col, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ width: 14, height: 12, background: col, border: '1px solid rgba(0,0,0,0.15)', borderRadius: 2 }} />
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{labels[i]}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{ width: 14, height: 12, background: NO_DATA, border: '1px solid rgba(0,0,0,0.15)', borderRadius: 2 }} />
              <span>0 / none</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 9.5, color: '#9ca3af', lineHeight: 1.4 }}>
          Source: {MPDSR_SOURCE}. Classes: quantile (5). {level === 'division' ? 'Districts shaded by their division aggregate.' : ''}
        </div>
      </div>

      {/* Controls (NOT exported) */}
      <div data-no-export="true" style={{ padding: '8px 16px', borderTop: '1px solid var(--hair)', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleExport} disabled={busy} className="btn-ghost" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600,
          color: 'var(--ink-2)', background: 'var(--surface-2)', border: '1px solid var(--hair)',
          borderRadius: 8, padding: '6px 12px', cursor: busy ? 'wait' : 'pointer',
        }}>
          <Download size={13} /> {busy ? 'Exporting…' : 'Download PNG'}
        </button>
      </div>
    </div>
  )
}

/** Shared geojson loader so the four maps fetch the boundary file once. */
export function useDistrictGeo(): { geoData: GeoJSON.FeatureCollection | null; geoError: boolean } {
  const [geoData, setGeoData] = useState<GeoJSON.FeatureCollection | null>(null)
  const [geoError, setGeoError] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch(GEOJSON_URL)
      .then(r => { if (!r.ok) throw new Error('geojson'); return r.json() })
      .then(d => { if (!cancelled) setGeoData(d) })
      .catch(() => { if (!cancelled) setGeoError(true) })
    return () => { cancelled = true }
  }, [])
  return { geoData, geoError }
}
