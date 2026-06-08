/**
 * MPDSR Atlas — GIS choropleth maps of community maternal & neonatal deaths,
 * Bangladesh 2024 (request from Dr Animesh Biswas, UNFPA).
 *
 * Four maps, exactly as requested:
 *   District  · Maternal   |  District  · Neonatal
 *   Division  · Maternal   |  Division  · Neonatal
 * Maternal = red scheme, Neonatal = blue scheme. An indicator toggle switches
 * all four between Notified (default, his ask), Reviewed, and % reviewed.
 * Each map exports a report-ready PNG.
 *
 * Data: National MPDSR Report 2019–2024 (publ. Dec 2025), community tables
 * T1 (maternal) + T2 (neonatal). 2024 figures.
 */
import { useState } from 'react'
import { ChoroplethMap, useDistrictGeo } from '@/components/atlas/ChoroplethMap'
import { MPDSR_TOTALS, type Indicator } from '@/data/mpdsr2024'

const INDICATORS: { key: Indicator; label: string }[] = [
  { key: 'notified', label: 'Deaths notified' },
  { key: 'reviewed', label: 'Deaths reviewed' },
  { key: 'pct',      label: '% reviewed' },
]

export default function MpdsrAtlas() {
  const [indicator, setIndicator] = useState<Indicator>('notified')
  const { geoData, geoError } = useDistrictGeo()

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8" style={{ paddingBottom: 64 }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div className="kicker" style={{ marginBottom: 8 }}>
          <span className="dot" style={{ background: '#a50f15' }} />
          NATIONAL MPDSR · GIS ATLAS · 2024
        </div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
          Maternal &amp; neonatal death mapping
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--muted)', maxWidth: 760, lineHeight: 1.5 }}>
          Community-level death notification across all 64 districts and 8 divisions of Bangladesh, 2024.
          Maternal data in red, neonatal in blue. Source: National MPDSR Report 2019–2024 (community review tables).
        </p>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--ink-3)' }}>
          <span><b style={{ color: '#a50f15' }}>{MPDSR_TOTALS.maternal.notified.toLocaleString()}</b> maternal deaths notified</span>
          <span><b style={{ color: '#08519c' }}>{MPDSR_TOTALS.neonatal.notified.toLocaleString()}</b> neonatal deaths notified</span>
        </div>
      </div>

      {/* Indicator toggle */}
      <div role="radiogroup" aria-label="Indicator" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
          Shade by
        </span>
        {INDICATORS.map(({ key, label }) => {
          const active = indicator === key
          return (
            <button
              key={key} role="radio" aria-checked={active}
              onClick={() => setIndicator(key)}
              style={{
                padding: '6px 14px', borderRadius: 999, fontSize: 13,
                fontWeight: active ? 600 : 500, cursor: 'pointer',
                background: active ? 'rgba(249,96,0,0.10)' : 'var(--surface-2)',
                color: active ? 'var(--unfpa, #F96000)' : 'var(--ink-3)',
                border: active ? '1px solid rgba(249,96,0,0.32)' : '1px solid var(--hair)',
                transitionProperty: 'background-color,color,border-color', transitionDuration: '160ms',
              }}
            >{label}</button>
          )
        })}
      </div>

      {/* 2×2 map grid */}
      <div className="atlas-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
        <ChoroplethMap metric="maternal" level="district" indicator={indicator} geoData={geoData} geoError={geoError} />
        <ChoroplethMap metric="neonatal" level="district" indicator={indicator} geoData={geoData} geoError={geoError} />
        <ChoroplethMap metric="maternal" level="division" indicator={indicator} geoData={geoData} geoError={geoError} />
        <ChoroplethMap metric="neonatal" level="division" indicator={indicator} geoData={geoData} geoError={geoError} />
      </div>

      <style>{`
        @media (max-width: 920px) {
          .atlas-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
