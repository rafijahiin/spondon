import { FormEvent, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth, apiErrorMessage } from '@/context/AuthContext'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'


export default function Login() {
  const { login } = useAuth()
  const navigate   = useNavigate()
  const location   = useLocation()
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
    <>
      {/* ── Keyframe animations for the floating orbs ── */}
      <style>{`
        @keyframes orb1 {
          0%   { transform: translate(0px,   0px)   scale(1);    }
          33%  { transform: translate(60px, -50px)  scale(1.12); }
          66%  { transform: translate(-30px, 40px)  scale(0.95); }
          100% { transform: translate(0px,   0px)   scale(1);    }
        }
        @keyframes orb2 {
          0%   { transform: translate(0px,  0px)   scale(1.05); }
          50%  { transform: translate(-60px, 70px) scale(0.90); }
          100% { transform: translate(0px,  0px)   scale(1.05); }
        }
        @media (max-width: 760px) {
          .login-brand-panel { display: none !important; }
        }
      `}</style>

      <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'var(--body, sans-serif)' }}>

        {/* ── LEFT: Brand panel with animated orbs ─────────────────────── */}
        <div
          className="login-brand-panel"
          style={{
            flex: '0 0 52%',
            background: '#09090C',   /* near-black neutral — lets orange glow */
            display: 'flex',
            flexDirection: 'column',
            padding: 'clamp(40px, 6vh, 72px) clamp(36px, 5vw, 64px)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Two orbs only — orange dominant, coral accent */}
          <div style={{
            position: 'absolute', width: 560, height: 560, borderRadius: '50%',
            background: '#F96000', filter: 'blur(130px)', opacity: 0.30,
            top: '-15%', left: '-10%',
            animation: 'orb1 16s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', width: 360, height: 360, borderRadius: '50%',
            background: '#ED5B7E', filter: 'blur(110px)', opacity: 0.18,
            bottom: '-5%', right: '-5%',
            animation: 'orb2 20s ease-in-out infinite',
          }} />

          {/* Content sits above the orbs */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* SIMPLE wordmark */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h1 style={{
                fontSize: 'clamp(72px, 9.5vw, 118px)',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                lineHeight: 1,
                color: 'white',
                margin: '0 0 clamp(16px, 2.5vh, 26px)',
              }}>
                SIMPLE
              </h1>

              <p style={{
                fontSize: 'clamp(12px, 1.05vw, 14.5px)',
                lineHeight: 1.65,
                color: 'rgba(255,255,255,0.50)',
                margin: '0 0 clamp(20px, 3vh, 32px)',
                fontWeight: 400,
                whiteSpace: 'nowrap',
              }}>
                <b style={{ color: '#F96000', fontWeight: 700 }}>S</b>trengthening{' '}
                <b style={{ color: '#F96000', fontWeight: 700 }}>I</b>ntegrated{' '}
                <b style={{ color: '#F96000', fontWeight: 700 }}>M</b>onitoring,{' '}
                <b style={{ color: '#F96000', fontWeight: 700 }}>P</b>rogramme{' '}
                <b style={{ color: '#F96000', fontWeight: 700 }}>L</b>earning and{' '}
                <b style={{ color: '#F96000', fontWeight: 700 }}>E</b>vidence for SRHR
              </p>

            </div>
          </div>
        </div>

        {/* ── RIGHT: Form panel ─────────────────────────────────────────── */}
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

            <div style={{ marginBottom: 36 }}>
              <h2 style={{
                fontSize: 28, fontWeight: 700,
                color: '#0F1923', letterSpacing: '-0.02em',
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
                    padding: '10px 14px', fontSize: 14,
                    border: '1.5px solid #D1D5DB', borderRadius: 8,
                    background: 'white', color: '#111827', outline: 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#F96000'
                    e.target.style.boxShadow = '0 0 0 3px rgba(249,96,0,0.12)'
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
                      padding: '10px 42px 10px 14px', fontSize: 14,
                      border: '1.5px solid #D1D5DB', borderRadius: 8,
                      background: 'white', color: '#111827', outline: 'none',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = '#F96000'
                      e.target.style.boxShadow = '0 0 0 3px rgba(249,96,0,0.12)'
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
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  borderRadius: 8, fontSize: 13, color: '#DC2626',
                }}>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '11px 0',
                  background: loading ? '#F9A070' : '#F96000',
                  color: 'white', border: 'none', borderRadius: 8,
                  fontSize: 14, fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8, marginTop: 4,
                }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#D95300' }}
                onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#F96000' }}
              >
                {loading ? <LoadingSpinner size="sm" className="text-white" /> : 'Sign in'}
              </button>
            </form>

          </div>
        </div>

      </div>
    </>
  )
}
