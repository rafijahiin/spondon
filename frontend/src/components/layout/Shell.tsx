import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { cn } from '@/utils/cn'

export function Shell() {
  // Desktop: sidebar expanded/collapsed. Mobile: sidebar overlay open/closed.
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — mobile: fixed overlay; desktop: static column */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-30 lg:relative lg:z-auto',
          'transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0'
        )}
      >
        <Sidebar
          collapsed={desktopCollapsed}
          onClose={() => setMobileOpen(false)}
        />
      </div>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          onToggleSidebar={() => {
            if (window.innerWidth < 1024) {
              setMobileOpen((o) => !o)
            } else {
              setDesktopCollapsed((c) => !c)
            }
          }}
          sidebarOpen={mobileOpen || !desktopCollapsed}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
