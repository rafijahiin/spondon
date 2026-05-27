import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import {
  Activity,
  BarChart2,
  BookOpen,
  CheckSquare,
  ChevronDown,
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
  BarChart,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuth } from '@/context/AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  to: string
  label: string
  labelBn: string
  icon: React.ReactNode
  roles?: string[]
}

interface NavGroup {
  id: string
  heading: string
  headingBn: string
  items: NavItem[]
  roles?: string[]   // if set, whole group is hidden for other roles
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

// ─── Navigation groups ────────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'dashboards',
    heading: 'Dashboards',
    headingBn: 'ড্যাশবোর্ড',
    items: [
      { to: '/',       label: 'Home',             labelBn: 'হোম',              icon: <Home className="h-4 w-4" /> },
      { to: '/phd',    label: 'PHD Dashboard',    labelBn: 'PHD ড্যাশবোর্ড',   icon: <LayoutDashboard className="h-4 w-4" /> },
      { to: '/bondhu', label: 'Bandhu Dashboard', labelBn: 'বন্ধু ড্যাশবোর্ড', icon: <BarChart2 className="h-4 w-4" /> },
    ],
  },
  {
    id: 'trackers',
    heading: 'Trackers',
    headingBn: 'ট্র্যাকার',
    items: [
      { to: '/fistula', label: 'Fistula Tracker',  labelBn: 'ফিস্টুলা',            icon: <Heart className="h-4 w-4" /> },
      { to: '/mpdsr',   label: 'MPDSR Tracker',    labelBn: 'MPDSR',               icon: <Activity className="h-4 w-4" /> },
      { to: '/tracker', label: 'Progress Tracker', labelBn: 'অগ্রগতি ট্র্যাকার', icon: <BarChart className="h-4 w-4" /> },
    ],
  },
  {
    id: 'reports',
    heading: 'Reports & Data',
    headingBn: 'রিপোর্ট',
    items: [
      { to: '/reports',   label: 'Reporting Hub',     labelBn: 'রিপোর্ট',  icon: <FileText className="h-4 w-4" /> },
      { to: '/baseline',  label: 'Baseline & Endline', labelBn: 'বেসলাইন', icon: <BookOpen className="h-4 w-4" /> },
      { to: '/training',  label: 'Training Log',       labelBn: 'প্রশিক্ষণ', icon: <Users className="h-4 w-4" /> },
    ],
  },
  {
    id: 'ops',
    heading: 'Operations',
    headingBn: 'অপারেশন',
    items: [
      { to: '/approvals', label: 'Approvals', labelBn: 'অনুমোদন', icon: <CheckSquare className="h-4 w-4" /> },
    ],
  },
  {
    id: 'admin',
    heading: 'Admin',
    headingBn: 'অ্যাডমিন',
    roles: ['supervisor', 'developer'],
    items: [
      {
        to: '/admin',
        label: 'Admin Panel',
        labelBn: 'অ্যাডমিন',
        icon: <Settings className="h-4 w-4" />,
        roles: ['supervisor', 'developer'],
      },
    ],
  },
]

// ─── KoboToolbox groups ───────────────────────────────────────────────────────

const KOBO_GROUPS: KoboGroup[] = [
  {
    heading: 'Legacy Forms',
    forms: [
      { url: 'https://ee.kobotoolbox.org/x/ZOBX0pKd', label: 'MPDSR Form',        labelBn: 'মাতৃমৃত্যু ফর্ম',    icon: <Activity className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/MHkEKfzl', label: 'Fistula Campaign',   labelBn: 'ফিস্টুলা ফর্ম',      icon: <Heart className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/MTvoZ3Hz', label: 'Baseline / Endline', labelBn: 'বেসলাইন ফর্ম',       icon: <BookOpen className="h-3.5 w-3.5" /> },
    ],
  },
  {
    heading: 'Clinical',
    forms: [
      { url: 'https://ee.kobotoolbox.org/x/J1WaMhw9', label: 'KF-01 Client Reg.',   labelBn: 'ক্লায়েন্ট নিবন্ধন',  icon: <UserPlus className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/bRmo6yVq', label: 'KF-02 Clinic Visit',  labelBn: 'ক্লিনিক পরিদর্শন',   icon: <Stethoscope className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/svhvZM4N', label: 'KF-03 HIV/STI Test',  labelBn: 'এইচআইভি/এসটিআই',    icon: <TestTube2 className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/ut3WZTdw', label: 'KF-04 HTC Counsell.', labelBn: 'এইচটিসি পরামর্শ',    icon: <HeartHandshake className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/hVfZFf66', label: 'KF-05/06 MH Screen.', labelBn: 'মানসিক স্বাস্থ্য',   icon: <Brain className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/33qxf43w', label: 'KF-13 ADR Record',    labelBn: 'পার্শ্বপ্রতিক্রিয়া',icon: <Pill className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/bdciLLr4', label: 'KF-16 Autoclave Log', labelBn: 'অটোক্লেভ লগ',       icon: <Thermometer className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/DKpvTw58', label: 'KF-ANC Antenatal',    labelBn: 'প্রসব পূর্ব যত্ন',  icon: <Heart className="h-3.5 w-3.5" /> },
    ],
  },
  {
    heading: 'Outreach & Community',
    forms: [
      { url: 'https://ee.kobotoolbox.org/x/mL50QRl8', label: 'KF-08 Outreach',     labelBn: 'আউটরিচ সেশন',      icon: <Megaphone className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/5X3kRnOV', label: 'KF-09 Counselling',  labelBn: 'ব্যক্তিগত পরামর্শ', icon: <HeartHandshake className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/VZ1iYrTd', label: 'KF-10 Group Edu.',    labelBn: 'গ্রুপ শিক্ষা',      icon: <Users2 className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/txflM4ZZ', label: 'KF-12 Hygiene Kit',  labelBn: 'হাইজিন কিট',       icon: <FileText className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/VF7qdmTN', label: 'Referral Form',       labelBn: 'রেফারেল ফর্ম',      icon: <ClipboardList className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/v9gd1IPa', label: 'GBV Case Report',     labelBn: 'জিবিভি কেস',        icon: <ShieldAlert className="h-3.5 w-3.5" /> },
    ],
  },
  {
    heading: 'Programme Ops',
    forms: [
      { url: 'https://ee.kobotoolbox.org/x/Bc7XiGmm', label: 'KF-18 Mobile Camp', labelBn: 'মোবাইল ক্যাম্প', icon: <Truck className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/BW115Ila', label: 'KF-19 Coord. Mtg.', labelBn: 'সমন্বয় সভা',    icon: <Users className="h-3.5 w-3.5" /> },
      { url: 'https://ee.kobotoolbox.org/x/bRmo6yVq', label: 'KF-20 Training',     labelBn: 'প্রশিক্ষণ',      icon: <BookOpen className="h-3.5 w-3.5" /> },
    ],
  },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CollapsibleGroupProps {
  id: string
  heading: string
  headingBn: string
  isOpen: boolean
  onToggle: () => void
  collapsed: boolean   // sidebar collapsed (icon-only mode)
  children: React.ReactNode
}

function CollapsibleGroup({
  heading, headingBn, isOpen, onToggle, collapsed, children,
}: CollapsibleGroupProps) {
  if (collapsed) {
    // Icon-only mode: just render children without group chrome
    return <div className="space-y-0.5">{children}</div>
  }

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/5"
      >
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
            {heading}
          </span>
          <span className="font-bangla text-[9px] text-blue-600">
            {headingBn}
          </span>
        </div>
        <motion.span
          animate={{ rotate: isOpen ? 0 : -90 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="text-blue-500"
        >
          <ChevronDown className="h-3 w-3" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="space-y-0.5 pb-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  collapsed?: boolean
  onClose?: () => void
}

export function Sidebar({ collapsed, onClose }: Props) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // Default all nav groups open; KoboToolbox starts collapsed
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    new Set(['dashboards', 'trackers', 'reports', 'ops', 'admin'])
  )
  const [koboOpen, setKoboOpen] = useState(false)

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const visibleGroups = NAV_GROUPS.filter((g) => {
    if (!g.roles) return true
    return g.roles.some((r) => r === (user?.role ?? ''))
  })

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-unfpa-dark text-white transition-all duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* ── Logo ─────────────────────────────────────────────────────────────── */}
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-5 border-b border-white/10',
          collapsed && 'justify-center px-2'
        )}
      >
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

      {/* ── Nav groups ───────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {visibleGroups.map((group) => {
          const visibleItems = group.items.filter((item) => {
            if (!item.roles) return true
            return item.roles.includes(user?.role ?? '')
          })
          if (visibleItems.length === 0) return null

          return (
            <CollapsibleGroup
              key={group.id}
              id={group.id}
              heading={group.heading}
              headingBn={group.headingBn}
              isOpen={openGroups.has(group.id)}
              onToggle={() => toggleGroup(group.id)}
              collapsed={collapsed ?? false}
            >
              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
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
                      <span className="block font-bangla text-[10px] text-blue-300 leading-tight">
                        {item.labelBn}
                      </span>
                    </span>
                  )}
                </NavLink>
              ))}
            </CollapsibleGroup>
          )
        })}
      </nav>

      {/* ── KoboToolbox section ───────────────────────────────────────────────── */}
      <div className={cn('border-t border-white/10 py-2 px-2', collapsed && 'px-2')}>

        {/* KoboToolbox section header / toggle */}
        {collapsed ? (
          <p className="py-1 text-center text-[8px] font-bold uppercase tracking-widest text-blue-500">
            KT
          </p>
        ) : (
          <button
            onClick={() => setKoboOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/5"
          >
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
                KoboToolbox
              </span>
              <span className="text-[9px] text-blue-600">
                {KOBO_GROUPS.reduce((s, g) => s + g.forms.length, 0)} forms
              </span>
            </div>
            <motion.span
              animate={{ rotate: koboOpen ? 0 : -90 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="text-blue-500"
            >
              <ChevronDown className="h-3 w-3" />
            </motion.span>
          </button>
        )}

        <AnimatePresence initial={false}>
          {(koboOpen || collapsed) && (
            <motion.div
              key="kobo-content"
              initial={collapsed ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={collapsed ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div className="space-y-0.5 pb-1">
                {KOBO_GROUPS.map((group) => (
                  <div key={group.heading}>
                    {!collapsed && (
                      <p className="px-2 pt-2 pb-0.5 text-[9px] font-semibold uppercase tracking-widest text-blue-500">
                        {group.heading}
                      </p>
                    )}
                    {group.forms.map((form) => (
                      <a
                        key={form.url + form.label}
                        href={form.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={collapsed ? form.label : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-blue-100 transition-colors',
                          'hover:bg-white/10 hover:text-white active:scale-[0.97]',
                          collapsed && 'justify-center px-2'
                        )}
                        style={{
                          transition:
                            'transform 160ms cubic-bezier(0.23,1,0.32,1), background-color 150ms ease-out',
                        }}
                      >
                        <span className="flex-shrink-0">{form.icon}</span>
                        {!collapsed && (
                          <>
                            <span className="min-w-0 flex-1 truncate text-xs">
                              {form.label}
                              <span className="block font-bangla text-[10px] text-blue-300 leading-tight">
                                {form.labelBn}
                              </span>
                            </span>
                            <ExternalLink className="h-3 w-3 flex-shrink-0 text-blue-400" />
                          </>
                        )}
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── User footer ───────────────────────────────────────────────────────── */}
      <div className={cn('border-t border-white/10 p-3', collapsed && 'px-2')}>
        {!collapsed && user && (
          <div className="mb-2 px-1">
            <p className="text-xs font-medium text-white truncate">{user.email}</p>
            <p className="text-[10px] text-blue-300 capitalize">
              {user.role.replace('_', ' ')} · {user.organisation}
            </p>
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
