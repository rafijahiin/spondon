import { NavLink, useNavigate } from 'react-router-dom'
import {
  Activity,
  BarChart2,
  BookOpen,
  CheckSquare,
  ExternalLink,
  FileText,
  Heart,
  Home,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  Stethoscope,
  TestTube2,
  Pill,
  Thermometer,
  Brain,
  UserPlus,
  Users2,
  ShieldAlert,
  Truck,
  ClipboardList,
  HeartHandshake,
  Megaphone,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuth } from '@/context/AuthContext'

interface NavItem {
  to: string
  label: string
  labelBn: string
  icon: React.ReactNode
  roles?: string[]
}

interface KoboForm {
  url: string
  label: string
  labelBn: string
  icon: React.ReactNode
}

interface KoboGroup {
  heading: string
  forms: KoboForm[]
}

const KOBO_GROUPS: KoboGroup[] = [
  {
    heading: 'Legacy Forms',
    forms: [
      { url: 'https://ee.kobotoolbox.org/x/ZOBX0pKd', label: 'MPDSR Form',         labelBn: 'মাতৃমৃত্যু ফর্ম',     icon: <Activity className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/MHkEKfzl', label: 'Fistula Campaign',    labelBn: 'ফিস্টুলা ফর্ম',       icon: <Heart className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/MTvoZ3Hz', label: 'Baseline / Endline',  labelBn: 'বেসলাইন ফর্ম',        icon: <BookOpen className="h-3.5 w-3.5" /> },
    ],
  },
  {
    heading: 'Clinical',
    forms: [
      { url: 'https://ee.kobotoolbox.org/x/J1WaMhw9', label: 'KF-01 Client Reg.',   labelBn: 'ক্লায়েন্ট নিবন্ধন',   icon: <UserPlus className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/bRmo6yVq', label: 'KF-02 Clinic Visit',  labelBn: 'ক্লিনিক পরিদর্শন',    icon: <Stethoscope className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/svhvZM4N', label: 'KF-03 HIV/STI Test',  labelBn: 'এইচআইভি/এসটিআই',     icon: <TestTube2 className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/ut3WZTdw', label: 'KF-04 HTC Counsell.', labelBn: 'এইচটিসি পরামর্শ',     icon: <HeartHandshake className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/hVfZFf66', label: 'KF-05/06 MH Screen.', labelBn: 'মানসিক স্বাস্থ্য',    icon: <Brain className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/33qxf43w', label: 'KF-13 ADR Record',    labelBn: 'পার্শ্বপ্রতিক্রিয়া', icon: <Pill className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/bdciLLr4', label: 'KF-16 Autoclave Log', labelBn: 'অটোক্লেভ লগ',        icon: <Thermometer className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/DKpvTw58', label: 'KF-ANC Antenatal',    labelBn: 'প্রসব পূর্ব যত্ন',   icon: <Heart className="h-3.5 w-3.5" /> },
    ],
  },
  {
    heading: 'Outreach & Community',
    forms: [
      { url: 'https://ee.kobotoolbox.org/x/mL50QRl8', label: 'KF-08 Outreach',      labelBn: 'আউটরিচ সেশন',       icon: <Megaphone className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/5X3kRnOV', label: 'KF-09 Counselling',   labelBn: 'ব্যক্তিগত পরামর্শ',  icon: <HeartHandshake className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/VZ1iYrTd', label: 'KF-10 Group Edu.',     labelBn: 'গ্রুপ শিক্ষা',       icon: <Users2 className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/txflM4ZZ', label: 'KF-12 Hygiene Kit',   labelBn: 'হাইজিন কিট',        icon: <FileText className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/VF7qdmTN', label: 'Referral Form',        labelBn: 'রেফারেল ফর্ম',       icon: <ClipboardList className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/v9gd1IPa', label: 'GBV Case Report',      labelBn: 'জিবিভি কেস',         icon: <ShieldAlert className="h-3.5 w-3.5" /> },
    ],
  },
  {
    heading: 'Programme Ops',
    forms: [
      { url: 'https://ee.kobotoolbox.org/x/Bc7XiGmm', label: 'KF-18 Mobile Camp',   labelBn: 'মোবাইল ক্যাম্প',     icon: <Truck className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/BW115Ila', label: 'KF-19 Coord. Mtg.',   labelBn: 'সমন্বয় সভা',        icon: <Users className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/bRmo6yVq', label: 'KF-20 Training',       labelBn: 'প্রশিক্ষণ',          icon: <BookOpen className="h-3.5 w-3.5" />, },
    ],
  },
]

const NAV: NavItem[] = [
  { to: '/', label: 'Home', labelBn: 'হোম', icon: <Home className="h-5 w-5" /> },
  { to: '/phd', label: 'PHD Dashboard', labelBn: 'PHD ড্যাশবোর্ড', icon: <LayoutDashboard className="h-5 w-5" /> },
  { to: '/bondhu', label: 'Bondhu Dashboard', labelBn: 'বন্ধু ড্যাশবোর্ড', icon: <BarChart2 className="h-5 w-5" /> },
  { to: '/approvals', label: 'Approvals', labelBn: 'অনুমোদন', icon: <CheckSquare className="h-5 w-5" /> },
  { to: '/fistula', label: 'Fistula Tracker', labelBn: 'ফিস্টুলা', icon: <Heart className="h-5 w-5" /> },
  { to: '/mpdsr', label: 'MPDSR Tracker', labelBn: 'MPDSR', icon: <Activity className="h-5 w-5" /> },
  { to: '/reports', label: 'Reporting Hub', labelBn: 'রিপোর্ট', icon: <FileText className="h-5 w-5" /> },
  { to: '/baseline', label: 'Baseline & Endline', labelBn: 'বেসলাইন', icon: <BookOpen className="h-5 w-5" /> },
  { to: '/training', label: 'Training Log', labelBn: 'প্রশিক্ষণ', icon: <Users className="h-5 w-5" /> },
  {
    to: '/admin',
    label: 'Admin Panel',
    labelBn: 'অ্যাডমিন',
    icon: <Settings className="h-5 w-5" />,
    roles: ['super_admin', 'developer'],
  },
]

interface Props {
  collapsed?: boolean
  onClose?: () => void
}

export function Sidebar({ collapsed, onClose }: Props) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const visibleNav = NAV.filter((item) => {
    if (!item.roles) return true
    return item.roles.includes(user?.role ?? '')
  })

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-unfpa-dark text-white transition-all duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 py-5 border-b border-white/10', collapsed && 'justify-center px-2')}>
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/15">
          <span className="text-sm font-bold text-white">স</span>
        </div>
        {!collapsed && (
          <div>
            <p className="font-bold text-sm leading-tight">Spondon</p>
            <p className="font-bangla text-[10px] text-blue-200 leading-tight">স্পন্দন IDMS</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {visibleNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-blue-100 hover:bg-white/10 hover:text-white',
                collapsed && 'justify-center px-2'
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {!collapsed && (
              <span className="min-w-0 truncate">
                {item.label}
                <span className="block font-bangla text-[10px] text-blue-300 leading-tight">{item.labelBn}</span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* KoboToolbox forms */}
      <div className={cn('border-t border-white/10 py-3 px-2 space-y-0.5', collapsed && 'px-2')}>
        {!collapsed && (
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-blue-400">
            KoboToolbox
          </p>
        )}
        {KOBO_GROUPS.map((group) => (
          <div key={group.heading}>
            {!collapsed && (
              <p className="px-3 pt-2 pb-0.5 text-[9px] font-semibold uppercase tracking-widest text-blue-500">
                {group.heading}
              </p>
            )}
            {group.forms.map((form) => (
              <a
                key={form.url}
                href={form.url}
                target="_blank"
                rel="noopener noreferrer"
                title={collapsed ? form.label : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-blue-100 transition-colors',
                  'hover:bg-white/10 hover:text-white active:scale-[0.97]',
                  collapsed && 'justify-center px-2'
                )}
                style={{ transition: 'transform 160ms cubic-bezier(0.23,1,0.32,1), background-color 150ms ease-out' }}
              >
                <span className="flex-shrink-0">{form.icon}</span>
                {!collapsed && (
                  <span className="min-w-0 flex-1 truncate">
                    {form.label}
                    <span className="block font-bangla text-[10px] text-blue-300 leading-tight">{form.labelBn}</span>
                  </span>
                )}
                {!collapsed && <ExternalLink className="h-3 w-3 flex-shrink-0 text-blue-400" />}
              </a>
            ))}
          </div>
        ))}
      </div>

      {/* User footer */}
      <div className={cn('border-t border-white/10 p-3', collapsed && 'px-2')}>
        {!collapsed && user && (
          <div className="mb-2 px-1">
            <p className="text-xs font-medium text-white truncate">{user.email}</p>
            <p className="text-[10px] text-blue-300 capitalize">{user.role.replace('_', ' ')} · {user.organisation}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-blue-100 hover:bg-white/10 hover:text-white transition-colors',
            collapsed && 'justify-center px-2'
          )}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  )
}
