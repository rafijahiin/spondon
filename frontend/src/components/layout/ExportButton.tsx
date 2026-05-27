/**
 * ExportButton — capture the current page as PDF or PNG.
 *
 * Uses html2canvas to rasterise the <main> element, then either
 * downloads it directly as PNG or pipes it into jsPDF for a sized
 * A4-portrait PDF. The capture target is the same <main> region the
 * WCAG focus hook in Shell.tsx already targets, so what the user sees
 * is what they export.
 *
 * Tradeoffs (declared up front):
 *   - html2canvas rasterises with the browser's current rendering, so
 *     fonts + colours match exactly. Cost: large images for tall pages.
 *   - PDF flow: single-page A4 portrait, content scaled to fit width.
 *     Tall pages get scaled down (everything fits, but small text may
 *     become unreadable). Multi-page slicing is a future enhancement.
 *   - Hidden during capture: the Topbar's controls (refresh / dark /
 *     language / AI / export buttons themselves), via a .no-export class.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { Download, ChevronDown, FileText, Image as ImageIcon, AlertCircle, X } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'

// Slug-friendly page name from route.
function pageNameFromPath(p: string): string {
  if (p === '/') return 'home'
  return p.replace(/^\//, '').replace(/\//g, '-')
}

// Today's date as YYYY-MM-DD for the filename.
function todayStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function ExportButton() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<null | 'pdf' | 'png'>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  // Auto-dismiss error toast after 6s so it doesn't linger.
  useEffect(() => {
    if (!errMsg) return
    const id = setTimeout(() => setErrMsg(null), 6000)
    return () => clearTimeout(id)
  }, [errMsg])

  const filenameBase = `spondon-${pageNameFromPath(pathname)}-${todayStamp()}`

  /**
   * Dynamic imports keep jspdf + html2canvas out of the main bundle.
   * They land in their own chunk only when the user actually triggers
   * an export. Saves ~250 KB on initial load.
   */
  const captureMain = async (): Promise<HTMLCanvasElement> => {
    const html2canvas = (await import('html2canvas')).default
    const target = document.querySelector('main') as HTMLElement
    if (!target) throw new Error('main element not found')
    return html2canvas(target, {
      backgroundColor: getComputedStyle(document.documentElement)
        .getPropertyValue('--paper').trim() || '#EFF1F7',
      scale: 1.5,             // crisp without exploding file size
      useCORS: true,
      logging: false,
      ignoreElements: (el) => {
        // 1. Topbar controls (export button, language, dark mode, etc.)
        if (el.classList.contains('no-export')) return true
        // 2. Leaflet maps — tile images are cross-origin and taint the
        //    canvas, causing toDataURL/toBlob to throw a SecurityError.
        //    We skip the whole map container; the export shows a blank
        //    rectangle where the map was. (A future enhancement could
        //    swap in a snapshotted PNG of the map first.)
        if (el.classList.contains('leaflet-container')) return true
        if (el.classList.contains('leaflet-pane')) return true
        // 3. iframes (recharts uses inline SVG, no iframes, but defensive).
        if (el.tagName === 'IFRAME') return true
        return false
      },
    })
  }

  /** Convert any thrown export error into a short, user-readable line. */
  const friendlyError = (e: unknown): string => {
    if (e instanceof Error) {
      const msg = e.message.toLowerCase()
      if (msg.includes('tainted') || msg.includes('cors') || msg.includes('security')) {
        return t('export.errCors', {
          defaultValue: 'Some images on this page block export. The map area will be skipped — please try again.',
        })
      }
      if (msg.includes('oklch') || msg.includes('color') || msg.includes('parse')) {
        return t('export.errColor', {
          defaultValue: 'Browser color parsing failed during export. Try toggling dark mode off and retry.',
        })
      }
      return e.message || t('export.errGeneric', { defaultValue: 'Export failed.' })
    }
    return t('export.errGeneric', { defaultValue: 'Export failed.' })
  }

  const exportPNG = async () => {
    setBusy('png')
    setErrMsg(null)
    try {
      const canvas = await captureMain()
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, 'image/png'),
      )
      if (!blob) throw new Error('canvas.toBlob returned null')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filenameBase}.png`
      a.click()
      URL.revokeObjectURL(url)
      setOpen(false)
    } catch (e) {
      console.error('PNG export failed', e)
      setErrMsg(friendlyError(e))
    } finally {
      setBusy(null)
    }
  }

  const exportPDF = async () => {
    setBusy('pdf')
    setErrMsg(null)
    try {
      const { jsPDF } = await import('jspdf')
      const canvas = await captureMain()
      const imgData = canvas.toDataURL('image/png')
      // A4 portrait: 210 × 297 mm.
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 8
      const imgW = pageW - margin * 2
      const imgH = (canvas.height * imgW) / canvas.width
      if (imgH <= pageH - margin * 2) {
        pdf.addImage(imgData, 'PNG', margin, margin, imgW, imgH)
      } else {
        const scaled = pageH - margin * 2
        const scaledW = (canvas.width * scaled) / canvas.height
        const offsetX = (pageW - scaledW) / 2
        pdf.addImage(imgData, 'PNG', offsetX, margin, scaledW, scaled)
      }
      pdf.save(`${filenameBase}.pdf`)
      setOpen(false)
    } catch (e) {
      console.error('PDF export failed', e)
      setErrMsg(friendlyError(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="no-export" style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy !== null}
        className="lang-toggle-btn"
        title={t('export.title', { defaultValue: 'Export current view' })}
        aria-label={t('export.title', { defaultValue: 'Export current view' })}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          gap: 4, padding: '0 6px 0 10px',
          minHeight: 32, height: 32,
          borderRadius: 999,
          background: 'var(--surface-2)',
          border: '1px solid var(--hair)',
          color: 'var(--ink-3)',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        <Download size={13} />
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }} />
      </button>

      <AnimatePresence mode="wait">
        {open && (
          <>
            <div
              onClick={() => setOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 90 }}
            />
            <motion.div
              role="menu"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                minWidth: 200, padding: 4, borderRadius: 10,
                background: 'var(--surface)',
                border: '1px solid var(--hair)',
                boxShadow: 'var(--sh-2)',
                zIndex: 100,
              }}
            >
              <MenuItem
                icon={<FileText size={14} />}
                label={t('export.pdf', { defaultValue: 'Save as PDF (A4)' })}
                onClick={exportPDF}
                disabled={busy !== null}
                busy={busy === 'pdf'}
              />
              <MenuItem
                icon={<ImageIcon size={14} />}
                label={t('export.png', { defaultValue: 'Save as PNG image' })}
                onClick={exportPNG}
                disabled={busy !== null}
                busy={busy === 'png'}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Inline error toast — replaces the prior generic alert() with
          an on-brand, dismissible card carrying the actual reason. */}
      <AnimatePresence mode="wait">
        {errMsg && (
          <motion.div
            key="export-err"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.16 } }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            role="alert"
            aria-live="polite"
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0,
              width: 320, padding: '12px 14px', borderRadius: 10,
              background: 'rgba(241, 15, 69, 0.06)',
              border: '1px solid rgba(241, 15, 69, 0.20)',
              boxShadow: 'var(--sh-2)',
              zIndex: 110,
              display: 'flex', alignItems: 'flex-start', gap: 10,
              fontSize: 12.5, color: 'var(--ink)',
              lineHeight: 1.45,
            }}
          >
            <AlertCircle size={15} style={{ color: '#9A1131', flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                {t('export.errTitle', { defaultValue: 'Export failed' })}
              </div>
              <div style={{ color: 'var(--ink-3)' }}>{errMsg}</div>
            </div>
            <button
              onClick={() => setErrMsg(null)}
              aria-label={t('export.dismissError', { defaultValue: 'Dismiss' })}
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--ink-3)', cursor: 'pointer',
                padding: 0, lineHeight: 0,
              }}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MenuItem({
  icon, label, onClick, disabled, busy,
}: { icon: React.ReactNode; label: string; onClick: () => void; disabled: boolean; busy: boolean }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '8px 10px',
        background: 'transparent', border: 'none', borderRadius: 6,
        color: 'var(--ink)', fontSize: 13, fontWeight: 500,
        cursor: disabled ? 'wait' : 'pointer', textAlign: 'left',
      }}
      onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'var(--surface-2)' }}
      onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent' }}
    >
      <span style={{ color: 'var(--ink-3)' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {busy && <span style={{ fontSize: 11, color: 'var(--muted)' }}>…</span>}
    </button>
  )
}
