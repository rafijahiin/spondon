/**
 * Atmosphere — ambient visual layer behind the main content.
 *
 * Floating gradient orbs + topographic Bangladesh outline
 * + aurora conic beam + grain texture + grid overlay.
 * All decorative; aria-hidden.
 */
export function Atmosphere() {
  return (
    <div className="atmosphere" aria-hidden="true">
      {/* Gradient orbs */}
      <div className="orb blue   drift-1" style={{ top: '-15%', left:  '-10%', width: '62vw', height: '62vw' }} />
      <div className="orb coral  drift-2" style={{ top:  '25%', right: '-18%', width: '58vw', height: '58vw' }} />
      <div className="orb amber  drift-3" style={{ top:  '55%', left:  '20%',  width: '48vw', height: '48vw' }} />
      <div className="orb violet drift-4" style={{ top:  '75%', left:  '-8%',  width: '42vw', height: '42vw' }} />
      <div className="orb mint   drift-5" style={{ top:  '10%', left:  '45%',  width: '34vw', height: '34vw' }} />

      {/* Aurora beam — slowly rotating conic */}
      <div className="aurora" />

      {/* Topographic Bangladesh outlines */}
      <BangladeshTopo />

      {/* Grid overlay */}
      <div className="grid-overlay" />

      {/* Grain */}
      <div className="grain" />
    </div>
  )
}

/** Faint, slowly-pulsing Bangladesh outline behind hero */
function BangladeshTopo() {
  return (
    <svg
      className="topo-svg"
      viewBox="0 0 700 600"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="topo-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00658C" stopOpacity={0.7} />
          <stop offset="100%" stopColor="#F26A4F" stopOpacity={0.5} />
        </linearGradient>
      </defs>
      <g stroke="url(#topo-stroke)" strokeWidth={1.4} fill="none">
        <path d="M275 50 L370 55 L380 130 L355 180 L300 175 L260 145 L255 95 Z" />
        <path d="M165 165 L260 145 L300 175 L295 245 L240 295 L185 280 L150 240 L140 195 Z" />
        <path d="M355 180 L440 175 L460 240 L420 280 L370 270 L355 215 Z" />
        <path d="M460 175 L590 165 L630 220 L595 295 L520 285 L460 240 L460 195 Z" />
        <path d="M295 245 L370 270 L420 280 L450 330 L420 400 L350 390 L300 360 L295 295 Z" />
        <path d="M150 290 L240 295 L300 360 L290 460 L230 490 L160 460 L140 380 Z" />
        <path d="M290 460 L350 390 L420 400 L420 470 L380 510 L320 500 L290 480 Z" />
        <path d="M420 280 L520 285 L595 295 L605 360 L580 460 L545 540 L500 560 L460 530 L450 470 L420 400 Z" />
      </g>
      {/* Concentric pulse rings */}
      <g stroke="#00658C" strokeWidth={0.6} fill="none">
        <circle cx={370} cy={300} r={80}  className="pulse-ring p1" />
        <circle cx={370} cy={300} r={160} className="pulse-ring p2" />
        <circle cx={370} cy={300} r={240} className="pulse-ring p3" />
      </g>
    </svg>
  )
}
