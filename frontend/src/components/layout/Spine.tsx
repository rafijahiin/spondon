/**
 * Spine — 64px icon-only left rail navigation with hover tooltips.
 *
 * Matches the editorial light console design: minimal vertical strip,
 * UNFPA blue active indicator bar, badge for pending approvals.
 */
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home, LayoutDashboard, BarChart2, CheckSquare, FileText,
  Activity, Bell, Search, Settings, LogOut,
  Heart, BookOpen, Users, BarChart,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

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
  { to: '/approvals',label: 'Manager Approvals',  labelBn: 'অনুমোদন',           icon: <CheckSquare size={18} />, badge: 8 },
  { to: '/reports',  label: 'Reporting Hub',       labelBn: 'রিপোর্ট',           icon: <FileText size={18} /> },
]

const SECONDARY_NAV: SpineItemDef[] = [
  { to: '/fistula',  label: 'Fistula Tracker',    labelBn: 'ফিস্টুলা',          icon: <Heart size={18} /> },
  { to: '/mpdsr',    label: 'MPDSR Tracker',      labelBn: 'MPDSR',             icon: <Activity size={18} /> },
  { to: '/tracker',  label: 'Progress Tracker',   labelBn: 'অগ্রগতি',           icon: <BarChart size={18} /> },
  { to: '/baseline', label: 'Baseline & Endline', labelBn: 'বেসলাইন',           icon: <BookOpen size={18} /> },
  { to: '/training', label: 'Training Log',       labelBn: 'প্রশিক্ষণ',         icon: <Users size={18} /> },
]

export function Spine() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const initials = user
    ? (user.full_name || user.email)
        .split(' ')
        .map(p => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?'

  return (
    <aside className="spine">
      {/* Brand mark */}
      <NavLink to="/" className="spine-brand" title="Spondon">
        <span>S</span>
      </NavLink>

      {/* Primary nav group */}
      <div className="spine-group">
        {PRIMARY_NAV.map(item => (
          <SpineItem key={item.to} {...item} />
        ))}
      </div>

      <div className="spine-sep" />

      {/* Secondary nav group */}
      <div className="spine-group">
        {SECONDARY_NAV.map(item => (
          <SpineItem key={item.to} {...item} />
        ))}
      </div>

      <div className="spine-sep" />

      {/* Utilities */}
      <div className="spine-group">
        <button className="spine-item" title="Search">
          <Search size={18} />
          <span className="spine-tip">Search</span>
        </button>
        <button className="spine-item" title="Notifications">
          <Bell size={18} />
          <span className="spine-tip">Notifications</span>
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
            <span className="spine-tip">Admin Panel</span>
          </NavLink>
        ) : (
          <button className="spine-item" title="Settings">
            <Settings size={18} />
            <span className="spine-tip">Settings</span>
          </button>
        )}
        <button className="spine-item" onClick={handleLogout} title="Logout">
          <LogOut size={18} />
          <span className="spine-tip">Logout</span>
        </button>
        <div className="spine-avatar" title={user?.full_name || user?.email || ''}>
          {initials}
        </div>
      </div>
    </aside>
  )
}

function SpineItem({ to, label, labelBn, icon, badge }: SpineItemDef) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => `spine-item ${isActive ? 'active' : ''}`}
    >
      {icon}
      {badge != null && badge > 0 && <span className="badge">{badge}</span>}
      <span className="spine-tip">
        {label} <small>{labelBn}</small>
      </span>
    </NavLink>
  )
}
