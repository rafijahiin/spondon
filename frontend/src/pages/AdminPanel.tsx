import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, UserX, UserCheck } from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageLoader, LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { AdminUser, Organisation, Role } from '@/types'
// AdminUser extends User with: username, is_active, last_login

const ORGS: Organisation[] = ['CIPRB', 'UNFPA', 'PHD', 'Bandhu']
// Role taxonomy per IDMS handoff.
const ROLES: Role[] = [
  'developer',
  'supervisor',
  'org_lead',
  'manager',
  'field_staff',
  'ciprb_baseline',
  'focal',
]

// Human-readable labels for the role dropdown.
const ROLE_LABELS: Record<string, string> = {
  developer:      'Developer',
  supervisor:     'UNFPA / Supervisor',
  org_lead:       'Org Lead',
  manager:        'Wellness Center Manager',
  field_staff:    'Field Staff / Lab Tech',
  ciprb_baseline: 'CIPRB Baseline Entry',
  focal:          'Focal Person (view-only)',
}

interface UserFormData {
  username: string
  email: string
  first_name: string
  last_name: string
  organisation: Organisation
  role: Role
  password?: string
}

function UserModal({
  user,
  onClose,
  onSuccess,
}: {
  user?: AdminUser
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = !!user
  const [form, setForm] = useState<UserFormData>({
    username: user?.username ?? '',
    email: user?.email ?? '',
    first_name: user?.first_name ?? '',
    last_name: user?.last_name ?? '',
    organisation: (user?.organisation as Organisation) ?? 'PHD',
    role: (user?.role as Role) ?? 'manager',
    password: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = isEdit
        ? { ...form, ...(form.password ? {} : { password: undefined }) }
        : form
      if (isEdit) {
        await api.patch(`/admin/users/${user!.id}/`, payload)
      } else {
        await api.post('/admin/users/', payload)
      }
      onSuccess()
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const field = (key: keyof UserFormData, label: string, type = 'text', required = true) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      <input
        type={type}
        value={(form[key] as string) ?? ''}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        required={required && key !== 'password'}
        autoComplete={type === 'password' ? 'new-password' : undefined}
        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none"
        placeholder={key === 'password' && isEdit ? 'Leave blank to keep current' : undefined}
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="mb-5 text-lg font-bold text-gray-900 dark:text-white">
          {isEdit ? `Edit ${user?.username}` : 'Create User'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {field('first_name', 'First Name')}
            {field('last_name', 'Last Name')}
          </div>
          {field('username', 'Username')}
          {field('email', 'Email', 'email')}
          {field('password', 'Password', 'password', !isEdit)}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Organisation</label>
              <select
                value={form.organisation}
                onChange={(e) => setForm((f) => ({ ...f, organisation: e.target.value as Organisation }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none"
              >
                {ORGS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-unfpa-blue py-2.5 text-sm font-semibold text-white hover:bg-unfpa-dark disabled:opacity-60">
              {saving ? <LoadingSpinner size="sm" className="text-white" /> : isEdit ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AdminPanel() {
  const { t } = useTranslation()
  const [modal, setModal] = useState<{ open: boolean; user?: AdminUser }>({ open: false })

  const { data: users, loading, refetch } = usePolling<AdminUser[]>({
    fetcher: () =>
      api.get('/admin/users/').then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),
    interval: 120_000,
  })

  const toggleActive = async (user: AdminUser) => {
    await api.patch(`/admin/users/${user.id}/`, { is_active: !user.is_active })
    refetch()
  }

  const orgColor: Record<Organisation, string> = {
    CIPRB: 'text-unfpa-blue',
    UNFPA: 'text-unfpa-blue',
    PHD: 'text-green-600 dark:text-green-400',
    Bandhu: 'text-purple-600 dark:text-purple-400',
  }

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('admin.title', { defaultValue: 'Admin Panel' })}</h1>
          <p className="font-bangla mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('admin.subtitle', { defaultValue: 'User Management' })}
          </p>
        </div>
        <button
          onClick={() => setModal({ open: true })}
          className="flex items-center gap-2 rounded-xl bg-unfpa-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-unfpa-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t('admin.addUser', { defaultValue: 'Add User' })}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: t('admin.totalUsers', { defaultValue: 'Total Users' }), value: (users ?? []).length },
          { label: t('admin.active', { defaultValue: 'Active' }), value: (users ?? []).filter((u) => u.is_active).length },
          { label: t('admin.managers', { defaultValue: 'Managers' }), value: (users ?? []).filter((u) => u.role === 'manager').length },
          { label: t('admin.supervisors', { defaultValue: 'Supervisors' }), value: (users ?? []).filter((u) => u.role === 'supervisor').length },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* User table */}
      {loading && !users ? (
        <PageLoader />
      ) : (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40">
                <tr>
                  {[
                    t('admin.thUser', { defaultValue: 'User' }),
                    t('admin.thOrg', { defaultValue: 'Organisation' }),
                    t('admin.thRole', { defaultValue: 'Role' }),
                    t('admin.thStatus', { defaultValue: 'Status' }),
                    t('admin.thLastLogin', { defaultValue: 'Last Login' }),
                    t('admin.thActions', { defaultValue: 'Actions' }),
                  ].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {(users ?? []).map((user) => (
                  <tr key={user.id} className={cn('hover:bg-gray-50 dark:hover:bg-gray-700/30', !user.is_active && 'opacity-50')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-unfpa-blue/15 text-unfpa-blue font-bold text-xs">
                          {(user.first_name?.[0] ?? user.username[0]).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {user.first_name ? `${user.first_name} ${user.last_name}` : user.username}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className={cn('px-4 py-3 font-medium', orgColor[user.organisation as Organisation] ?? 'text-gray-700 dark:text-gray-300')}>
                      {user.organisation}
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-700 dark:text-gray-300">
                      {ROLE_LABELS[user.role] ?? user.role.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={user.is_active ? 'approved' : 'rejected'} overrideLabel={user.is_active ? t('admin.statusActive', { defaultValue: 'Active' }) : t('admin.statusInactive', { defaultValue: 'Inactive' })} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {formatDateTime(user.last_login) || t('admin.never', { defaultValue: 'Never' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setModal({ open: true, user })}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-unfpa-blue transition-colors"
                          title={t('admin.edit', { defaultValue: 'Edit' })}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleActive(user)}
                          className={cn(
                            'rounded-lg p-1.5 transition-colors',
                            user.is_active
                              ? 'text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500'
                              : 'text-gray-400 hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-500'
                          )}
                          title={user.is_active ? t('admin.deactivate', { defaultValue: 'Deactivate' }) : t('admin.activate', { defaultValue: 'Activate' })}
                        >
                          {user.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!(users ?? []).length && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-gray-400">{t('admin.empty', { defaultValue: 'No users found.' })}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal.open && (
        <UserModal
          user={modal.user}
          onClose={() => setModal({ open: false })}
          onSuccess={refetch}
        />
      )}
    </div>
  )
}
