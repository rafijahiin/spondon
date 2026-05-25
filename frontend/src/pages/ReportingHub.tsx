/**
 * Reporting Hub — editorial light console.
 *
 * Five report formats, period selection, generate + download,
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
    description: 'A single page for donor visits and high-stakes printing. Editorial poster format — one hero number, one map, one sentence, signed off.',
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
      const mime = card.ext === 'pptx'
        ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        : 'application/pdf'
      const blobUrl = URL.createObjectURL(new Blob([resp.data as BlobPart], { type: mime }))
      const anchor = document.createElement('a')
      anchor.href = blobUrl
      anchor.download = `demo_${card.type}_cpe2024.${card.ext}`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      setDemoError((p) => ({ ...p, [card.id]: err instanceof Error ? err.message : 'Download failed.' }))
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
           FORMAT SECTIONS
           ═══════════════════════════════════════════════════════════════ */}
      {FORMATS.map((f, i) => (
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

              {/* Preview placeholder */}
              <div className="card" style={{
                height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--surface-2)', border: '2px dashed var(--hair)',
              }}>
                <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
                  <div style={{ fontSize: 42, marginBottom: 8, opacity: 0.3 }}>{f.icon}</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{f.title} Preview</div>
                  <div className="mono" style={{ fontSize: 11, marginTop: 4 }}>{f.ext}</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* ═══════════════════════════════════════════════════════════════
           DEMO REPORTS
           ═══════════════════════════════════════════════════════════════ */}
      <section className="section" style={{ marginTop: 56 }}>
        <SectionHead
          kicker="DEMO REPORTS"
          title="Sample outputs from CPE 2022–2026"
          sub="Same pipeline as live reports — previews the exact output format."
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
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
                <span style={{ fontSize: 11, color: 'var(--rose)' }}>{demoError[card.id]}</span>
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
                    {(report as any).period_type_display ?? 'Monthly'}
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
