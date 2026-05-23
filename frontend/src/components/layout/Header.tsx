import { Bell, Menu, Moon, Sun, X } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'

interface Props {
  onToggleSidebar: () => void
  sidebarOpen: boolean
}

export function Header({ onToggleSidebar, sidebarOpen }: Props) {
  const { theme, toggle } = useTheme()
  const { user } = useAuth()

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 dark:border-gray-700 dark:bg-gray-900">
      {/* Left: hamburger + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
          aria-label="Toggle sidebar"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <div className="hidden sm:flex items-center gap-2">
          <span className="font-bangla text-xs text-unfpa-blue font-medium">স্পন্দন</span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">CIPRB / UNFPA Bangladesh</span>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        {/* Dark mode toggle */}
        <button
          onClick={toggle}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
          aria-label="Toggle dark mode"
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        {/* Notifications placeholder */}
        <button className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors">
          <Bell className="h-5 w-5" />
        </button>

        {/* Avatar */}
        {user && (
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-unfpa-blue text-white text-xs font-bold">
              {(user.full_name?.[0] ?? user.email[0]).toUpperCase()}
            </div>
            <div className="hidden sm:block leading-tight">
              <p className="text-xs font-medium text-gray-900 dark:text-white">
                {user.full_name || user.email}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 capitalize">
                {user.role.replace('_', ' ')}
              </p>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
