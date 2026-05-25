/**
 * Reporting Hub — editorial light console.
 *
 * Five report formats with magazine-style previews,
 * period selection, generate + download,
 * demo reports, anomaly alerts, and report history.
 */
import { useState } from 'react'
import { motion } from 'motion/react'
import {
  Download, FileImage, Newspaper, Presentation,
  RefreshCw, Calendar, ChevronDown,
  FileText, Bell, BarChart2, Globe,
} from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { usePolling } from '@/hooks/usePolling'
import { AlertCard } from '@/components/ui/AlertCard'
import { PageLoader, LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/utils/format'
import type { Report, Alert } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────
type PeriodType = 'biweekly' | 'monthly' | 'quarterly'

interface FormatDef {
  id: string
  title: string
  bn: string
  ext: string
  icon: React.ReactNode
  accent: string
  reportType: 'one_pager' | 'newsletter' | 'monthly_summary'
  format: 'pdf' | 'pptx'
  description: string
}

const FORMATS: FormatDef[] = [
  {
    id: 'narrative', title: 'Monthly Narrative', bn: 'মাসিক প্রতিবেদন', ext: 'DOCX · PDF · 12 pages',
    icon: <FileText size={16} />, accent: 'blue',
    reportType: 'one_pager', format: 'pdf',
    description: 'A long-form report with AI-assisted prose. Strips PII through regex before sending aggregates to Groq for narrative generation. Embeds charts and disaggregated tables.',
  },
  {
    id: 'onepager', title: 'One-Pager Brief', bn: 'এক পাতার সারমর্ম', ext: 'PDF · A4 · print-ready',
    icon: <FileImage size={16} />, accent: 'amber',
    reportType: 'one_pager', format: 'pdf',
    description: 'A single page for donor visits and high-stakes printing. Editorial poster format — one hero number, one ranked leaderboard, one sentence, signed off.',
  },
  {
    id: 'newsletter', title: 'Monthly Newsletter', bn: 'নিউজলেটার', ext: 'Responsive HTML email',
    icon: <Bell size={16} />, accent: 'emerald',
    reportType: 'newsletter', format: 'pdf',
    description: 'Goes out to partners and field staff on the first Monday of each month. Bilingual, mobile-first, brand-clean.',
  },
  {
    id: 'deck', title: 'Board Presentation', bn: 'বোর্ড প্রেজেন্টেশন', ext: 'PowerPoint · 16:9 · 16 slides',
    icon: <BarChart2 size={16} />, accent: 'coral',
    reportType: 'monthly_summary', format: 'pptx',
    description: 'For UNFPA quarterly board meetings. Conservative layouts, large numbers, photo-friendly section dividers.',
  },
  {
    id: 'infographic', title: 'Programme Infographic', bn: 'ইনফোগ্রাফিক', ext: 'PNG · 2400×3600 · print-ready',
    icon: <Globe size={16} />, accent: 'violet',
    reportType: 'one_pager', format: 'pdf',
    description: 'Wall-poster format. Designed to print at A2 or share as a single image. Bold typography, single editorial voice.',
  },
]

interface DemoCard {
  id: string
  type: 'infographic' | 'newsletter' | 'presentation'
  ext: 'pdf' | 'pptx'
  icon: React.ReactNode
  label: string
  labelBn: string
  description: string
}

const DEMO_CARDS: DemoCard[] = [
  { id: 'demo-infographic', type: 'infographic', ext: 'pdf', icon: <FileImage size={16} />, label: 'Demo Infographic', labelBn: 'ডেমো ইনফোগ্রাফিক', description: 'One-page visual summary using CPE 2022–2026 evaluation data.' },
  { id: 'demo-newsletter', type: 'newsletter', ext: 'pdf', icon: <Newspaper size={16} />, label: 'Demo Newsletter', labelBn: 'ডেমো নিউজলেটার', description: 'Formal programme bulletin using CPE evaluation data.' },
  { id: 'demo-presentation', type: 'presentation', ext: 'pptx', icon: <Presentation size={16} />, label: 'Demo Presentation', labelBn: 'ডেমো প্রেজেন্টেশন', description: 'UNFPA-branded PowerPoint using CPE evaluation data.' },
]

const PERIOD_TABS: { value: PeriodType; label: string }[] = [
  { value: 'biweekly', label: 'Bi-Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
]

const REPORT_TYPE_LABEL: Record<string, string> = {
  one_pager: 'Infographic', newsletter: 'Newsletter', monthly_summary: 'Presentation',
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const NOW = new Date()
function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

// ─── Sample data for previews ────────────────────────────────────────────────

const SAMPLE_FORMS = [
  { key: 'anc', label: 'Antenatal Care', count: 89, cat: 'Clinical' },
  { key: 'clinic', label: 'Clinic Visits', count: 76, cat: 'Clinical' },
  { key: 'hiv', label: 'HIV/STI Testing', count: 41, cat: 'Clinical' },
  { key: 'outreach', label: 'Community Outreach', count: 64, cat: 'Community' },
  { key: 'edu', label: 'Group Education', count: 52, cat: 'Community' },
  { key: 'counsel', label: 'Peer Counselling', count: 38, cat: 'Community' },
  { key: 'train', label: 'Staff Training', count: 18, cat: 'Operations' },
]

const SAMPLE_DISTRICTS = [
  { name: "Cox's Bazar", count: 156 },
  { name: 'Sylhet', count: 51 },
  { name: 'Dhaka', count: 68 },
  { name: 'Rangpur', count: 42 },
  { name: 'Mymensingh', count: 35 },
  { name: 'Khulna', count: 31 },
]

// Format-to-preview mapping
const PREVIEW_MAP: Record<string, React.FC> = {
  narrative: NarrativePreview,
  onepager: OnePagerPreview,
  newsletter: NewsletterPreview,
  deck: DeckPreview,
  infographic: InfographicPreview,
}

// ─── SectionHead ──────────────────────────────────────────────────────────────

function SectionHead({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="section-head">
      <div>
        <div className="kicker"><span className="dot" />{kicker}</div>
        <h2 className="section-title">{title}</h2>
        {sub && <p className="section-sub">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReportingHub() {
  const { user } = useAuth()
  const canSeeAll = ['super_admin', 'developer'].includes(user?.role ?? '')

  // Period state
  const [periodType, setPeriodType] = useState<PeriodType>('monthly')
  const [year, setYear] = useState(NOW.getFullYear())
  const [month, setMonth] = useState(NOW.getMonth() + 1)
  const [biStart, setBiStart] = useState(isoDate(new Date(NOW.getTime() - 14 * 86400 * 1000)))
  const [biEnd, setBiEnd] = useState(isoDate(NOW))
  const [partner, setPartner] = useState(canSeeAll ? '' : (user?.organisation ?? ''))

  // Per-card generating state
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [cardError, setCardError] = useState<Record<string, string>>({})
  const [cardOk, setCardOk] = useState<Record<string, string>>({})

  // Demo card state
  const [demoLoading, setDemoLoading] = useState<Record<string, boolean>>({})
  const [demoError, setDemoError] = useState<Record<string, string>>({})

  const { data: reports, loading, refetch } = usePolling<Report[]>({
    fetcher: () =>
      api.get('/reports/').then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),
    interval: 60_000,
  })

  const { data: alerts } = usePolling<Alert[]>({
    fetcher: () =>
      api.get('/dashboard/alerts/?acknowledged=false')
         .then((r) => (Array.isArray(r.data) ? r.data : r.data?.results ?? [])),
    interval: 60_000,
  })

  const buildPayload = (card: FormatDef) => {
    const base = {
      report_type: card.reportType,
      format: card.format,
      partner,
      period_type: periodType,
      include_narrative: true,
    }
    if (periodType === 'biweekly') {
      return { ...base, period_start: biStart, period_end: biEnd }
    }
    return { ...base, year, month }
  }

  const handleGenerate = async (card: FormatDef) => {
    setGenerating((p) => ({ ...p, [card.id]: true }))
    setCardError((p) => ({ ...p, [card.id]: '' }))
    setCardOk((p) => ({ ...p, [card.id]: '' }))
    try {
      await api.post('/reports/generate/', buildPayload(card))
      setCardOk((p) => ({ ...p, [card.id]: `${card.title} generated — see below.` }))
      setTimeout(refetch, 3000)
    } catch (err) {
      setCardError((p) => ({ ...p, [card.id]: apiErrorMessage(err) }))
    } finally {
      setGenerating((p) => ({ ...p, [card.id]: false }))
    }
  }

  const handleDownload = (report: Report) => {
    if (report.file) { window.open(report.file, '_blank') }
  }

  const handleDemoDownload = async (card: DemoCard) => {
    setDemoLoading((p) => ({ ...p, [card.id]: true }))
    setDemoError((p) => ({ ...p, [card.id]: '' }))
    try {
      const resp = await api.get(`/reports/demo/?type=${card.type}`, { responseType: 'blob' })
      const blob = resp.data as Blob
      // Check if the response is actually an error (JSON instead of file)
      if (blob.type && blob.type.includes('application/json')) {
        const text = await blob.text()
        try {
          const json = JSON.parse(text)
          throw new Error(json.detail || json.error || 'Server returned an error.')
        } catch (e) {
          if (e instanceof SyntaxError) throw new Error('Server returned an unexpected response.')
          throw e
        }
      }
      const mime = card.ext === 'pptx'
        ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        : 'application/pdf'
      const blobUrl = URL.createObjectURL(new Blob([blob], { type: mime }))
      const anchor = document.createElement('a')
      anchor.href = blobUrl
      anchor.download = `demo_${card.type}_cpe2024.${card.ext}`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      const msg = err instanceof Error ? err.message : apiErrorMessage(err, 'Download failed. Check your permissions.')
      setDemoError((p) => ({ ...p, [card.id]: msg }))
    } finally {
      setDemoLoading((p) => ({ ...p, [card.id]: false }))
    }
  }

  const anomalyAlerts = (alerts ?? []).filter((a) => a.alert_type === 'anomaly' && !a.acknowledged)
  const dateStr = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════
           HERO
           ═══════════════════════════════════════════════════════════════ */}
      <section className="hero" style={{ paddingBottom: 18 }}>
        <div className="hero-eyebrow anim-rise">
          <span className="live-dot" />
          <span>REPORTING HUB</span>
          <span className="sep">/</span>
          <span>OUTPUTS FOR {dateStr}</span>
        </div>

        <h1 className="hero-headline anim-rise d1" style={{ fontSize: 'clamp(40px, 6vw, 76px)', marginBottom: 8 }}>
          <span className="figure">Five</span> formats.
        </h1>
        <div className="anim-rise d1" style={{
          fontFamily: 'var(--display)', fontStyle: 'italic',
          fontSize: 'clamp(22px, 2.6vw, 34px)',
          lineHeight: 1.15, color: 'var(--ink-2)',
          letterSpacing: '-0.012em', maxWidth: 760, marginBottom: 4,
        }}>
          One programme, told five ways — for partners, for the board, for the field.
        </div>

        <p className="hero-lede anim-rise d2" style={{ marginTop: 18 }}>
          Spondon auto-generates the full suite on the first of every month: a narrative report with AI-assisted prose,
          a single-page brief for donor visits, an email newsletter for partners, a PowerPoint deck for board meetings,
          and a vertical infographic ready for print.
        </p>

        {/* Format shortcut buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 22, flexWrap: 'wrap' }} className="anim-rise d3">
          {FORMATS.map((f, i) => (
            <a href={`#fmt-${f.id}`} key={f.id} className="btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {f.icon}
              <span>{f.title}</span>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', marginLeft: 4 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
            </a>
          ))}
          <span style={{ flex: 1 }} />
          <button className="btn brand" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} /> Regenerate all
          </button>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
           PERIOD SELECTOR
           ═══════════════════════════════════════════════════════════════ */}
      <section className="section" style={{ marginTop: 32 }}>
        <div className="card shimmer" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Calendar size={16} style={{ color: 'var(--unfpa)' }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Reporting Period</span>
          </div>

          {/* Period type pills */}
          <div className="pills" style={{ marginBottom: 16 }}>
            {PERIOD_TABS.map((tab) => (
              <button
                key={tab.value}
                className={`pill ${periodType === tab.value ? 'on' : ''}`}
                onClick={() => setPeriodType(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Period inputs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
            {periodType === 'biweekly' ? (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Start date</label>
                  <input type="date" value={biStart} onChange={(e) => setBiStart(e.target.value)}
                    style={{
                      padding: '8px 12px', borderRadius: 10, border: '1px solid var(--hair)',
                      background: 'var(--surface-2)', fontSize: 13, color: 'var(--ink)',
                      fontFamily: 'var(--mono)',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>End date</label>
                  <input type="date" value={biEnd} onChange={(e) => setBiEnd(e.target.value)}
                    style={{
                      padding: '8px 12px', borderRadius: 10, border: '1px solid var(--hair)',
                      background: 'var(--surface-2)', fontSize: 13, color: 'var(--ink)',
                      fontFamily: 'var(--mono)',
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                    {periodType === 'quarterly' ? 'End month' : 'Month'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
                      style={{
                        appearance: 'none', padding: '8px 32px 8px 12px', borderRadius: 10,
                        border: '1px solid var(--hair)', background: 'var(--surface-2)',
                        fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--ui)', cursor: 'pointer',
                      }}
                    >
                      {MONTHS.map((m, i) => (
                        <option key={i + 1} value={i + 1}>{m}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: 10, pointerEvents: 'none', color: 'var(--muted)' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Year</label>
                  <input type="number" value={year} min={2024} max={2030}
                    onChange={(e) => setYear(Number(e.target.value))}
                    style={{
                      width: 80, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--hair)',
                      background: 'var(--surface-2)', fontSize: 13, color: 'var(--ink)',
                      fontFamily: 'var(--mono)',
                    }}
                  />
                </div>
                {periodType === 'quarterly' && (
                  <span className="mute" style={{ fontSize: 12 }}>← covers 3 months ending this month</span>
                )}
              </>
            )}

            {/* Partner selector */}
            {canSeeAll && (
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Organisation</label>
                <div style={{ position: 'relative' }}>
                  <select value={partner} onChange={(e) => setPartner(e.target.value)}
                    style={{
                      appearance: 'none', padding: '8px 32px 8px 12px', borderRadius: 10,
                      border: '1px solid var(--hair)', background: 'var(--surface-2)',
                      fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--ui)', cursor: 'pointer',
                    }}
                  >
                    <option value="">All Partners</option>
                    <option value="PHD">PHD</option>
                    <option value="Bandhu">Bandhu</option>
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: 10, pointerEvents: 'none', color: 'var(--muted)' }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
           FORMAT SECTIONS — with magazine-style previews
           ═══════════════════════════════════════════════════════════════ */}
      {FORMATS.map((f, i) => {
        const PreviewComponent = PREVIEW_MAP[f.id]
        return (
          <section key={f.id} id={`fmt-${f.id}`} className="section" style={{ marginTop: 64, marginBottom: i === FORMATS.length - 1 ? 24 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32 }}>
              {/* Number */}
              <span style={{
                fontFamily: 'var(--display)', fontStyle: 'italic',
                fontSize: 64, lineHeight: 1, color: 'var(--muted-3, rgba(0,0,0,0.08))',
                flexShrink: 0, width: 80,
              }}>
                {String(i + 1).padStart(2, '0')}
              </span>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Format head */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, marginBottom: 24 }}>
                  <div>
                    <div className={`kicker ${f.accent}`} style={{ marginBottom: 8 }}><span className="dot" />{f.ext}</div>
                    <h2 style={{
                      fontFamily: 'var(--display)', fontStyle: 'italic', fontWeight: 400,
                      fontSize: 44, lineHeight: 1, letterSpacing: '-0.02em',
                      margin: 0, color: 'var(--ink)',
                    }}>
                      {f.title}
                    </h2>
                    <div className="bn mute" style={{ fontSize: 14, marginTop: 6 }}>{f.bn}</div>
                    <p style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 12, maxWidth: 620 }}>{f.description}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'flex-start' }}>
                    <button
                      className="btn brand"
                      onClick={() => handleGenerate(f)}
                      disabled={generating[f.id]}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      {generating[f.id]
                        ? <LoadingSpinner size="sm" />
                        : <RefreshCw size={14} />
                      }
                      {generating[f.id] ? 'Generating…' : 'Generate'}
                    </button>
                    <button className="btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Download size={14} /> Download
                    </button>
                  </div>
                </div>

                {/* Feedback */}
                {cardError[f.id] && (
                  <div className="card" style={{ background: 'rgba(233,69,96,0.06)', borderColor: 'rgba(233,69,96,0.2)', padding: '10px 14px', marginBottom: 12, color: 'var(--rose)', fontSize: 13 }}>
                    {cardError[f.id]}
                  </div>
                )}
                {cardOk[f.id] && (
                  <div className="card" style={{ background: 'rgba(31,154,109,0.06)', borderColor: 'rgba(31,154,109,0.2)', padding: '10px 14px', marginBottom: 12, color: 'var(--emerald)', fontSize: 13 }}>
                    {cardOk[f.id]}
                  </div>
                )}

                {/* Preview */}
                {PreviewComponent && <PreviewComponent />}
              </div>
            </div>
          </section>
        )
      })}

      {/* ═══════════════════════════════════════════════════════════════
           DEMO REPORTS
           ═══════════════════════════════════════════════════════════════ */}
      <section className="section" style={{ marginTop: 56 }}>
        <SectionHead
          kicker="DEMO REPORTS"
          title="Sample outputs from CPE 2022–2026"
          sub="Same pipeline as live reports — previews the exact output format."
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {DEMO_CARDS.map((card) => (
            <div key={card.id} className="card snug" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'var(--unfpa-bright-10, rgba(0,145,199,0.1))',
                  color: 'var(--unfpa)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {card.icon}
                </span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{card.label}</div>
                  <div className="bn mute" style={{ fontSize: 11 }}>{card.labelBn}</div>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, flex: 1 }}>{card.description}</p>
              {demoError[card.id] && (
                <span style={{ fontSize: 11, color: 'var(--rose)', lineHeight: 1.4 }}>{demoError[card.id]}</span>
              )}
              <button
                className="btn"
                onClick={() => handleDemoDownload(card)}
                disabled={demoLoading[card.id]}
                style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {demoLoading[card.id]
                  ? <LoadingSpinner size="sm" />
                  : <Download size={14} />
                }
                {demoLoading[card.id] ? 'Building…' : 'Download Demo'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
           ANOMALY ALERTS
           ═══════════════════════════════════════════════════════════════ */}
      {anomalyAlerts.length > 0 && (
        <section className="section" style={{ marginTop: 40 }}>
          <SectionHead
            kicker="AI ANOMALY ALERTS"
            title={`${anomalyAlerts.length} anomalies detected`}
            sub="AI-generated alerts flagging unexpected data patterns."
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {anomalyAlerts.map((a) => <AlertCard key={a.id} alert={a} />)}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
           GENERATED REPORTS
           ═══════════════════════════════════════════════════════════════ */}
      <section className="section" style={{ marginTop: 56, marginBottom: 80 }}>
        <SectionHead
          kicker="ARCHIVE"
          title="Generated reports"
          sub="All reports generated through the system."
        />

        {loading && !reports ? (
          <PageLoader />
        ) : (reports ?? []).length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
            <Newspaper size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <div style={{ fontSize: 14 }}>No reports generated yet.</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Use the cards above to generate your first report.</div>
          </div>
        ) : (
          <motion.div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
          >
            {(reports ?? []).map((report) => (
              <motion.div
                key={report.id}
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
                }}
                className="card snug"
                style={{ cursor: report.file ? 'pointer' : 'default' }}
                onClick={() => handleDownload(report)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {REPORT_TYPE_LABEL[report.report_type] ?? report.report_type_display}
                    </div>
                    <div className="mono mute" style={{ fontSize: 10.5, marginTop: 2 }}>
                      {report.format?.toUpperCase()}
                    </div>
                  </div>
                  <span className="tag blue" style={{ fontSize: 10 }}>
                    {((report as unknown as Record<string, unknown>).period_type_display as string) ?? 'Monthly'}
                  </span>
                </div>

                {report.partner && (
                  <span className="tag" style={{ marginBottom: 6 }}>{report.partner}</span>
                )}

                <div className="mono mute" style={{ fontSize: 10.5, marginTop: 4 }}>
                  {formatDateTime(report.created_at)}
                </div>

                {report.file && (
                  <div style={{ marginTop: 8 }}>
                    <span className="btn" style={{ fontSize: 12, height: 30, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Download size={12} /> Download
                    </span>
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   PREVIEW COMPONENTS — magazine-style sample output previews
   ══════════════════════════════════════════════════════════════════════════════ */

// ─── 01. NARRATIVE PREVIEW — magazine spread ─────────────────────────────────

function NarPage({ children, style, edge }: { children: React.ReactNode; style?: React.CSSProperties; edge?: 'left' | 'right' }) {
  return (
    <div style={{
      ...style,
      background: 'white',
      borderRadius: edge === 'left' ? '0 8px 8px 0' : edge === 'right' ? '8px 0 0 8px' : 8,
      boxShadow: edge === 'left'
        ? '-6px 0 16px rgba(20,32,43,0.08), 0 12px 36px rgba(20,32,43,0.10)'
        : edge === 'right'
        ? '6px 0 16px rgba(20,32,43,0.08), 0 12px 36px rgba(20,32,43,0.10)'
        : '0 12px 36px rgba(20,32,43,0.12), 0 2px 6px rgba(20,32,43,0.06)',
      border: '1px solid var(--hair)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  )
}

function NarPageHeader({ page, section }: { page: string; section: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--hair)' }}>
      <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: '0.12em' }}>SPONDON · MAY 2026</div>
      <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: '0.06em' }}>{section.toUpperCase()} · {page}</div>
    </div>
  )
}

function NarrativePreview() {
  const A4: React.CSSProperties = { width: 460, aspectRatio: '210 / 297' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, alignItems: 'center' }}>

      {/* COVER */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
        <NarPage style={A4}>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '44px 40px 32px', position: 'relative' }}>
            {/* Top accent line */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--unfpa) 0%, var(--coral) 50%, var(--amber) 100%)' }} />

            {/* Header marks */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 }}>
              <div className="mono" style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--muted)' }}>SPONDON IDMS</div>
              <div className="mono" style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--muted)' }}>VOL. 02 · ISSUE 05</div>
            </div>

            {/* Title */}
            <div style={{ marginTop: 'auto' }}>
              <div className="kicker" style={{ marginBottom: 14 }}><span className="dot" />CIPRB · UNFPA BANGLADESH</div>
              <div style={{
                fontFamily: 'var(--display)', fontStyle: 'italic', fontWeight: 400,
                fontSize: 56, lineHeight: 0.95, letterSpacing: '-0.025em', color: 'var(--ink)',
              }}>Programme<br />Monitoring<br />Report</div>
              <div className="bn" style={{ fontSize: 15, color: 'var(--muted)', marginTop: 14 }}>
                মে ২০২৬ · মাসিক প্রতিবেদন
              </div>
            </div>

            {/* Pulled stat */}
            <div style={{ marginTop: 28, padding: '18px 0', borderTop: '1px solid var(--hair)', borderBottom: '1px solid var(--hair)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
                <div>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: '0.12em' }}>THIS MONTH</div>
                  <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 50, lineHeight: 1, color: 'var(--unfpa)', letterSpacing: '-0.025em' }}>476</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.06em' }}>SUBMISSIONS · +8.4% MoM</div>
                </div>
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: '0.12em' }}>EDITION</div>
                  <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 32, lineHeight: 1, color: 'var(--ink)' }}>May 2026</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>GENERATED 01 JUN 2026</div>
                </div>
              </div>
            </div>

            {/* Authors */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
              <div className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', letterSpacing: '0.06em' }}>
                AUTHORS · M&E TEAM
              </div>
              <div className="mono" style={{ fontSize: 8.5, color: 'var(--muted-2, #aaa)', letterSpacing: '0.06em', textAlign: 'right' }}>
                AI-ASSISTED NARRATIVE<br />SIGNED OFF BY M&E
              </div>
            </div>
          </div>
        </NarPage>
      </div>

      {/* 2-PAGE EDITORIAL SPREAD */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
        <NarPage style={A4} edge="right">
          <div style={{ height: '100%', padding: '40px 32px 32px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <NarPageHeader page="2" section="Introduction" />
            <div className="kicker" style={{ marginBottom: 12 }}><span className="dot" />SECTION 01</div>
            <h3 style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontWeight: 400, fontSize: 34, lineHeight: 1, letterSpacing: '-0.015em', margin: 0 }}>
              The month in three numbers.
            </h3>

            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { n: '476', lab: 'SUBMISSIONS', sub: '+8.4% vs April, the highest monthly total of the year.', color: 'var(--unfpa)' },
                { n: '38', lab: 'ACTIVE WORKERS', sub: 'across 10 service centres in 5 divisions.', color: 'var(--coral)' },
                { n: '12', lab: 'ANC REFERRALS', sub: "From Cox's Bazar — 24% above the rolling average.", color: 'var(--amber)' },
              ].map(({ n, lab, sub, color }) => (
                <div key={lab} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', borderTop: '1px solid var(--hair)', paddingTop: 14 }}>
                  <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 46, lineHeight: 0.9, color, letterSpacing: '-0.025em', flexShrink: 0, minWidth: 80 }}>{n}</div>
                  <div style={{ flex: 1, marginTop: 4 }}>
                    <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: '0.12em', marginBottom: 4 }}>{lab}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>{sub}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--hair)' }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em' }}>→ CONTINUED ON FACING PAGE</div>
            </div>
          </div>
        </NarPage>

        <NarPage style={A4} edge="left">
          <div style={{ height: '100%', padding: '40px 32px 32px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <NarPageHeader page="3" section="Introduction" />

            <div style={{ position: 'relative', marginTop: 8 }}>
              <span style={{
                float: 'left', fontFamily: 'var(--display)', fontStyle: 'italic', fontWeight: 400,
                fontSize: 76, lineHeight: 0.85, color: 'var(--unfpa)',
                marginRight: 10, marginTop: 2, marginBottom: -4, letterSpacing: '-0.04em',
              }}>I</span>
              <p style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--ink-2)', margin: 0, textAlign: 'justify' }}>
                n May 2026, the Spondon programme recorded its strongest monthly performance since launch — 476
                field submissions across PHD and Bondhu, an 8.4% rise on the previous month. The growth was
                uneven: antenatal registration climbed sharply, group education held steady, while operations slipped.
              </p>
            </div>

            <p style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--ink-2)', margin: '10px 0 0', textAlign: 'justify' }}>
              Two stories deserve attention. First, the GBV referral loop from intake to support — a 24-hour pathway that
              held in every recorded case. Second, a dip in ANC follow-up at Ukhiya, now flagged in two consecutive alerts.
            </p>

            {/* Pull quote */}
            <div style={{ marginTop: 20, padding: '14px 0', borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--ink)' }}>
              <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontWeight: 400, fontSize: 20, lineHeight: 1.2, color: 'var(--ink)', letterSpacing: '-0.012em' }}>
                "The numbers held; the system responded. Both matter."
              </div>
              <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', marginTop: 8, letterSpacing: '0.08em' }}>
                — DR. SHAHIN BEGUM · PHD FOCAL POINT
              </div>
            </div>

            <p style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--ink-2)', margin: '14px 0 0', textAlign: 'justify' }}>
              Section two unpacks the activity profile by category. Section three reports geography. Section four
              addresses the alerts opened this month and how each was resolved.
            </p>
          </div>
        </NarPage>
      </div>

      {/* CLOSING */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
        <NarPage style={A4}>
          <div style={{ height: '100%', padding: '44px 40px 32px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <NarPageHeader page="12" section="Closing" />
            <div className="kicker" style={{ marginBottom: 14 }}><span className="dot" style={{ background: 'var(--coral)' }} />CLOSING REMARKS</div>

            <div style={{ marginTop: 'auto' }}>
              <div style={{
                fontFamily: 'var(--display)', fontStyle: 'italic', fontWeight: 400,
                fontSize: 30, lineHeight: 1.15, letterSpacing: '-0.015em', color: 'var(--ink)',
              }}>
                "Every submission is one woman, one visit, one record of care. The numbers are the consequence of
                a system that worked this month."
              </div>

              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 500 }}>Rafia Ahmed</div>
                  <div className="mono mute" style={{ fontSize: 9.5, marginTop: 2 }}>M&E LEAD · CIPRB</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 500 }}>UNFPA Bangladesh</div>
                  <div className="mono mute" style={{ fontSize: 9.5, marginTop: 2 }}>SIGNED 01 JUN 2026</div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 28, padding: '14px 0', borderTop: '1px solid var(--hair)', display: 'flex', justifyContent: 'space-between' }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em' }}>SPONDON IDMS · MAY 2026 · END</div>
              <div className="mono" style={{ fontSize: 9, color: 'var(--muted)' }}>12 / 12</div>
            </div>
          </div>
        </NarPage>
      </div>
    </div>
  )
}

// ─── 02. ONE-PAGER PREVIEW — editorial poster ────────────────────────────────

function OnePagerPreview() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: 600, aspectRatio: '210 / 297', background: 'white', borderRadius: 8,
        boxShadow: '0 20px 60px rgba(20, 32, 43, 0.15), 0 4px 10px rgba(20,32,43,0.06)',
        border: '1px solid var(--hair)', position: 'relative', overflow: 'hidden',
        display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: 'auto 1fr auto',
      }}>

        {/* HEADER BAND */}
        <div style={{
          background: 'linear-gradient(135deg, var(--unfpa-deep, #002A3D) 0%, var(--unfpa) 100%)',
          padding: '24px 32px 20px', position: 'relative', overflow: 'hidden', color: 'white',
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(242,106,79,0.55), transparent 60%)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.65)' }}>SPONDON IDMS · ONE-PAGER</div>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.5)' }}>NO. 12</div>
          </div>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontWeight: 400, fontSize: 40, lineHeight: 0.95, letterSpacing: '-0.025em', color: 'white' }}>May, 2026.</div>
          <div className="mono" style={{ fontSize: 10.5, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.75)', marginTop: 6 }}>CIPRB · UNFPA BANGLADESH</div>
        </div>

        {/* MAIN */}
        <div style={{ padding: '24px 32px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* HEADLINE NUMBER */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 18, alignItems: 'stretch' }}>
            <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontWeight: 400, fontSize: 140, lineHeight: 0.86, color: 'var(--unfpa)', letterSpacing: '-0.04em' }}>476</div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingTop: 6 }}>
              <div>
                <div className="mono" style={{ fontSize: 9.5, letterSpacing: '0.12em', color: 'var(--muted)' }}>FIELD SUBMISSIONS · MAY 2026</div>
                <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 18, lineHeight: 1.15, letterSpacing: '-0.012em', color: 'var(--ink-2)', marginTop: 4 }}>
                  +8.4% on April. The highest monthly total of the year.
                </div>
              </div>
              <div style={{ paddingTop: 8, borderTop: '1px solid var(--hair)' }}>
                <div className="mono mute" style={{ fontSize: 9, letterSpacing: '0.08em', marginBottom: 4 }}>12-MONTH TRAJECTORY</div>
                <svg viewBox="0 0 220 32" style={{ width: 220, height: 32 }}>
                  <polyline
                    points="0,28 20,25 40,26 60,22 80,20 100,21 120,18 140,15 160,14 180,10 200,8 220,4"
                    fill="none" stroke="var(--unfpa)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  />
                  <polyline
                    points="0,28 20,25 40,26 60,22 80,20 100,21 120,18 140,15 160,14 180,10 200,8 220,4"
                    fill="url(#sparkGrad)" stroke="none"
                  />
                  <defs>
                    <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--unfpa)" stopOpacity="0.16" />
                      <stop offset="100%" stopColor="var(--unfpa)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
          </div>

          {/* 4-up split */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--hair)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--hair)' }}>
            {[
              { n: '369', lab: 'PHD', sub: 'clinical, ANC, MH', color: 'var(--unfpa)' },
              { n: '287', lab: 'BONDHU', sub: 'outreach, counselling', color: 'var(--violet, #8B5CF6)' },
              { n: '38', lab: 'WORKERS', sub: 'active in field', color: 'var(--emerald)' },
              { n: '12', lab: 'PENDING', sub: 'review · 3 urgent', color: 'var(--coral)' },
            ].map(({ n, lab, sub, color }) => (
              <div key={lab} style={{ background: 'white', padding: '12px 12px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 32, lineHeight: 0.95, color, letterSpacing: '-0.02em' }}>{n}</div>
                <div className="mono" style={{ fontSize: 8.5, color: 'var(--muted)', letterSpacing: '0.12em' }}>{lab}</div>
                <div style={{ fontSize: 10, color: 'var(--ink-3, #999)', marginTop: 1 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* District leaderboard + categories */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 16 }}>
            <div>
              <div className="kicker" style={{ marginBottom: 6 }}><span className="dot" />TOP DISTRICTS</div>
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--hair)', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {SAMPLE_DISTRICTS.slice(0, 6).map((d, i) => {
                  const max = SAMPLE_DISTRICTS[0].count
                  const pct = (d.count / max) * 100
                  return (
                    <div key={d.name}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span className="mono mute" style={{ fontSize: 9 }}>{String(i + 1).padStart(2, '0')}</span>
                          <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--ink)' }}>{d.name}</span>
                        </span>
                        <span style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 18, color: 'var(--unfpa)', lineHeight: 1 }}>{d.count}</span>
                      </div>
                      <div style={{ height: 3, background: 'var(--surface-3, #eee)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--unfpa), var(--unfpa-bright, #0091C7))' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="kicker" style={{ marginBottom: 6 }}><span className="dot" style={{ background: 'var(--coral)' }} />BY CATEGORY</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { lab: 'Clinical', val: 287, color: 'var(--unfpa-bright, #0091C7)', sub: 'Clinic visits, ANC, HIV testing' },
                  { lab: 'Community', val: 171, color: 'var(--coral)', sub: 'Outreach, education, counselling' },
                  { lab: 'Operations', val: 18, color: 'var(--amber)', sub: 'Training, mobile camps, coord.' },
                ].map(({ lab, val, color, sub }) => {
                  const pct = Math.round((val / 476) * 100)
                  return (
                    <div key={lab}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>{lab}</div>
                          <div className="mono mute" style={{ fontSize: 9, marginTop: 1 }}>{sub}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 22, lineHeight: 1, color }}>{val}</div>
                          <div className="mono mute" style={{ fontSize: 9, marginTop: 1 }}>{pct}%</div>
                        </div>
                      </div>
                      <div style={{ height: 4, background: 'var(--surface-3, #eee)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)`, borderRadius: 999 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Editorial sentence */}
          <div style={{ padding: '14px 0', borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--ink)' }}>
            <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontWeight: 400, fontSize: 16, lineHeight: 1.35, color: 'var(--ink)', letterSpacing: '-0.012em' }}>
              "May closed with the strongest field activity in twelve months — the GBV referral loop held, and operations resumed despite early monsoon flooding."
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{
          padding: '12px 32px', borderTop: '1px solid var(--hair)', background: 'var(--surface-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div className="mono" style={{ fontSize: 8.5, color: 'var(--muted)', letterSpacing: '0.1em' }}>GENERATED 01 JUN 2026 · M&E TEAM · SIGNED OFF</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="bn" style={{ fontSize: 11, color: 'var(--ink-2)' }}>মে ২০২৬</div>
            <div className="mono" style={{ fontSize: 8.5, color: 'var(--muted-2, #aaa)' }}>SPONDON · v2.3.1</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 03. NEWSLETTER PREVIEW — email client mockup ────────────────────────────

function NewsletterPreview() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: 540, background: 'white', borderRadius: 6,
        boxShadow: '0 12px 32px rgba(20,32,43,0.10)',
        border: '1px solid var(--hair)', overflow: 'hidden',
      }}>
        {/* Email chrome */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--hair)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#FF5F57' }} />
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#FEBC2E' }} />
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#27C840' }} />
          <div className="mono" style={{ marginLeft: 12, fontSize: 10.5, color: 'var(--muted)' }}>
            <b style={{ color: 'var(--ink-2)' }}>From:</b> Spondon IDMS &lt;noreply@ciprb-spondon.org&gt;
            <span style={{ margin: '0 8px' }}>·</span>
            <b style={{ color: 'var(--ink-2)' }}>To:</b> partners@unfpa-bd
          </div>
        </div>

        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--hair)' }}>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>Subject:</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Spondon Monthly · May 2026 · 476 submissions, +8.4% MoM</div>
        </div>

        {/* Hero */}
        <div style={{ padding: '24px 28px 20px', background: 'linear-gradient(135deg, #F0F8FB 0%, #FDF1ED 100%)' }}>
          <div className="kicker" style={{ marginBottom: 8 }}><span className="dot" />SPONDON MONTHLY · MAY 2026</div>
          <h3 style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 26, lineHeight: 1.1, fontWeight: 400, margin: 0, letterSpacing: '-0.015em' }}>
            The programme grew by <span style={{ color: 'var(--unfpa)' }}>8.4%</span> in May.
          </h3>
          <p style={{ marginTop: 10, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            476 field submissions logged across PHD and Bondhu. Cox's Bazar continues to lead at 156.
            Two follow-up items are open.
          </p>
          <div className="bn mute" style={{ fontSize: 12, marginTop: 8 }}>
            মে মাসে কর্মসূচি ৮.৪% বৃদ্ধি পেয়েছে।
          </div>
        </div>

        <div style={{ padding: '18px 28px', borderBottom: '1px solid var(--hair)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { n: '476', lab: 'Submissions', c: 'var(--unfpa)' },
              { n: '369', lab: 'from PHD', c: 'var(--coral)' },
              { n: '287', lab: 'from Bondhu', c: 'var(--violet, #8B5CF6)' },
            ].map(({ n, lab, c }) => (
              <div key={lab} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 38, lineHeight: 1, color: c, letterSpacing: '-0.02em' }}>{n}</div>
                <div className="mono mute" style={{ fontSize: 10, marginTop: 4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{lab}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '18px 28px', borderBottom: '1px solid var(--hair)' }}>
          <div className="kicker" style={{ marginBottom: 8 }}><span className="dot" />HIGHLIGHTS</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
            <li><b style={{ color: 'var(--ink)' }}>Antenatal care up 12%.</b> PHD ANC registrations rose to 67 in Cox's Bazar and Sylhet tea-garden zones.</li>
            <li><b style={{ color: 'var(--ink)' }}>HIV/STI testing strong.</b> 41 tests this month, one reactive case linked to care within 24 hours.</li>
            <li><b style={{ color: 'var(--ink)' }}>GBV protocol triggered three times.</b> All three referred to district medical and legal pathways; M&E reviewed.</li>
          </ul>
        </div>

        <div style={{
          height: 100, background: 'repeating-linear-gradient(135deg, var(--surface-3, #eee) 0 12px, var(--surface-2) 12px 24px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: '0.1em',
        }}>FIELD PHOTO — COX'S BAZAR DIC</div>

        <div style={{ padding: '18px 28px', borderBottom: '1px solid var(--hair)' }}>
          <div className="kicker" style={{ marginBottom: 8 }}><span className="dot" />WATCH LIST</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="tag amber">!</span>
              <span><b style={{ color: 'var(--ink)' }}>Ukhiya Outreach</b> — 51-hour submission gap.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="tag amber">!</span>
              <span><b style={{ color: 'var(--ink)' }}>Cox's Bazar ANC</b> — 24% drop in referrals vs March.</span>
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 28px 18px', textAlign: 'center' }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.06em' }}>
            CIPRB · UNFPA BANGLADESH<br />
            <span style={{ color: 'var(--muted-2, #aaa)' }}>You are receiving this because you are a partner of the Spondon programme.</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 04. DECK PREVIEW — PowerPoint slide thumbnails ──────────────────────────

function SlideThumb({ n, of, children }: { n: number; of: number; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'relative', aspectRatio: '16 / 9', borderRadius: 8,
      border: '1px solid var(--hair)',
      boxShadow: '0 10px 28px rgba(20,32,43,0.10), 0 2px 4px rgba(20,32,43,0.05)',
      overflow: 'hidden', background: 'white',
    }}>
      {children}
      <div style={{
        position: 'absolute', bottom: 6, right: 10,
        fontFamily: 'var(--mono)', fontSize: 8, color: 'rgba(0,0,0,0.35)',
        letterSpacing: '0.06em', zIndex: 10, background: 'rgba(255,255,255,0.7)',
        padding: '1px 4px', borderRadius: 3, backdropFilter: 'blur(4px)',
      }}>
        {String(n).padStart(2, '0')} / {String(of).padStart(2, '0')}
      </div>
    </div>
  )
}

function DeckPreview() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, maxWidth: 1200 }}>

      {/* 01 — TITLE */}
      <SlideThumb n={1} of={16}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #002A3D 0%, #00658C 60%, #0091C7 100%)' }} />
        <div style={{ position: 'absolute', top: -40, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(242,106,79,0.55), transparent 60%)' }} />
        <div style={{ position: 'absolute', inset: 0, padding: '22px 24px', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="mono" style={{ fontSize: 8, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.65)' }}>CIPRB · UNFPA BANGLADESH</div>
            <div className="mono" style={{ fontSize: 8, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>BOARD QUARTERLY</div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 36, lineHeight: 0.95, letterSpacing: '-0.025em' }}>Programme<br />update.</div>
            <div className="bn" style={{ fontSize: 11, marginTop: 6, color: 'rgba(255,255,255,0.7)' }}>মে ২০২৬ · কর্মসূচি প্রতিবেদন</div>
          </div>
          <div className="mono" style={{ fontSize: 8, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)' }}>SPONDON IDMS · 25 MAY 2026</div>
        </div>
      </SlideThumb>

      {/* 02 — AGENDA */}
      <SlideThumb n={2} of={16}>
        <div style={{ position: 'absolute', inset: 0, background: 'white', padding: '18px 22px' }}>
          <div className="mono" style={{ fontSize: 8, color: 'var(--muted)', letterSpacing: '0.14em' }}>AGENDA</div>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 18, lineHeight: 1.05, color: 'var(--ink)', marginTop: 3, letterSpacing: '-0.012em' }}>What we'll cover.</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {['Key indicators', 'Activity by category', 'Geography & centres', 'Watch list & alerts', 'Q&A and next month'].map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: i < 4 ? '1px solid var(--hair)' : 'none', paddingBottom: 3 }}>
                <span style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 20, lineHeight: 1, color: i === 0 ? 'var(--unfpa)' : 'var(--muted-3, rgba(0,0,0,0.08))', width: 22 }}>{i + 1}</span>
                <span style={{ fontSize: 10, color: 'var(--ink-2)', flex: 1 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </SlideThumb>

      {/* 03 — BIG NUMBER */}
      <SlideThumb n={4} of={16}>
        <div style={{ position: 'absolute', inset: 0, background: 'var(--paper, #F7F4EE)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div className="mono" style={{ fontSize: 8, letterSpacing: '0.16em', color: 'var(--muted)' }}>SUBMISSIONS · MAY 2026</div>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 86, lineHeight: 0.85, color: 'var(--unfpa)', letterSpacing: '-0.04em', marginTop: 4 }}>476</div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--emerald)', letterSpacing: '0.06em', marginTop: 4, fontWeight: 500 }}>+8.4% vs APRIL</div>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 11, lineHeight: 1.3, color: 'var(--ink-2)', marginTop: 8, maxWidth: 200 }}>
            The strongest monthly total since the programme launched.
          </div>
        </div>
      </SlideThumb>

      {/* 04 — KPI DASHBOARD */}
      <SlideThumb n={6} of={16}>
        <div style={{ position: 'absolute', inset: 0, background: 'white', padding: '16px 20px' }}>
          <div className="mono" style={{ fontSize: 7.5, color: 'var(--muted)', letterSpacing: '0.14em' }}>SECTION 01 · INDICATORS</div>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 16, lineHeight: 1.05, color: 'var(--ink)', marginTop: 3 }}>By the numbers.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginTop: 8 }}>
            {[
              { n: '476', lab: 'SUBS', c: 'var(--unfpa)', d: '+8.4%' },
              { n: '369', lab: 'PHD', c: 'var(--coral)', d: '+4.5%' },
              { n: '287', lab: 'BONDHU', c: 'var(--violet, #8B5CF6)', d: '+8.4%' },
              { n: '12', lab: 'PENDING', c: 'var(--amber)', d: '—' },
            ].map(({ n, lab, c, d }) => (
              <div key={lab} style={{ background: 'var(--surface-2)', border: '1px solid var(--hair)', borderRadius: 4, padding: 6 }}>
                <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 18, lineHeight: 1, color: c }}>{n}</div>
                <div className="mono" style={{ fontSize: 7, color: 'var(--muted)', letterSpacing: '0.1em', marginTop: 1 }}>{lab}</div>
                <div className="mono" style={{ fontSize: 7, color: 'var(--emerald)', marginTop: 1 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </SlideThumb>

      {/* 05 — TOP DISTRICTS */}
      <SlideThumb n={9} of={16}>
        <div style={{ position: 'absolute', inset: 0, background: 'white', padding: '16px 18px' }}>
          <div className="mono" style={{ fontSize: 7.5, color: 'var(--muted)', letterSpacing: '0.14em' }}>SECTION 03 · GEOGRAPHY</div>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 16, lineHeight: 1.05, color: 'var(--ink)', marginTop: 3 }}>Where the work happens.</div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {SAMPLE_DISTRICTS.slice(0, 6).map((d, i) => {
              const max = SAMPLE_DISTRICTS[0].count
              const pct = (d.count / max) * 100
              return (
                <div key={d.name}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 8.5, marginBottom: 2 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="mono mute" style={{ fontSize: 7 }}>{String(i + 1).padStart(2, '0')}</span>
                      <b style={{ color: 'var(--ink)' }}>{d.name}</b>
                    </span>
                    <span style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 12, color: 'var(--unfpa)' }}>{d.count}</span>
                  </div>
                  <div style={{ height: 2, background: 'var(--surface-3, #eee)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--unfpa)' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </SlideThumb>

      {/* 06 — CLOSING QUOTE */}
      <SlideThumb n={14} of={16}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #F26A4F 0%, #FFB48A 100%)', padding: '22px 26px', display: 'flex', flexDirection: 'column', justifyContent: 'center', color: 'white' }}>
          <div className="mono" style={{ fontSize: 8, letterSpacing: '0.14em', opacity: 0.7 }}>SECTION 05 · CLOSING</div>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontWeight: 400, fontSize: 20, lineHeight: 1.15, letterSpacing: '-0.015em', marginTop: 8, maxWidth: '90%' }}>
            "We are on track to exceed Q2 targets — but Ukhiya needs attention this week."
          </div>
          <div className="mono" style={{ fontSize: 8, letterSpacing: '0.08em', marginTop: 10, opacity: 0.8 }}>— DR. SHAHIN BEGUM · PHD FOCAL POINT</div>
        </div>
      </SlideThumb>
    </div>
  )
}

// ─── 05. INFOGRAPHIC PREVIEW — vertical poster ──────────────────────────────

function InfographicPreview() {
  const maxForm = Math.max(...SAMPLE_FORMS.map(f => f.count))

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: 440, background: 'white', borderRadius: 8,
        boxShadow: '0 20px 60px rgba(20, 32, 43, 0.15)',
        border: '1px solid var(--hair)', overflow: 'hidden', position: 'relative',
      }}>
        {/* HEADER */}
        <div style={{
          padding: '32px 32px 22px',
          background: 'linear-gradient(180deg, #003B53 0%, #00658C 100%)',
          color: 'white', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(242,106,79,0.4), transparent 60%)' }} />
          <div className="mono" style={{ fontSize: 10, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.65)' }}>SPONDON IDMS · INFOGRAPHIC</div>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 42, lineHeight: 1, marginTop: 12, letterSpacing: '-0.025em' }}>May,<br />in numbers.</div>
          <div className="bn" style={{ fontSize: 13, marginTop: 8, color: 'rgba(255,255,255,0.7)' }}>মে মাসের কর্মসূচি, এক নজরে।</div>
        </div>

        {/* BIG NUMBER */}
        <div style={{ padding: '26px 32px', textAlign: 'center', borderBottom: '1px solid var(--hair)' }}>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 96, lineHeight: 1, color: 'var(--unfpa)', letterSpacing: '-0.03em' }}>476</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.12em', marginTop: 6 }}>FIELD SUBMISSIONS · ALL OF MAY 2026</div>
          <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 13 }}>
            <span className="emerald" style={{ fontWeight: 600 }}>+8.4%</span>
            <span className="mute" style={{ marginLeft: 6 }}>vs April · 439</span>
          </div>
        </div>

        {/* PHD / BONDHU SPLIT */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--hair)' }}>
          <div style={{ padding: '18px 20px', borderRight: '1px solid var(--hair)' }}>
            <div className="kicker"><span className="dot" />PHD</div>
            <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 42, lineHeight: 1, color: 'var(--unfpa)', marginTop: 4 }}>369</div>
            <div className="mono mute" style={{ fontSize: 10, marginTop: 2 }}>SUBMISSIONS</div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.45 }}>
              Driven by clinic visits and antenatal cards in Cox's Bazar.
            </div>
          </div>
          <div style={{ padding: '18px 20px' }}>
            <div className="kicker"><span className="dot" style={{ background: 'var(--coral)' }} />BONDHU</div>
            <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 42, lineHeight: 1, color: 'var(--coral)', marginTop: 4 }}>287</div>
            <div className="mono mute" style={{ fontSize: 10, marginTop: 2 }}>SUBMISSIONS</div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.45 }}>
              Outreach and counselling at Chattogram and Daulatdia.
            </div>
          </div>
        </div>

        {/* TOP DISTRICTS */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--hair)' }}>
          <div className="kicker" style={{ marginBottom: 10 }}><span className="dot" style={{ background: 'var(--amber)' }} />WHERE THE WORK HAPPENS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {SAMPLE_DISTRICTS.slice(0, 6).map((d, i) => {
              const max = SAMPLE_DISTRICTS[0].count
              const pct = (d.count / max) * 100
              return (
                <div key={d.name}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span className="mono mute" style={{ fontSize: 10 }}>{String(i + 1).padStart(2, '0')}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>{d.name}</span>
                    </span>
                    <span style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 20, color: 'var(--unfpa)', lineHeight: 1 }}>{d.count}</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--surface-3, #eee)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--unfpa), var(--unfpa-bright, #0091C7))' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* FORM BARS */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--hair)' }}>
          <div className="kicker" style={{ marginBottom: 10 }}><span className="dot" style={{ background: 'var(--violet, #8B5CF6)' }} />WHAT WE LOGGED MOST</div>
          {SAMPLE_FORMS.slice(0, 6).sort((a, b) => b.count - a.count).map(f => {
            const barColor = f.cat === 'Clinical'
              ? 'linear-gradient(90deg, var(--unfpa), var(--unfpa-bright, #0091C7))'
              : f.cat === 'Community'
              ? 'linear-gradient(90deg, var(--coral), #FBAF98)'
              : 'linear-gradient(90deg, var(--amber), #FBCC6B)'
            return (
              <div key={f.key} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{f.label}</span>
                  <span style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 16, color: 'var(--ink)' }}>{f.count}</span>
                </div>
                <div style={{ height: 5, background: 'var(--surface-3, #eee)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(f.count / maxForm) * 100}%`, background: barColor, borderRadius: 999 }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* CLOSING QUOTE */}
        <div style={{ padding: '22px 28px', background: 'var(--paper-2, #F5F0E8)' }}>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 20, lineHeight: 1.25, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            "Every submission is one woman, one visit, one record of care."
          </div>
          <div className="mono mute" style={{ fontSize: 10, marginTop: 8, letterSpacing: '0.08em' }}>— SPONDON M&E TEAM</div>
        </div>

        <div style={{ padding: '12px 28px', borderTop: '1px solid var(--hair)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em' }}>CIPRB · UNFPA BANGLADESH</div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--muted)' }}>SPONDON.GOV.BD</div>
        </div>
      </div>
    </div>
  )
}
