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
          40%  { transform: translate(-70px, 55px) scale(0.92); }
          80%  { transform: translate(50px, -35px) scale(1.1);  }
          100% { transform: translate(0px,  0px)   scale(1.05); }
        }
        @keyframes orb3 {
          0%   { transform: translate(0px, 0px)    scale(1);    }
          50%  { transform: translate(45px, 60px)  scale(1.08); }
          100% { transform: translate(0px, 0px)    scale(1);    }
        }
        @keyframes orb4 {
          0%   { transform: translate(0px,   0px)  scale(0.95); }
          60%  { transform: translate(-55px,-45px) scale(1.1);  }
          100% { transform: translate(0px,   0px)  scale(0.95); }
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
            background: '#130A04',   /* very dark warm near-black */
            display: 'flex',
            flexDirection: 'column',
            padding: 'clamp(40px, 6vh, 72px) clamp(36px, 5vw, 64px)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Floating colour orbs */}
          <div style={{
            position: 'absolute', width: 480, height: 480, borderRadius: '50%',
            background: '#F96000', filter: 'blur(110px)', opacity: 0.28,
            top: '-10%', left: '-5%',
            animation: 'orb1 14s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', width: 380, height: 380, borderRadius: '50%',
            background: '#ED5B7E', filter: 'blur(100px)', opacity: 0.22,
            bottom: '5%', right: '-8%',
            animation: 'orb2 18s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', width: 300, height: 300, borderRadius: '50%',
            background: '#F2B544', filter: 'blur(90px)', opacity: 0.20,
            top: '45%', left: '35%',
            animation: 'orb3 11s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', width: 260, height: 260, borderRadius: '50%',
            background: '#C94030', filter: 'blur(80px)', opacity: 0.18,
            bottom: '25%', left: '-5%',
            animation: 'orb4 16s ease-in-out infinite',
          }} />

          {/* Content sits above the orbs */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* SIMPLE wordmark */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h1 style={{
                fontSize: 'clamp(80px, 10vw, 128px)',
                fontWeight: 800,
                letterSpacing: '-0.045em',
                lineHeight: 0.88,
                color: 'white',
                margin: '0 0 clamp(20px, 3vh, 32px)',
              }}>
                SIMPLE
              </h1>

              <p style={{
                fontSize: 'clamp(13px, 1.15vw, 16px)',
                lineHeight: 1.75,
                color: 'rgba(255,255,255,0.52)',
                maxWidth: 390,
                margin: '0 0 clamp(20px, 3vh, 32px)',
                fontWeight: 400,
              }}>
                <b style={{ color: '#FFAA60', fontWeight: 700 }}>S</b>trengthening{' '}
                <b style={{ color: '#FFAA60', fontWeight: 700 }}>I</b>ntegrated{' '}
                <b style={{ color: '#FFAA60', fontWeight: 700 }}>M</b>onitoring,{' '}
                <b style={{ color: '#FFAA60', fontWeight: 700 }}>P</b>rogramme{' '}
                <b style={{ color: '#FFAA60', fontWeight: 700 }}>L</b>earning and{' '}
                <b style={{ color: '#FFAA60', fontWeight: 700 }}>E</b>vidence for SRHR
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
