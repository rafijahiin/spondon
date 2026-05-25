/**
 * Spine — 64→220px collapsible left rail navigation.
 *
 * Matches the editorial light console design: minimal vertical strip,
 * UNFPA blue active indicator bar, live badge for pending approvals.
 * S logo toggles expanded/collapsed. Includes KoboToolbox form links panel.
 */
import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home, LayoutDashboard, BarChart2, CheckSquare, FileText,
  Activity, Bell, Search, Settings, LogOut, ExternalLink,
  Heart, BookOpen, Users, BarChart, ClipboardList, X,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/api/client'

interface SpineItemDef {
  to: string
  label: string
  labelBn: string
  icon: React.ReactNode
  badge?: number | null
}

const PRIMARY_NAV: SpineItemDef[] = [
  { to: '/',         label: 'Programme Overview', labelBn: 'হোম',               icon: <Home size={18} /> },
  { to: '/phd',      label: 'PHD Dashboard',      labelBn: 'PHD ড্যাশবোর্ড',    icon: <LayoutDashboard size={18} /> },
  { to: '/bondhu',   label: 'Bondhu Dashboard',   labelBn: 'বন্ধু ড্যাশবোর্ড',  icon: <BarChart2 size={18} /> },
  { to: '/approvals',label: 'Manager Approvals',  labelBn: 'অনুমোদন',           icon: <CheckSquare size={18} /> },
  { to: '/reports',  label: 'Reporting Hub',       labelBn: 'রিপোর্ট',           icon: <FileText size={18} /> },
]

const SECONDARY_NAV: SpineItemDef[] = [
  { to: '/fistula',  label: 'Fistula Tracker',    labelBn: 'ফিস্টুলা',          icon: <Heart size={18} /> },
  { to: '/mpdsr',    label: 'MPDSR Tracker',      labelBn: 'MPDSR',             icon: <Activity size={18} /> },
  { to: '/tracker',  label: 'Progress Tracker',   labelBn: 'অগ্রগতি',           icon: <BarChart size={18} /> },
  { to: '/baseline', label: 'Baseline & Endline', labelBn: 'বেসলাইন',           icon: <BookOpen size={18} /> },
  { to: '/training', label: 'Training Log',       labelBn: 'প্রশিক্ষণ',         icon: <Users size={18} /> },
]

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

  // Build nav with live badge
  const primaryWithBadge = PRIMARY_NAV.map(item =>
    item.to === '/approvals' ? { ...item, badge: pendingCount } : item
  )

  return (
    <aside ref={spineRef} className={`spine ${expanded ? 'spine-expanded' : ''}`}>
      {/* Brand mark — toggles expand/collapse */}
      <button
        className="spine-brand"
        title={expanded ? 'Collapse menu' : 'Expand menu'}
        onClick={() => setExpanded(prev => !prev)}
      >
        <span>S</span>
      </button>

      {/* Primary nav group */}
      <div className="spine-group">
        {primaryWithBadge.map(item => (
          <SpineItem key={item.to} {...item} expanded={expanded} />
        ))}
      </div>

      <div className="spine-sep" />

      {/* Secondary nav group */}
      <div className="spine-group">
        {SECONDARY_NAV.map(item => (
          <SpineItem key={item.to} {...item} expanded={expanded} />
        ))}
      </div>

      <div className="spine-sep" />

      {/* Utilities */}
      <div className="spine-group">
        {/* KoboToolbox form links */}
        <button
          className={`spine-item ${koboOpen ? 'active' : ''}`}
          title="KoboToolbox Forms"
          onClick={() => setKoboOpen(p => !p)}
        >
          <ClipboardList size={18} />
          {expanded ? <span className="spine-label">Kobo Forms</span> : <span className="spine-tip">KoboToolbox Forms</span>}
        </button>

        <button className="spine-item" title="Search">
          <Search size={18} />
          {expanded ? <span className="spine-label">Search</span> : <span className="spine-tip">Search</span>}
        </button>
        <button className="spine-item" title="Notifications">
          <Bell size={18} />
          {expanded ? <span className="spine-label">Notifications</span> : <span className="spine-tip">Notifications</span>}
        </button>
      </div>

      {/* Footer */}
      <div className="spine-foot">
        {user?.role === 'super_admin' || user?.role === 'developer' ? (
          <NavLink
            to="/admin"
            className={({ isActive }) => `spine-item ${isActive ? 'active' : ''}`}
            title="Admin Panel"
          >
            <Settings size={18} />
            {expanded ? <span className="spine-label">Admin Panel</span> : <span className="spine-tip">Admin Panel</span>}
          </NavLink>
        ) : (
          <button className="spine-item" title="Settings">
            <Settings size={18} />
            {expanded ? <span className="spine-label">Settings</span> : <span className="spine-tip">Settings</span>}
          </button>
        )}
        <button className="spine-item" onClick={handleLogout} title="Logout">
          <LogOut size={18} />
          {expanded ? <span className="spine-label">Logout</span> : <span className="spine-tip">Logout</span>}
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
  )
}

function SpineItem({ to, label, labelBn, icon, badge, expanded }: SpineItemDef & { expanded?: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => `spine-item ${isActive ? 'active' : ''}`}
    >
      {icon}
      {badge != null && badge > 0 && <span className="badge">{badge}</span>}
      {expanded ? (
        <span className="spine-label">
          {label} <small className="bn" style={{ color: 'var(--muted)', fontSize: 10, marginLeft: 4 }}>{labelBn}</small>
        </span>
      ) : (
        <span className="spine-tip">
          {label} <small>{labelBn}</small>
        </span>
      )}
    </NavLink>
  )
}
