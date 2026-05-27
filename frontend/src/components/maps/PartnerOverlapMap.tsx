/**
 * PartnerOverlapMap — homepage coverage map.
 *
 * Renders the Bangladesh adm2 GeoJSON colour-coded by partner footprint:
 *   CIPRB only       → blue   (#0072BC)
 *   Bandhu only      → green  (#00B050)
 *   PHD only         → orange (#ED7D31)
 *   Any two partners → yellow (#FFC000)
 *   All three        → red    (#FF0000)
 *   No coverage      → light grey
 *
 * Clicking a district navigates to that partner's owned page. Districts
 * covered by multiple partners route to the partner ordered first
 * in the coverage list (CIPRB > Bandhu > PHD) — that's a UX trade-off
 * the supervisor can revise after the workshop.
 */
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Layer, PathOptions } from 'leaflet'
import 'leaflet/dist/leaflet.css'

import {
  buildCoverageMap, fillForPartners,
  normaliseDistrict, PARTNER_ROUTES, PARTNER_NAMES,
  PARTNER_COLORS, OVERLAP_TWO_ORGS, OVERLAP_THREE_ORGS, NO_COVERAGE,
} from '@/data/partnerDistricts'

const GEOJSON_URL = '/bangladesh-adm2.geojson'

interface Props {
  className?: string
  height?: number | string
}

export function PartnerOverlapMap({ className, height = 360 }: Props) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [geoData, setGeoData] = useState<GeoJSON.FeatureCollection | null>(null)
  const [error, setError] = useState(false)
  const coverage = buildCoverageMap()

  useEffect(() => {
    fetch(GEOJSON_URL)
      .then((r) => {
        if (!r.ok) throw new Error('GeoJSON fetch failed')
        return r.json()
      })
      .then(setGeoData)
      .catch(() => setError(true))
  }, [])

  const styleFeature = (feature?: GeoJSON.Feature): PathOptions => {
    const key = normaliseDistrict((feature?.properties?.shapeName as string) ?? '')
    const partners = coverage.get(key)
    return {
      fillColor: fillForPartners(partners),
      fillOpacity: partners?.length ? 0.65 : 0.18,
      color: '#004A66',
      weight: 0.5,
    }
  }

  const onEachFeature = (feature: GeoJSON.Feature, layer: Layer) => {
    const name = (feature.properties?.shapeName as string) ?? 'Unknown'
    const key = normaliseDistrict(name)
    const partners = coverage.get(key) ?? []
    const partnerList = partners.length
      ? partners.map((p) => PARTNER_NAMES[p].en).join(', ')
      : 'No partner coverage yet'

    ;(layer as unknown as { bindTooltip: (s: string, o: object) => void }).bindTooltip(
      `<b>${name}</b><br/>${partnerList}`,
      { direction: 'top', className: 'leaflet-tooltip-custom' },
    )

    if (partners.length > 0) {
      // First partner in coverage list wins the click destination.
      const dest = PARTNER_ROUTES[partners[0]]
      ;(layer as unknown as { on: (e: string, fn: () => void) => void }).on('click', () => {
        navigate(dest)
      })
    }
  }

  if (error) {
    return (
      <div
        className={className}
        style={{
          height, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--surface-2)', borderRadius: 12,
          color: 'var(--muted)', fontSize: 13,
        }}
      >
        Map unavailable — check internet connection.
      </div>
    )
  }

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <MapContainer
        center={[23.7, 90.4]}
        zoom={6}
        minZoom={5}
        maxZoom={10}
        // Scroll-wheel zoom enabled — but bound (5-10) so users can't
        // tunnel into useless tile detail or zoom out past country level.
        scrollWheelZoom={true}
        // Built-in +/- buttons, top-right (further from the spine).
        zoomControl={true}
        style={{ height, width: '100%', borderRadius: 12 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          opacity={0.32}
        />
        {geoData && (
          <GeoJSON
            data={geoData}
            style={styleFeature}
            onEachFeature={onEachFeature}
          />
        )}
      </MapContainer>

      {/* Legend */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 14,
          fontSize: 11.5, color: 'var(--ink-3)',
          padding: '8px 12px',
          background: 'var(--surface-2)',
          borderRadius: 10,
          border: '1px solid var(--hair)',
        }}
      >
        <LegendSwatch color={PARTNER_COLORS.CIPRB}  label="CIPRB" />
        <LegendSwatch color={PARTNER_COLORS.Bandhu} label="Bandhu" />
        <LegendSwatch color={PARTNER_COLORS.PHD}    label="PHD" />
        <LegendSwatch color={OVERLAP_TWO_ORGS}      label={t('home.legendTwoOrgs')} />
        <LegendSwatch color={OVERLAP_THREE_ORGS}    label={t('home.legendThreeOrgs')} />
        <LegendSwatch color={NO_COVERAGE}           label={t('home.legendNoCoverage')} />
        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontStyle: 'italic' }}>
          {t('home.coveragePlaceholderNote')}
        </span>
      </div>
    </div>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          display: 'inline-block', width: 12, height: 12,
          borderRadius: 3, background: color,
          border: '1px solid rgba(0,0,0,0.08)',
        }}
      />
      <span style={{ fontWeight: 500 }}>{label}</span>
    </span>
  )
}
