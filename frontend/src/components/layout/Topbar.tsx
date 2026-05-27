/**
 * Topbar — breadcrumb header bar with live sync indicator and date.
 *
 * Sticky, frosted-glass background, mono typography.
 */
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { LanguageToggle } from './LanguageToggle'

/** Each pathname maps to an array of i18n keys. The last one renders
 *  bold (current page). All resolve under the `topbar.*` namespace. */
const CRUMB_KEYS: Record<string, string[]> = {
  '/':          ['topbar.brand', 'topbar.programmeOverview'],
  '/phd':       ['topbar.brand', 'topbar.dashboards', 'topbar.phd'],
  '/bondhu':    ['topbar.brand', 'topbar.dashboards', 'topbar.bondhu'],
  '/approvals': ['topbar.brand', 'topbar.managerApprovals'],
  '/reports':   ['topbar.brand', 'topbar.reportingHub'],
  '/fistula':   ['topbar.brand', 'topbar.trackers', 'topbar.fistula'],
  '/mpdsr':     ['topbar.brand', 'topbar.trackers', 'topbar.mpdsr'],
  '/tracker':   ['topbar.brand', 'topbar.trackers', 'topbar.progress'],
  '/baseline':  ['topbar.brand', 'topbar.reports',  'topbar.baseline'],
  '/training':  ['topbar.brand', 'topbar.reports',  'topbar.training'],
  '/admin':     ['topbar.brand', 'topbar.adminPanel'],
}

export function Topbar() {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const crumbs = CRUMB_KEYS[pathname] || ['topbar.brand']

  // Format the date using the active language's locale so বাং shows
  // Bengali numerals + month name.
  const localeForDate = i18n.language?.startsWith('bn') ? 'bn-BD' : 'en-GB'
  const dateStr = new Date().toLocaleDateString(localeForDate, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).toUpperCase()

  return (
    <header className="topbar">
      <div className="crumb">
        {crumbs.map((key, i) => (
          <span key={key}>
            {i > 0 && <span className="crumb-sep"> / </span>}
            {i === crumbs.length - 1 ? <b>{t(key)}</b> : <span>{t(key)}</span>}
          </span>
        ))}
      </div>

      <div className="top-spacer" />

      <div className="top-pill hide-md">
        <span className="live-dot" />
        <span>{t('topbar.syncLive')}</span>
      </div>

      <div className="top-pill hide-md">
        <span>{dateStr}</span>
      </div>

      <button className="top-btn" title={t('topbar.refresh')}>
        <RefreshCw size={14} />
      </button>

      {/* Global language toggle — persists to localStorage, no reload. */}
      <LanguageToggle />
    </header>
  )
}
