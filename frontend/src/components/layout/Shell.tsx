/**
 * Shell — editorial light console layout.
 *
 * app-shell grid: Spine (64px) | Main column (topbar + page canvas).
 * Atmosphere layer behind everything.
 */
import { Outlet } from 'react-router-dom'
import { Atmosphere } from './Atmosphere'
import { Spine } from './Spine'
import { Topbar } from './Topbar'

export function Shell() {
  return (
    <div className="app-shell">
      {/* Ambient visual layer */}
      <Atmosphere />

      {/* Left rail navigation */}
      <Spine />

      {/* Main content area */}
      <main className="main-col">
        <Topbar />
        <div className="page">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
