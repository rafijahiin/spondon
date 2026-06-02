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
import { MapContainer, GeoJSON } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Layer, PathOptions } from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { FitToData } from './FitToData'
import {
  buildCoverageMap, fillForPartners,
  normaliseDistrict, PARTNER_ROUTES, PARTNER_NAMES,
  PARTNER_TINTS, PARTNER_DISTRICTS, OVERLAP_TWO_ORGS, OVERLAP_THREE_ORGS, NO_COVERAGE,
} from '@/data/partnerDistricts'
import type { PartnerCode } from '@/data/partnerDistricts'

const GEOJSON_URL = '/bangladesh-adm2.geojson'

interface Subgroup {
  name: string
  color: string
  districts: string[]
}

interface Props {
  className?: string
  height?: number | string
  /** When set, the map and legend show ONLY this partner's districts.
   *  Other partners' coverage is rendered as "No coverage" grey. */
  partner?: PartnerCode
  /** Optional district sub-groupings to colour-code on top of `partner`.
   *  Each district is tinted by the first subgroup it matches; districts in
   *  multiple subgroups get a darker overlap tint. Use for CIPRB → GAC vs
   *  SIDA donor distinction. */
  subgroups?: Subgroup[]
  /** Tint to use when a district sits in TWO subgroups (e.g. Sunamganj in
   *  GAC + SIDA). Defaults to a deeper UNFPA tone. */
  subgroupOverlapColor?: string
}

export function PartnerOverlapMap({
  className, height = 360, partner, subgroups, subgroupOverlapColor = '#8B3700',
}: Props) {
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

  // Pre-normalise subgroup district sets so the per-feature lookup is O(1).
  const subgroupKeys = subgroups?.map((s) => ({
    ...s,
    keys: new Set(s.districts.map(normaliseDistrict)),
  }))

  const styleFeature = (feature?: GeoJSON.Feature): PathOptions => {
    const key = normaliseDistrict((feature?.properties?.shapeName as string) ?? '')
    const partners = coverage.get(key)
    // When a single partner is being highlighted, render every district NOT
    // in that partner's coverage as "No coverage" grey — even if other
    // partners cover it. The page is about that one partner.
    if (partner) {
      // Subgroup hits (donor groupings on top of base coverage).
      const hits = subgroupKeys
        ? subgroupKeys.filter((s) => s.keys.has(key))
        : []
      // A district counts as in-partner if EITHER the global coverage map
      // says so OR it appears in any subgroup. This matters for CIPRB where
      // GAC/SIDA donor districts (Bhola, Sherpur, etc.) aren't in the base
      // PARTNER_DISTRICTS.CIPRB list but ARE in CIPRB's donor footprint.
      const inPartner = partners?.includes(partner) || hits.length > 0
      if (!inPartner) {
        return {
          fillColor: NO_COVERAGE,
          fillOpacity: 0.5,
          color: '#ffffff',
          weight: 0.8,
        }
      }
      if (hits.length >= 2) {
        return { fillColor: subgroupOverlapColor, fillOpacity: 0.9, color: '#ffffff', weight: 0.8 }
      }
      if (hits.length === 1) {
        return { fillColor: hits[0].color, fillOpacity: 0.85, color: '#ffffff', weight: 0.8 }
      }
      return {
        fillColor: PARTNER_TINTS[partner],
        fillOpacity: 0.85,
        color: '#ffffff',
        weight: 0.8,
      }
    }
    return {
      fillColor: fillForPartners(partners),
      fillOpacity: partners?.length ? 0.78 : 0.5,
      color: '#ffffff',
      weight: 0.8,
    }
  }

  const onEachFeature = (feature: GeoJSON.Feature, layer: Layer) => {
    const name = (feature.properties?.shapeName as string) ?? 'Unknown'
    const key = normaliseDistrict(name)
    const partners = coverage.get(key) ?? []

    // Build the tooltip label. When subgroups are defined (e.g. CIPRB
    // hero map showing GAC vs SIDA vs Other), surface the subgroup
    // membership so reviewers see WHICH donor footprint a district is in.
    let label: string
    if (partner) {
      const hits = subgroupKeys ? subgroupKeys.filter((s) => s.keys.has(key)) : []
      const inPartner = partners.includes(partner) || hits.length > 0
      if (!inPartner) {
        label = 'Not covered'
      } else if (hits.length >= 2) {
        label = `${partner} · ${hits.map(h => h.name).join(' + ')} (donor overlap)`
      } else if (hits.length === 1) {
        label = `${partner} · ${hits[0].name}`
      } else {
        label = `${partner} · Other`
      }
    } else {
      label = partners.length
        ? partners.map((p) => PARTNER_NAMES[p].en).join(', ')
        : 'No partner coverage yet'
    }

    ;(layer as unknown as { bindTooltip: (s: string, o: object) => void }).bindTooltip(
      `<b>${name}</b><br/>${label}`,
      { direction: 'top', className: 'leaflet-tooltip-custom' },
    )

    // Click → navigate to that partner's owned page (only when a partner
    // covers the district).
    const displayPartners = partner
      ? partners.filter((p) => p === partner)
      : partners
    if (displayPartners.length > 0) {
      const dest = PARTNER_ROUTES[displayPartners[0]]
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
        maxZoom={10}
        scrollWheelZoom={true}
        zoomControl={true}
        attributionControl={false}
        // No tile basemap — the choropleth IS the country, so neighbouring
        // countries never render and the Bangladesh outline reads cleanly.
        // Background fills the area around the country shape.
        style={{
          height, width: '100%', borderRadius: 12,
          background: 'var(--surface-2)',
        }}
      >
        {geoData && (
          <>
            <FitToData data={geoData} />
            <GeoJSON
              data={geoData}
              style={styleFeature}
              onEachFeature={onEachFeature}
            />
          </>
        )}
      </MapContainer>

      {/* Legend — partner-scoped variant when `partner` is set. */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center',
          fontSize: 11.5, color: 'var(--ink-3)',
          padding: '8px 12px',
          background: 'var(--surface-2)',
          borderRadius: 10,
          border: '1px solid var(--hair)',
        }}
      >
        {partner && subgroups && subgroups.length ? (
          <>
            {subgroups.map((s) => (
              <LegendSwatch
                key={s.name}
                color={s.color}
                label={`${s.name} · ${s.districts.length} districts`}
              />
            ))}
            {subgroups.length >= 2 && (
              <LegendSwatch color={subgroupOverlapColor} label="Donor overlap" />
            )}
            <LegendSwatch
              color={PARTNER_TINTS[partner]}
              label={`${PARTNER_NAMES[partner].en} (other)`}
            />
            <LegendSwatch color={NO_COVERAGE} label="Not covered" />
          </>
        ) : partner ? (
          <>
            <LegendSwatch
              color={PARTNER_TINTS[partner]}
              label={`${PARTNER_NAMES[partner].en} · ${PARTNER_DISTRICTS[partner].length} districts`}
            />
            <LegendSwatch color={NO_COVERAGE} label="Not covered" />
            <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>
              {PARTNER_DISTRICTS[partner].join(' · ')}
            </span>
          </>
        ) : (
          <>
            <LegendSwatch color={PARTNER_TINTS.CIPRB}  label="CIPRB" />
            <LegendSwatch color={PARTNER_TINTS.Bandhu} label="Bandhu" />
            <LegendSwatch color={PARTNER_TINTS.PHD}    label="PHD" />
            <LegendSwatch color={OVERLAP_TWO_ORGS}      label={t('home.legendTwoOrgs')} />
            <LegendSwatch color={OVERLAP_THREE_ORGS}    label={t('home.legendThreeOrgs')} />
            <LegendSwatch color={NO_COVERAGE}           label={t('home.legendNoCoverage')} />
          </>
        )}
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
