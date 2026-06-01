import { FormEvent, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth, apiErrorMessage } from '@/context/AuthContext'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

// KoboToolbox quick-access links for field staff who have no dashboard account.
// Grouped by the two implementing partners so staff can scan quickly.
const KOBO_LINKS = [
  { label: 'Clinic Visit',     url: 'https://ee.kobotoolbox.org/x/TAxdHQQu' },
  { label: 'Outreach',         url: 'https://ee.kobotoolbox.org/x/mL50QRl8' },
  { label: 'Group Education',  url: 'https://ee.kobotoolbox.org/x/VZ1iYrTd' },
  { label: 'HIV / STI Test',   url: 'https://ee.kobotoolbox.org/x/svhvZM4N' },
  { label: 'Fistula Corner',   url: 'https://ee.kobotoolbox.org/x/2EemD80H' },
  { label: 'MPDSR',            url: 'https://ee.kobotoolbox.org/x/ZOBX0pKd' },
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string })?.from ?? '/'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(username, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid username or password.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'var(--body, sans-serif)' }}>

      {/* ── LEFT: Brand panel ──────────────────────────────────────────── */}
      <div style={{
        flex: '0 0 52%',
        background: 'linear-gradient(160deg, #001A38 0%, #002D5C 60%, #003D6B 100%)',
        display: 'flex',
        flexDirection: 'column',
        padding: 'clamp(40px, 6vh, 72px) clamp(36px, 5vw, 64px)',
        position: 'relative',
        overflow: 'hidden',
      }} className="login-brand-panel">

        {/* Subtle radial glow — bottom-right, doesn't compete with text */}
        <div style={{
          position: 'absolute', bottom: -100, right: -100,
          width: 400, height: 400, borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(0,114,188,0.22) 0%, transparent 65%)',
        }} />
        <div style={{
          position: 'absolute', top: -60, left: -60,
          width: 260, height: 260, borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(0,114,188,0.10) 0%, transparent 65%)',
        }} />

        {/* Organisation line */}
        <div style={{
          fontSize: 10, letterSpacing: '0.22em',
          color: 'rgba(255,255,255,0.35)',
          fontFamily: 'var(--mono, monospace)',
          marginBottom: 'clamp(32px, 5vh, 56px)',
        }}>
          CIPRB · UNFPA BANGLADESH · 2026
        </div>

        {/* SIMPLE wordmark */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h1 style={{
            fontSize: 'clamp(72px, 9vw, 120px)',
            fontWeight: 800,
            letterSpacing: '-0.045em',
            lineHeight: 0.88,
            color: 'white',
            margin: '0 0 clamp(18px, 2.5vh, 28px)',
          }}>
            SIMPLE
          </h1>

          <p style={{
            fontSize: 'clamp(13px, 1.1vw, 15.5px)',
            lineHeight: 1.7,
            color: 'rgba(255,255,255,0.55)',
            maxWidth: 380,
            margin: '0 0 clamp(24px, 4vh, 40px)',
            fontWeight: 400,
          }}>
            <b style={{ color: '#60AADF', fontWeight: 700 }}>S</b>trengthening{' '}
            <b style={{ color: '#60AADF', fontWeight: 700 }}>I</b>ntegrated{' '}
            <b style={{ color: '#60AADF', fontWeight: 700 }}>M</b>onitoring,{' '}
            <b style={{ color: '#60AADF', fontWeight: 700 }}>P</b>rogramme{' '}
            <b style={{ color: '#60AADF', fontWeight: 700 }}>L</b>earning and{' '}
            <b style={{ color: '#60AADF', fontWeight: 700 }}>E</b>vidence for SRHR
          </p>

          <div style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.25)',
            letterSpacing: '0.05em',
          }}>
            Reproductive &amp; Child Health Programme
          </div>
        </div>

        {/* KoboToolbox quick links — field staff only */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.09)',
          paddingTop: 'clamp(18px, 3vh, 28px)',
          marginTop: 'clamp(18px, 3vh, 28px)',
        }}>
          <div style={{
            fontSize: 9.5, letterSpacing: '0.2em',
            color: 'rgba(255,255,255,0.25)',
            fontFamily: 'var(--mono, monospace)',
            marginBottom: 12,
          }}>
            FIELD STAFF — SUBMIT VIA KOBOTOOLS
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
            {KOBO_LINKS.map(({ label, url }) => (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.45)',
                  textDecoration: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.15)',
                  paddingBottom: 1,
                  transition: 'color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.9)'
                  ;(e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(96,170,223,0.6)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.45)'
                  ;(e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.15)'
                }}
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT: Form panel ───────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        background: '#F7F8FA',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(32px, 6vh, 64px) clamp(28px, 5vw, 56px)',
      }}>
        <div style={{ width: '100%', maxWidth: 360 }}>

          {/* Form heading */}
          <div style={{ marginBottom: 36 }}>
            <h2 style={{
              fontSize: 28,
              fontWeight: 700,
              color: '#0F1923',
              letterSpacing: '-0.02em',
              margin: '0 0 6px',
            }}>
              Sign in
            </h2>
            <p style={{ fontSize: 14, color: '#6B7280', margin: 0 }}>
              Enter your SIMPLE credentials below
            </p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Username */}
            <div>
              <label style={{
                display: 'block', fontSize: 13, fontWeight: 500,
                color: '#374151', marginBottom: 6,
              }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoFocus
                placeholder="your@email.org"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 14px',
                  fontSize: 14,
                  border: '1.5px solid #D1D5DB',
                  borderRadius: 8,
                  background: 'white',
                  color: '#111827',
                  outline: 'none',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                onFocus={e => {
                  e.target.style.borderColor = '#0072BC'
                  e.target.style.boxShadow = '0 0 0 3px rgba(0,114,188,0.12)'
                }}
                onBlur={e => {
                  e.target.style.borderColor = '#D1D5DB'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{
                display: 'block', fontSize: 13, fontWeight: 500,
                color: '#374151', marginBottom: 6,
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '10px 42px 10px 14px',
                    fontSize: 14,
                    border: '1.5px solid #D1D5DB',
                    borderRadius: 8,
                    background: 'white',
                    color: '#111827',
                    outline: 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#0072BC'
                    e.target.style.boxShadow = '0 0 0 3px rgba(0,114,188,0.12)'
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#D1D5DB'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  style={{
                    position: 'absolute', right: 12, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', padding: 0,
                    cursor: 'pointer', color: '#9CA3AF',
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                padding: '10px 14px',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 8,
                fontSize: 13,
                color: '#DC2626',
              }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '11px 0',
                background: loading ? '#93C5E8' : '#0072BC',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 4,
              }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#005C99' }}
              onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#0072BC' }}
            >
              {loading ? <LoadingSpinner size="sm" className="text-white" /> : 'Sign in'}
            </button>
          </form>

          {/* Footer */}
          <p style={{
            marginTop: 40,
            fontSize: 11.5,
            color: '#9CA3AF',
            textAlign: 'center',
            letterSpacing: '0.03em',
          }}>
            SIMPLE · CIPRB / UNFPA Bangladesh
          </p>
        </div>
      </div>

      {/* Responsive: collapse left panel on narrow screens */}
      <style>{`
        @media (max-width: 760px) {
          .login-brand-panel {
            display: none !important;
          }
        }
      `}</style>
    </div>
  )
}
