/**
 * Topbar — breadcrumb header bar with live sync indicator and date.
 *
 * Sticky, frosted-glass background, mono typography.
 */
import { useLocation } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'

const CRUMBS: Record<string, string[]> = {
  '/':          ['SPONDON', 'PROGRAMME OVERVIEW'],
  '/phd':       ['SPONDON', 'DASHBOARDS', 'PHD'],
  '/bondhu':    ['SPONDON', 'DASHBOARDS', 'BONDHU'],
  '/approvals': ['SPONDON', 'MANAGER APPROVALS'],
  '/reports':   ['SPONDON', 'REPORTING HUB'],
  '/fistula':   ['SPONDON', 'TRACKERS', 'FISTULA'],
  '/mpdsr':     ['SPONDON', 'TRACKERS', 'MPDSR'],
  '/tracker':   ['SPONDON', 'TRACKERS', 'PROGRESS'],
  '/baseline':  ['SPONDON', 'REPORTS', 'BASELINE & ENDLINE'],
  '/training':  ['SPONDON', 'REPORTS', 'TRAINING LOG'],
  '/admin':     ['SPONDON', 'ADMIN PANEL'],
}

export function Topbar() {
  const { pathname } = useLocation()
  const crumbs = CRUMBS[pathname] || ['SPONDON']

  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).toUpperCase()

  return (
    <header className="topbar">
      <div className="crumb">
        {crumbs.map((c, i) => (
          <span key={i}>
            {i > 0 && <span className="crumb-sep"> / </span>}
            {i === crumbs.length - 1 ? <b>{c}</b> : <span>{c}</span>}
          </span>
        ))}
      </div>

      <div className="top-spacer" />

      <div className="top-pill hide-md">
        <span className="live-dot" />
        <span>SYNC LIVE</span>
      </div>

      <div className="top-pill hide-md">
        <span>{dateStr}</span>
      </div>

      <button className="top-btn" title="Refresh">
        <RefreshCw size={14} />
      </button>
    </header>
  )
}
