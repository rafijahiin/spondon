/**
 * Target Config — /admin/targets
 *
 * Editable indicator-target registry. Loads 44 rows from /api/indicators/
 * targets/ (or fewer when filtered for org_lead). Groups by Partner →
 * Objective → Activity. Each row's `target_value` is editable inline
 * via a click-to-edit pattern; saves PATCH the row and stamp updated_by
 * server-side.
 *
 * Permissions (enforced server-side via CanConfigureTargets):
 *   Developer + Supervisor → edit any partner
 *   Org Lead               → edit only own partner
 *   Manager / focal / etc. → 403 on PATCH; this page is route-gated
 *                            in App.tsx to only admins + org_lead.
 *
 * Visual rules:
 *   - target_value === null  →  orange "Not Set" pill (click to edit)
 *   - target_value === 0     →  shows literal "0"
 *   - Bandhu objectives render 1 → 2 → 4 with no placeholder for Obj 3
 *   - PHD objective_number=0 ("Overall") renders ABOVE Objective 1,
 *     not inside it
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Edit3, X, AlertCircle } from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import type { IndicatorTarget } from '@/types'

interface Grouped {
  partnerCode: string
  partnerColor: string
  objectives: {
    number: number
    activities: {
      code: string
      label: string
      rows: IndicatorTarget[]
    }[]
  }[]
}

function groupTargets(rows: IndicatorTarget[]): Grouped[] {
  const byPartner = new Map<string, IndicatorTarget[]>()
  for (const r of rows) {
    if (!byPartner.has(r.partner_code)) byPartner.set(r.partner_code, [])
    byPartner.get(r.partner_code)!.push(r)
  }

  // Stable partner order per spec.
  const partnerOrder = ['CIPRB', 'Bandhu', 'PHD']
  const result: Grouped[] = []

  for (const code of partnerOrder) {
    const rs = byPartner.get(code)
    if (!rs || rs.length === 0) continue
    const color = rs[0].partner_color

    // Group by objective_number — sort numerically, but Bandhu's set is
    // {1, 2, 4} not {1, 2, 3, 4}: do NOT renumber, do NOT insert obj 3.
    const objNums = Array.from(new Set(rs.map(r => r.objective_number))).sort((a, b) => a - b)

    const objectives = objNums.map(num => {
      const objRows = rs.filter(r => r.objective_number === num)
      // Group rows under the same activity_label so commodity-split
      // activities like PHD 1.5 (5 commodity rows) collapse under one
      // accordion header.
      const byAct = new Map<string, IndicatorTarget[]>()
      for (const r of objRows) {
        if (!byAct.has(r.activity_label)) byAct.set(r.activity_label, [])
        byAct.get(r.activity_label)!.push(r)
      }
      const activities = Array.from(byAct.entries()).map(([label, list]) => ({
        code: list[0].activity_code.split(/[a-z]/)[0] || list[0].activity_code,  // parent code
        label,
        rows: list,
      }))
      return { number: num, activities }
    })

    result.push({ partnerCode: code, partnerColor: color, objectives })
  }
  return result
}

/** Pick the i18n key for this objective number — keeps the row label in
 *  sync with IndicatorGrid's group header. Bandhu's missing Obj 3 is
 *  not auto-renumbered; an unknown number falls back to the generic key. */
function objectiveI18nKey(num: number): string {
  if (num >= 0 && num <= 4) return `indicator.objective${num}`
  return 'indicator.objectiveOther'
}

interface TargetCellProps {
  row: IndicatorTarget
  canEdit: boolean
  onSaved: (updated: IndicatorTarget) => void
}

function TargetCell({ row, canEdit, onSaved }: TargetCellProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.target_value ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isNull = row.target_value === null

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const value = draft.trim() === '' ? null : draft
      const resp = await api.patch<IndicatorTarget>(
        `/indicators/targets/${row.id}/`,
        { target_value: value },
      )
      onSaved(resp.data)
      setEditing(false)
    } catch (e) {
      setError(apiErrorMessage(e, 'Save failed.'))
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setDraft(row.target_value ?? '')
    setEditing(false)
    setError('')
  }

  if (!editing) {
    if (isNull) {
      return (
        <button
          onClick={() => canEdit && setEditing(true)}
          disabled={!canEdit}
          className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-orange-300 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
          title={canEdit ? 'Click to set target' : 'Read-only — no permission to edit'}
        >
          <AlertCircle className="h-3 w-3" />
          {t('targetConfig.notSetPill')}
        </button>
      )
    }
    return (
      <button
        onClick={() => canEdit && setEditing(true)}
        disabled={!canEdit}
        className="inline-flex items-center gap-1.5 text-sm font-mono text-gray-900 dark:text-gray-100 hover:text-unfpa-blue disabled:cursor-default disabled:hover:text-gray-900"
        title={canEdit ? 'Click to edit' : ''}
      >
        {Number(row.target_value).toLocaleString()}
        {canEdit && <Edit3 className="h-3 w-3 opacity-40" />}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus
        className="w-24 rounded border border-gray-300 px-2 py-0.5 text-sm font-mono focus:border-unfpa-blue focus:outline-none focus:ring-1 focus:ring-unfpa-blue/40"
        placeholder="value"
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') handleCancel()
        }}
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50"
        title={t('targetConfig.save')}
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        onClick={handleCancel}
        disabled={saving}
        className="rounded p-1 text-gray-500 hover:bg-gray-50"
        title={t('targetConfig.cancel')}
      >
        <X className="h-4 w-4" />
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}

export { TargetConfig as default, TargetConfig as ProgrammeTargetsTab }

function TargetConfig() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [rows, setRows] = useState<IndicatorTarget[] | null>(null)
  const [error, setError] = useState('')

  const canEditRow = (row: IndicatorTarget): boolean => {
    if (!user) return false
    if (user.role === 'developer' || user.role === 'supervisor') return true
    if (user.role === 'org_lead') return row.partner_code === user.organisation
    return false
  }

  useEffect(() => {
    let cancelled = false
    api.get('/indicators/targets/?page_size=200')
      .then(r => {
        if (cancelled) return
        const data = Array.isArray(r.data) ? r.data : r.data?.results ?? []
        setRows(data)
      })
      .catch(e => { if (!cancelled) setError(apiErrorMessage(e, 'Failed to load targets.')) })
    return () => { cancelled = true }
  }, [])

  const grouped = useMemo(() => (rows ? groupTargets(rows) : []), [rows])

  const handleRowSaved = (updated: IndicatorTarget) => {
    setRows(prev => prev?.map(r => r.id === updated.id ? updated : r) ?? null)
  }

  if (rows === null) return <PageLoader />

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('targetConfig.title')}</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {t('targetConfig.subtitle')}
        </p>
        {user?.role === 'org_lead' && (
          <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            {t('targetConfig.scopeBannerOrgLead', { org: user.organisation })}
          </p>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      <div className="space-y-10">
        {grouped.map(g => (
          <section key={g.partnerCode} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <header className="mb-4 flex items-center gap-3">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: g.partnerColor }}
                aria-hidden
              />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{g.partnerCode}</h2>
              <span className="text-sm text-gray-500">
                {g.objectives.reduce((n, o) => n + o.activities.reduce((m, a) => m + a.rows.length, 0), 0)} indicators
              </span>
            </header>

            {g.objectives.map(obj => (
              <div key={obj.number} className="mb-6 last:mb-0">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {t(objectiveI18nKey(obj.number), { n: obj.number })}
                </h3>
                <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-700">
                  <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700">
                    <thead className="bg-gray-50/60 dark:bg-gray-900/40">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('targetConfig.tableActivity')}</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('targetConfig.tableIndicator')}</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('targetConfig.tableTarget')}</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('targetConfig.tableUnit')}</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('targetConfig.tableLastUpdated')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {obj.activities.map(act => (
                        act.rows.map((row, idx) => (
                          <tr key={row.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/30">
                            <td className="whitespace-nowrap px-3 py-2 text-sm font-mono text-gray-700 dark:text-gray-300">
                              {row.activity_code}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
                              {idx === 0 && (
                                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 mb-0.5">
                                  {act.label}
                                </div>
                              )}
                              {row.indicator_label}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <TargetCell row={row} canEdit={canEditRow(row)} onSaved={handleRowSaved} />
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{row.unit}</td>
                            <td className="px-3 py-2 text-xs text-gray-500">
                              {row.updated_by_email ? (
                                <>
                                  {row.updated_by_email}
                                  <br />
                                  <span className="text-gray-400">{new Date(row.updated_at).toLocaleString()}</span>
                                </>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
