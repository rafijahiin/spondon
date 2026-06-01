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
      <style>{`
        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(ellipse at 20% 30%, #C44E00 0%, transparent 55%),
            radial-gradient(ellipse at 80% 75%, #8B2800 0%, transparent 50%),
            radial-gradient(ellipse at 55% 10%, #5A1400 0%, transparent 45%),
            #070504;
          font-family: var(--ui, sans-serif);
        }

        /* ── Floating 3D shapes ── */
        .shape {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          will-change: transform;
        }
        .shape-1 {
          width: 220px; height: 220px;
          top: 6%; left: 8%;
          background: linear-gradient(135deg, #F96000 0%, #C44E00 60%, #7A2C00 100%);
          box-shadow:
            inset -6px -8px 18px rgba(0,0,0,0.45),
            inset 6px 6px 14px rgba(255,160,80,0.30),
            0 30px 60px rgba(0,0,0,0.55);
          animation: float1 9s ease-in-out infinite;
          border-radius: 62% 38% 46% 54% / 60% 44% 56% 40%;
        }
        .shape-2 {
          width: 160px; height: 160px;
          top: 4%; right: 12%;
          background: linear-gradient(135deg, #ED5B7E 0%, #C44E00 70%, #7A2C00 100%);
          box-shadow:
            inset -5px -6px 14px rgba(0,0,0,0.40),
            inset 4px 4px 10px rgba(255,180,120,0.25),
            0 20px 45px rgba(0,0,0,0.50);
          animation: float2 11s ease-in-out infinite;
          border-radius: 40% 60% 55% 45% / 50% 65% 35% 50%;
        }
        .shape-3 {
          width: 280px; height: 150px;
          bottom: 14%; left: 4%;
          background: linear-gradient(120deg, #F96000 0%, #A83A00 55%, #5A1A00 100%);
          box-shadow:
            inset -8px -10px 22px rgba(0,0,0,0.50),
            inset 6px 6px 16px rgba(255,140,50,0.25),
            0 25px 55px rgba(0,0,0,0.55);
          animation: float3 13s ease-in-out infinite;
          border-radius: 55% 45% 70% 30% / 40% 60% 40% 60%;
        }
        .shape-4 {
          width: 180px; height: 260px;
          bottom: 8%; right: 6%;
          background: linear-gradient(160deg, #ED5B7E 0%, #C44E00 50%, #6B2200 100%);
          box-shadow:
            inset -5px -7px 16px rgba(0,0,0,0.45),
            inset 4px 5px 12px rgba(255,160,100,0.20),
            0 22px 50px rgba(0,0,0,0.50);
          animation: float4 10s ease-in-out infinite;
          border-radius: 44% 56% 38% 62% / 58% 42% 58% 42%;
        }
        .shape-5 {
          width: 120px; height: 120px;
          top: 42%; right: 4%;
          background: linear-gradient(135deg, #F96000 0%, #8B2800 100%);
          box-shadow:
            inset -4px -5px 12px rgba(0,0,0,0.40),
            inset 3px 3px 8px rgba(255,180,80,0.20),
            0 16px 36px rgba(0,0,0,0.45);
          animation: float5 15s ease-in-out infinite;
          border-radius: 50%;
        }
        /* Glow blobs — soft, behind the shapes */
        .glow-1 {
          position: absolute;
          width: 500px; height: 500px;
          top: -80px; left: -80px;
          background: radial-gradient(circle, rgba(249,96,0,0.18) 0%, transparent 65%);
          pointer-events: none;
        }
        .glow-2 {
          position: absolute;
          width: 400px; height: 400px;
          bottom: -60px; right: -60px;
          background: radial-gradient(circle, rgba(237,91,126,0.12) 0%, transparent 65%);
          pointer-events: none;
        }

        @keyframes float1 {
          0%,100% { transform: translateY(0px) rotate(0deg); }
          50%      { transform: translateY(-22px) rotate(4deg); }
        }
        @keyframes float2 {
          0%,100% { transform: translateY(0px) rotate(-3deg); }
          50%      { transform: translateY(18px) rotate(3deg); }
        }
        @keyframes float3 {
          0%,100% { transform: translateY(0px) rotate(2deg); }
          50%      { transform: translateY(-16px) rotate(-3deg); }
        }
        @keyframes float4 {
          0%,100% { transform: translateY(0px) rotate(-2deg); }
          50%      { transform: translateY(20px) rotate(4deg); }
        }
        @keyframes float5 {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-14px); }
        }

        /* ── Glass card ── */
        .login-glass {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 400px;
          margin: 24px;
          padding: 40px 36px 36px;
          background: rgba(255, 255, 255, 0.07);
          backdrop-filter: blur(28px) saturate(160%);
          -webkit-backdrop-filter: blur(28px) saturate(160%);
          border: 1px solid rgba(255, 255, 255, 0.13);
          border-radius: 24px;
          box-shadow:
            0 2px 0 rgba(255,255,255,0.08) inset,
            0 32px 80px rgba(0,0,0,0.55),
            0 8px 24px rgba(0,0,0,0.35);
        }

        /* Input fields inside glass */
        .glass-input {
          width: 100%;
          box-sizing: border-box;
          padding: 10px 14px;
          font-size: 14px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.16);
          border-radius: 10px;
          color: white;
          outline: none;
          font-family: var(--ui, sans-serif);
          transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
        }
        .glass-input::placeholder { color: rgba(255,255,255,0.38); }
        .glass-input:focus {
          background: rgba(255,255,255,0.13);
          border-color: rgba(249,96,0,0.70);
          box-shadow: 0 0 0 3px rgba(249,96,0,0.18);
        }

        .login-btn {
          width: 100%;
          padding: 11px 0;
          background: #F96000;
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          font-family: var(--ui, sans-serif);
          cursor: pointer;
          transition: background 0.15s, box-shadow 0.15s;
          box-shadow: 0 4px 16px rgba(249,96,0,0.40);
        }
        .login-btn:hover:not(:disabled) {
          background: #D95300;
          box-shadow: 0 4px 20px rgba(249,96,0,0.55);
        }
        .login-btn:disabled { opacity: 0.65; cursor: not-allowed; }
      `}</style>

      <div className="login-root">
        {/* Background glow blobs */}
        <div className="glow-1" />
        <div className="glow-2" />

        {/* Floating 3D shapes */}
        <div className="shape shape-1" />
        <div className="shape shape-2" />
        <div className="shape shape-3" />
        <div className="shape shape-4" />
        <div className="shape shape-5" />

        {/* ── Glass card ── */}
        <div className="login-glass">

          {/* Branding */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{
              fontSize: 52,
              fontWeight: 800,
              letterSpacing: '-0.04em',
              lineHeight: 1,
              color: 'white',
              marginBottom: 8,
            }}>
              SIMPLE
            </div>
            <div style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.45)',
              lineHeight: 1.6,
              letterSpacing: '0.01em',
            }}>
              <span style={{ color: '#F96000', fontWeight: 700 }}>S</span>trengthening{' '}
              <span style={{ color: '#F96000', fontWeight: 700 }}>I</span>ntegrated{' '}
              <span style={{ color: '#F96000', fontWeight: 700 }}>M</span>onitoring,{' '}
              <span style={{ color: '#F96000', fontWeight: 700 }}>P</span>rogramme{' '}
              <span style={{ color: '#F96000', fontWeight: 700 }}>L</span>earning &amp;{' '}
              <span style={{ color: '#F96000', fontWeight: 700 }}>E</span>vidence for SRHR
            </div>
          </div>

          {/* Divider */}
          <div style={{
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)',
            marginBottom: 28,
          }} />

          {/* Form */}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div>
              <label style={{
                display: 'block', fontSize: 12.5, fontWeight: 500,
                color: 'rgba(255,255,255,0.65)', marginBottom: 6, letterSpacing: '0.02em',
              }}>
                Username
              </label>
              <input
                className="glass-input"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoFocus
                placeholder="your@email.org"
              />
            </div>

            <div>
              <label style={{
                display: 'block', fontSize: 12.5, fontWeight: 500,
                color: 'rgba(255,255,255,0.65)', marginBottom: 6, letterSpacing: '0.02em',
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  className="glass-input"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{ paddingRight: 42 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  style={{
                    position: 'absolute', right: 12, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', padding: 0,
                    cursor: 'pointer', color: 'rgba(255,255,255,0.45)',
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                padding: '9px 13px',
                background: 'rgba(199,23,46,0.18)',
                border: '1px solid rgba(199,23,46,0.40)',
                borderRadius: 8,
                fontSize: 12.5,
                color: '#FF8FA3',
              }}>
                {error}
              </div>
            )}

            <button
              className="login-btn"
              type="submit"
              disabled={loading}
              style={{ marginTop: 4 }}
            >
              {loading
                ? <LoadingSpinner size="sm" className="text-white" />
                : 'Sign in'
              }
            </button>
          </form>

        </div>
      </div>
    </>
  )
}
