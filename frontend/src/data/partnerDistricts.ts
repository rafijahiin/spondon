/**
 * Partner district coverage — PLACEHOLDER until the validation workshop.
 *
 * The supervisor will confirm the real district lists during the
 * 3–4 June 2026 workshop. Until then these are best-effort lists
 * based on the SIDA frameworks and Spondon project brief:
 *
 *   CIPRB  — RCH programme footprint (CP10 + a few others)
 *   Bandhu — KP/SOGIESC outreach focused on major divisional cities
 *   PHD    — FSW/brothel-based service delivery districts
 *
 * District names are matched case-insensitively against the
 * `shapeName` property in `/bangladesh-adm2.geojson` after stripping
 * non-letter characters. Replace this file (do not edit map logic)
 * once the workshop confirms the canonical lists.
 */
export type PartnerCode = 'CIPRB' | 'Bandhu' | 'PHD'

// Org identity colours — ALL UNFPA orange per the branding rule
// ("this is a UNFPA product, their brand colors are the only thing").
// Partners are identified by their CODE/NAME in the UI, not by hue.
export const PARTNER_COLORS: Record<PartnerCode, string> = {
  CIPRB:  '#F96000',
  Bandhu: '#F96000',
  PHD:    '#F96000',
}

// Tonal scale — used ONLY on the homepage coverage map (Animesh:
// "the map does not need to follow UNFPA colours, it is tough to
// understand"). Three distinct hues so single-org districts read
// unambiguously against the dark background. Every other surface
// on the site still uses the flat UNFPA orange from PARTNER_COLORS.
export const PARTNER_TINTS: Record<PartnerCode, string> = {
  CIPRB:  '#0072BC',   // institutional blue
  Bandhu: '#00875A',   // deep teal-green
  PHD:    '#F96000',   // UNFPA orange (PHD only — the one partner whose
                       // colour stays inside the brand family)
}

// Overlap shading — two-org uses UNFPA amber tint, three-org uses status-off red.
export const OVERLAP_TWO_ORGS  = '#CC9B4A'   // warm amber
export const OVERLAP_THREE_ORGS = '#F10F45'  // deep red
export const NO_COVERAGE = '#E5E7EB'         // light grey

export const PARTNER_DISTRICTS: Record<PartnerCode, string[]> = {
  CIPRB: [
    "Cox's Bazar", 'Bandarban', 'Noakhali', 'Dhaka',
    'Sirajganj', 'Jamalpur', 'Gaibandha', 'Patuakhali',
    'Barguna', 'Bagerhat',
  ],
  Bandhu: [
    'Dhaka', 'Chittagong', 'Sylhet', 'Khulna',
    'Rajshahi', 'Barishal',
  ],
  PHD: [
    'Tangail', 'Rajbari', 'Jessore', 'Faridpur',
    'Mymensingh', 'Jamalpur', 'Daulatdia', 'Madaripur',
    'Dhaka', 'Khulna', 'Narayanganj',
  ],
}

/** Route each partner tile points to from the homepage. */
export const PARTNER_ROUTES: Record<PartnerCode, string> = {
  CIPRB:  '/fistula',   // CIPRB's primary owned module
  Bandhu: '/bondhu',
  PHD:    '/phd',
}

// Partner display names. Sources:
//   PHD    — phd-bd.com  → "Partners in Health and Development"
//   Bandhu — bdplatform4sdgs.net → "Bandhu Social Welfare Society"
//   CIPRB  — Centre for Injury Prevention and Research, Bangladesh
// Keep these in sync with i18n org.eyebrow*Full and any hero copy.
export const PARTNER_NAMES: Record<PartnerCode, { en: string; bn: string }> = {
  CIPRB:  { en: 'CIPRB',                              bn: 'সিআইপিআরবি' },
  Bandhu: { en: 'Bandhu Social Welfare Society',      bn: 'বন্ধু সোশ্যাল ওয়েলফেয়ার সোসাইটি' },
  PHD:    { en: 'Partners in Health and Development', bn: 'পার্টনার্স ইন হেলথ অ্যান্ড ডেভেলপমেন্ট' },
}

/** Normalise a district name for matching against GeoJSON shapeName. */
export function normaliseDistrict(name: string): string {
  return (name ?? '').toLowerCase().replace(/[^a-z]/g, '')
}

/** Build a Map: districtKey → array of PartnerCodes covering it. */
export function buildCoverageMap(): Map<string, PartnerCode[]> {
  const map = new Map<string, PartnerCode[]>()
  for (const partner of ['CIPRB', 'Bandhu', 'PHD'] as PartnerCode[]) {
    for (const dist of PARTNER_DISTRICTS[partner]) {
      const key = normaliseDistrict(dist)
      const existing = map.get(key) ?? []
      existing.push(partner)
      map.set(key, existing)
    }
  }
  return map
}

/**
 * Resolve a district's fill colour from the partner list covering it.
 *   0 orgs → light grey
 *   1 org  → that partner's brand colour
 *   2 orgs → yellow (#FFC000)
 *   3 orgs → red    (#FF0000)
 */
export function fillForPartners(partners: PartnerCode[] | undefined): string {
  if (!partners || partners.length === 0) return NO_COVERAGE
  // Coverage map exception (Animesh: "homepage map should have different
  // colours like before"). Use the PARTNER_TINTS scale so single-partner
  // districts are visually distinguishable. The rest of the site still
  // uses the flat UNFPA orange from PARTNER_COLORS.
  if (partners.length === 1) return PARTNER_TINTS[partners[0]]
  if (partners.length === 2) return OVERLAP_TWO_ORGS
  return OVERLAP_THREE_ORGS
}
