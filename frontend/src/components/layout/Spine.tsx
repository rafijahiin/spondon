/**
 * Spine — 64→220px collapsible left rail navigation.
 *
 * Matches the editorial light console design: minimal vertical strip,
 * UNFPA blue active indicator bar, live badge for pending approvals.
 * S logo toggles expanded/collapsed. Includes KoboToolbox form links panel.
 */
import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Home, LayoutDashboard, BarChart2, CheckSquare, FileText,
  Activity, Bell, Search, Settings, LogOut, ExternalLink,
  Heart, BookOpen, Users, BarChart, ClipboardList, X, Menu,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/api/client'

import type { Role, Organisation } from '@/types'
import { isAdminRole } from '@/types'

interface SpineItemDef {
  to: string
  /** i18n key under the `nav.*` namespace — resolved at render time. */
  i18nKey: string
  icon: React.ReactNode
  badge?: number | null
  /** Per-item visibility predicate. If omitted, item is visible to all
   *  authenticated users. Receives current role+org for fine-grained gating. */
  visible?: (role: Role, organisation: Organisation) => boolean
}

// Manager role is approvals-only per the IDMS handoff. They never see
// dashboards, the tracker, reports hub, MPDSR, baseline, or training —
// only the Approvals queue. Helper below makes the visibility predicate
// explicit and short.
const notManager = (r: Role) => r !== 'manager'

const PRIMARY_NAV: SpineItemDef[] = [
  // Home: every role except manager. Managers land directly on /approvals
  // (default redirect handled in App.tsx).
  { to: '/',         i18nKey: 'nav.programmeOverview', icon: <Home size={18} />,
    visible: (r) => notManager(r) },
  { to: '/phd',      i18nKey: 'nav.phdDashboard',      icon: <LayoutDashboard size={18} />,
    visible: (r, o) => isAdminRole(r) || r === 'org_lead' || (notManager(r) && o === 'PHD') },
  { to: '/bondhu',   i18nKey: 'nav.bondhuDashboard',   icon: <BarChart2 size={18} />,
    visible: (r, o) => isAdminRole(r) || r === 'org_lead' || (notManager(r) && o === 'Bandhu') },
  // Approvals: managers + above. This is the ONLY nav item a manager sees.
  { to: '/approvals',i18nKey: 'nav.managerApprovals',  icon: <CheckSquare size={18} />,
    visible: (r) => ['developer','supervisor','org_lead','manager'].includes(r) },
  { to: '/reports',  i18nKey: 'nav.reportingHub',      icon: <FileText size={18} />,
    visible: (r) => ['developer','supervisor','org_lead'].includes(r) },
]

const SECONDARY_NAV: SpineItemDef[] = [
  { to: '/fistula',  i18nKey: 'nav.fistulaTracker',   icon: <Heart size={18} />,
    visible: (r, o) => isAdminRole(r) || (r === 'org_lead' && o === 'CIPRB') || (notManager(r) && o === 'CIPRB') },
  { to: '/mpdsr',    i18nKey: 'nav.mpdsrTracker',     icon: <Activity size={18} />,
    visible: (r, o) => isAdminRole(r) || (r === 'org_lead' && o === 'CIPRB') },
  // Tracker (now hosts both Programme Targets and Submission Compliance tabs).
  { to: '/tracker',  i18nKey: 'nav.progressTracker',  icon: <BarChart size={18} />,
    visible: (r) => ['developer','supervisor','org_lead'].includes(r) },
  { to: '/baseline', i18nKey: 'nav.baselineEndline',  icon: <BookOpen size={18} />,
    visible: (r, o) => isAdminRole(r) || (r === 'org_lead' && o === 'CIPRB') || (notManager(r) && o === 'CIPRB') },
  { to: '/training', i18nKey: 'nav.trainingLog',      icon: <Users size={18} />,
    visible: (r) => ['developer','supervisor','org_lead'].includes(r) },
]

/** Filter a nav array by the current user's role + org. */
function filterByVisibility(items: SpineItemDef[], user: { role: Role; organisation: Organisation } | null) {
  if (!user) return [] as SpineItemDef[]
  return items.filter((i) => (i.visible ? i.visible(user.role, user.organisation as Organisation) : true))
}

// ─── KoboToolbox form links ──────────────────────────────────────────────────

interface KoboForm {
  url: string
  label: string
  labelBn: string
}

interface KoboGroup {
  heading: string
  forms: KoboForm[]
}

const KOBO_GROUPS: KoboGroup[] = [
  {
    heading: 'Legacy Forms',
    forms: [
      { url: 'https://ee.kobotoolbox.org/x/ZOBX0pKd', label: 'MPDSR Form',        labelBn: 'মাতৃমৃত্যু ফর্ম' },
      { url: 'https://ee.kobotoolbox.org/x/MHkEKfzl', label: 'Fistula Campaign',   labelBn: 'ফিস্টুলা ফর্ম' },
      { url: 'https://ee.kobotoolbox.org/x/MTvoZ3Hz', label: 'Baseline / Endline', labelBn: 'বেসলাইন ফর্ম' },
    ],
  },
  {
    heading: 'Clinical',
    forms: [
      { url: 'https://ee.kobotoolbox.org/x/J1WaMhw9', label: 'KF-01 Client Reg.',   labelBn: 'ক্লায়েন্ট নিবন্ধন' },
      { url: 'https://ee.kobotoolbox.org/x/bRmo6yVq', label: 'KF-02 Clinic Visit',  labelBn: 'ক্লিনিক পরিদর্শন' },
      { url: 'https://ee.kobotoolbox.org/x/svhvZM4N', label: 'KF-03 HIV/STI Test',  labelBn: 'এইচআইভি/এসটিআই' },
      { url: 'https://ee.kobotoolbox.org/x/ut3WZTdw', label: 'KF-04 HTC Counsell.', labelBn: 'এইচটিসি পরামর্শ' },
      { url: 'https://ee.kobotoolbox.org/x/hVfZFf66', label: 'KF-05/06 MH Screen.', labelBn: 'মানসিক স্বাস্থ্য' },
      { url: 'https://ee.kobotoolbox.org/x/33qxf43w', label: 'KF-13 ADR Record',    labelBn: 'পার্শ্বপ্রতিক্রিয়া' },
      { url: 'https://ee.kobotoolbox.org/x/bdciLLr4', label: 'KF-16 Autoclave Log', labelBn: 'অটোক্লেভ লগ' },
      { url: 'https://ee.kobotoolbox.org/x/DKpvTw58', label: 'KF-ANC Antenatal',    labelBn: 'প্রসব পূর্ব যত্ন' },
    ],
  },
  {
    heading: 'Outreach & Community',
    forms: [
      { url: 'https://ee.kobotoolbox.org/x/mL50QRl8', label: 'KF-08 Outreach',     labelBn: 'আউটরিচ সেশন' },
      { url: 'https://ee.kobotoolbox.org/x/5X3kRnOV', label: 'KF-09 Counselling',  labelBn: 'ব্যক্তিগত পরামর্শ' },
      { url: 'https://ee.kobotoolbox.org/x/VZ1iYrTd', label: 'KF-10 Group Edu.',    labelBn: 'গ্রুপ শিক্ষা' },
      { url: 'https://ee.kobotoolbox.org/x/txflM4ZZ', label: 'KF-12 Hygiene Kit',  labelBn: 'হাইজিন কিট' },
      { url: 'https://ee.kobotoolbox.org/x/VF7qdmTN', label: 'Referral Form',       labelBn: 'রেফারেল ফর্ম' },
      { url: 'https://ee.kobotoolbox.org/x/v9gd1IPa', label: 'GBV Case Report',     labelBn: 'জিবিভি কেস' },
    ],
  },
  {
    heading: 'Programme Ops',
    forms: [
      { url: 'https://ee.kobotoolbox.org/x/Bc7XiGmm', label: 'KF-18 Mobile Camp', labelBn: 'মোবাইল ক্যাম্প' },
      { url: 'https://ee.kobotoolbox.org/x/BW115Ila', label: 'KF-19 Coord. Mtg.', labelBn: 'সমন্বয় সভা' },
      { url: 'https://ee.kobotoolbox.org/x/bRmo6yVq', label: 'KF-20 Training',     labelBn: 'প্রশিক্ষণ' },
    ],
  },
]

// ─── Component ───────────────────────────────────────────────────────────────

export function Spine() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const [koboOpen, setKoboOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState<number>(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const spineRef = useRef<HTMLElement>(null)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  // Fetch real pending approval count
  useEffect(() => {
    let cancelled = false
    const fetchPending = () => {
      api.get('/dashboard/kpis/')
        .then(r => { if (!cancelled) setPendingCount(r.data?.submissions_pending ?? 0) })
        .catch(() => {})
    }
    fetchPending()
    const interval = setInterval(fetchPending, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  // Close kobo panel on outside click
  useEffect(() => {
    if (!koboOpen) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setKoboOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [koboOpen])

  // Close expanded spine on outside click
  useEffect(() => {
    if (!expanded) return
    const handler = (e: MouseEvent) => {
      if (spineRef.current && !spineRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [expanded])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (koboOpen) setKoboOpen(false)
        else if (expanded) setExpanded(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [koboOpen, expanded])

  const initials = user
    ? (user.full_name || user.email)
        .split(' ')
        .map(p => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?'

  // Filter nav arrays by role + organisation, then attach the live
  // approval-queue badge to the Approvals item if it survived the filter.
  const visiblePrimary = filterByVisibility(PRIMARY_NAV, user)
    .map(item => item.to === '/approvals' ? { ...item, badge: pendingCount } : item)
  const visibleSecondary = filterByVisibility(SECONDARY_NAV, user)

  // Close drawer when a nav link is clicked (helpful on mobile)
  const handleNavClick = () => setExpanded(false)

  return (
    <>
      {/* Mobile-only hamburger toggle — fixed top-left, hidden on desktop */}
      <button
        className="mobile-menu-btn"
        title={expanded ? 'Close menu' : 'Open menu'}
        aria-label={expanded ? 'Close menu' : 'Open menu'}
        onClick={() => setExpanded(prev => !prev)}
      >
        {expanded ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile backdrop — visible only when drawer open on mobile */}
      {expanded && <div className="spine-backdrop" onClick={() => setExpanded(false)} />}

      <aside ref={spineRef} className={`spine ${expanded ? 'spine-expanded' : ''}`}>
      {/* Brand mark — toggles expand/collapse on desktop */}
      <button
        className="spine-brand"
        title={expanded ? 'Collapse menu' : 'Expand menu'}
        onClick={() => setExpanded(prev => !prev)}
      >
        <span>S</span>
      </button>

      {/* Primary nav group */}
      <div className="spine-group">
        {visiblePrimary.map(item => (
          <SpineItem key={item.to} {...item} expanded={expanded} onNavigate={handleNavClick} />
        ))}
      </div>

      <div className="spine-sep" />

      {/* Secondary nav group */}
      <div className="spine-group">
        {visibleSecondary.map(item => (
          <SpineItem key={item.to} {...item} expanded={expanded} onNavigate={handleNavClick} />
        ))}
      </div>

      <div className="spine-sep" />

      {/* Utilities */}
      <div className="spine-group">
        {/* KoboToolbox form links */}
        <button
          className={`spine-item ${koboOpen ? 'active' : ''}`}
          title={t('nav.koboForms')}
          onClick={() => setKoboOpen(p => !p)}
        >
          <ClipboardList size={18} />
          {expanded ? <span className="spine-label">{t('nav.koboForms')}</span> : <span className="spine-tip">{t('nav.koboForms')}</span>}
        </button>

        <button className="spine-item" title={t('nav.search')}>
          <Search size={18} />
          {expanded ? <span className="spine-label">{t('nav.search')}</span> : <span className="spine-tip">{t('nav.search')}</span>}
        </button>
        <button className="spine-item" title={t('nav.notifications')}>
          <Bell size={18} />
          {expanded ? <span className="spine-label">{t('nav.notifications')}</span> : <span className="spine-tip">{t('nav.notifications')}</span>}
        </button>
      </div>

      {/* Footer */}
      <div className="spine-foot">
        {user && isAdminRole(user.role) ? (
          <NavLink
            to="/admin"
            className={({ isActive }) => `spine-item ${isActive ? 'active' : ''}`}
            title={t('nav.adminPanel')}
          >
            <Settings size={18} />
            {expanded ? <span className="spine-label">{t('nav.adminPanel')}</span> : <span className="spine-tip">{t('nav.adminPanel')}</span>}
          </NavLink>
        ) : (
          <button className="spine-item" title={t('nav.settings')}>
            <Settings size={18} />
            {expanded ? <span className="spine-label">{t('nav.settings')}</span> : <span className="spine-tip">{t('nav.settings')}</span>}
          </button>
        )}
        <button className="spine-item" onClick={handleLogout} title={t('nav.logout')}>
          <LogOut size={18} />
          {expanded ? <span className="spine-label">{t('nav.logout')}</span> : <span className="spine-tip">{t('nav.logout')}</span>}
        </button>
        <div className="spine-avatar" title={user?.full_name || user?.email || ''}>
          {initials}
        </div>
      </div>

      {/* KoboToolbox slide-out panel */}
      {koboOpen && (
        <div ref={panelRef} className="kobo-panel">
          <div className="kobo-panel-header">
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>KoboToolbox Forms</div>
              <div className="bn mute" style={{ fontSize: 11 }}>কোবোটুলবক্স ফর্ম</div>
            </div>
            <button onClick={() => setKoboOpen(false)} className="kobo-panel-close" title="Close">
              <X size={16} />
            </button>
          </div>
          <div className="kobo-panel-body scroll-thin">
            {KOBO_GROUPS.map(group => (
              <div key={group.heading} className="kobo-group">
                <div className="kobo-group-heading">{group.heading}</div>
                {group.forms.map(form => (
                  <a
                    key={form.url}
                    href={form.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="kobo-form-link"
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{form.label}</div>
                      <div className="bn" style={{ fontSize: 10, color: 'var(--muted)' }}>{form.labelBn}</div>
                    </div>
                    <ExternalLink size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
    </>
  )
}

function SpineItem({ to, i18nKey, icon, badge, expanded, onNavigate }: SpineItemDef & { expanded?: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation()
  const label = t(i18nKey)
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onNavigate}
      className={({ isActive }) => `spine-item ${isActive ? 'active' : ''}`}
    >
      {icon}
      {badge != null && badge > 0 && <span className="badge">{badge}</span>}
      {expanded ? (
        <span className="spine-label">{label}</span>
      ) : (
        <span className="spine-tip">{label}</span>
      )}
    </NavLink>
  )
}
