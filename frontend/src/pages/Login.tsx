import { FormEvent, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react'
import { useAuth, apiErrorMessage } from '@/context/AuthContext'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export default function Login() {
  const { login, verifyTotp, totpRequired } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string })?.from ?? '/'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [totp, setTotp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { totpRequired: required } = await login(username, password)
      if (!required) navigate(from, { replace: true })
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid username or password.'))
    } finally {
      setLoading(false)
    }
  }

  const handleTotp = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await verifyTotp(totp)
      navigate(from, { replace: true })
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid verification code.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-unfpa-dark via-unfpa-blue to-unfpa-light px-4">
      {/* Card */}
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 shadow-2xl p-8">
        {/* Logo / branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-unfpa-blue shadow-lg">
            <span className="font-bangla text-3xl font-bold text-white leading-none">স</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Spondon</h1>
          <p className="font-bangla text-sm text-unfpa-blue mt-1">স্পন্দন IDMS</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            CIPRB / UNFPA Bangladesh M&amp;E System
          </p>
        </div>

        {!totpRequired ? (
          /* ─── Step 1: username + password ─── */
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2.5 pl-10 pr-4 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-unfpa-blue focus:outline-none focus:ring-2 focus:ring-unfpa-blue/20"
                  placeholder="Enter username"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2.5 pl-10 pr-10 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-unfpa-blue focus:outline-none focus:ring-2 focus:ring-unfpa-blue/20"
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-unfpa-blue py-2.5 text-sm font-semibold text-white hover:bg-unfpa-dark focus:outline-none focus:ring-2 focus:ring-unfpa-blue/50 disabled:opacity-60 transition-colors"
            >
              {loading ? <LoadingSpinner size="sm" className="text-white" /> : 'Sign in'}
            </button>
          </form>
        ) : (
          /* ─── Step 2: TOTP ─── */
          <form onSubmit={handleTotp} className="space-y-4">
            <div className="rounded-xl bg-unfpa-blue/10 px-4 py-3 flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-unfpa-blue mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-unfpa-blue">Two-factor verification</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Verification code
              </label>
              <input
                type="text"
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2.5 px-4 text-center text-2xl font-mono tracking-[0.5em] text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none focus:ring-2 focus:ring-unfpa-blue/20"
                placeholder="000000"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || totp.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-unfpa-blue py-2.5 text-sm font-semibold text-white hover:bg-unfpa-dark focus:outline-none focus:ring-2 focus:ring-unfpa-blue/50 disabled:opacity-60 transition-colors"
            >
              {loading ? <LoadingSpinner size="sm" className="text-white" /> : 'Verify'}
            </button>
          </form>
        )}
      </div>

      <p className="mt-6 text-xs text-white/50">
        Spondon IDMS · CIPRB / UNFPA Bangladesh
      </p>
    </div>
  )
}
