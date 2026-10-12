import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import {
  useListPackages,
  useCreatePackage,
  useUpdatePackage,
  useDeletePackage,
  getListPackagesQueryKey,
} from '../api/generated/endpoints'
import type { PackageRead } from '../api/generated/model'
import { Field, ManagerShell, Modal, ConfirmDialog, EditButton, DeleteButton, inputClass, btnPrimary, btnGhost, th, td, card, tableCard } from './widgets'

interface Draft {
  shipment_id: string
  description: string
  weight_kg: string
  declared_value: string
}

const EMPTY: Draft = { shipment_id: '', description: '', weight_kg: '', declared_value: '' }

export default function PackageManager() {
  const qc = useQueryClient()
  const { isAuthenticated } = useAuth0()
  const invalidate = () => qc.invalidateQueries({ queryKey: getListPackagesQueryKey() })
  const list = useListPackages({ query: { enabled: isAuthenticated } })
  const create = useCreatePackage({ mutation: { onSuccess: invalidate } })
  const update = useUpdatePackage({ mutation: { onSuccess: invalidate } })
  const remove = useDeletePackage({ mutation: { onSuccess: invalidate } })

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null)
  const [q, setQ] = useState('')

  const term = q.trim().toLowerCase()
  const rows = (list.data?.data ?? []).filter(
    (p) => !term || `${p.description} ${p.shipment_id}`.toLowerCase().includes(term),
  )
  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }))

  const openCreate = () => {
    setEditingId(null)
    setDraft(EMPTY)
    setOpen(true)
  }
  const openEdit = (p: PackageRead) => {
    setEditingId(p.id)
    setDraft({
      shipment_id: p.shipment_id,
      description: p.description,
      weight_kg: String(p.weight_kg),
      declared_value: String(p.declared_value),
    })
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    setEditingId(null)
    setDraft(EMPTY)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const data = {
      shipment_id: draft.shipment_id,
      description: draft.description,
      weight_kg: draft.weight_kg,
      declared_value: draft.declared_value,
    }
    if (editingId) {
      update.mutate({ packageId: editingId, data }, { onSuccess: close })
    } else {
      create.mutate({ data }, { onSuccess: close })
    }
  }

  const saving = create.isPending || update.isPending

  return (
    <>
      <ManagerShell title="Packages" addLabel="+ Add package" onAdd={openCreate} search={q} onSearch={setQ} isLoading={list.isLoading} isError={list.isError} error={list.error}>
        <ul className="flex flex-col gap-3 md:hidden">
          {rows.map((p) => (
            <li key={p.id} className={card}>
              <p className="font-medium break-words text-slate-800">{p.description}</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-slate-400">Weight</dt>
                <dd className="text-slate-700">{p.weight_kg} kg</dd>
                <dt className="text-slate-400">Declared</dt>
                <dd className="text-slate-700">{p.declared_value}</dd>
                <dt className="text-slate-400">Shipment</dt>
                <dd className="font-mono text-xs break-all text-slate-700">{p.shipment_id}</dd>
              </dl>
              <div className="mt-3 flex justify-end gap-1">
                <EditButton onClick={() => openEdit(p)} />
                <DeleteButton onClick={() => setPendingDelete({ id: p.id, label: p.description })} />
              </div>
            </li>
          ))}
          {rows.length === 0 && (
            <li className={`${card} text-sm text-slate-400`}>{term ? 'No matches.' : 'No packages yet.'}</li>
          )}
        </ul>

        <div className={tableCard}>
          <table className="w-full text-sm">
            <thead className="sticky top-14 z-10">
              <tr>
                <th className={th}>Description</th>
                <th className={th}>Weight (kg)</th>
                <th className={th}>Declared value</th>
                <th className={th}>Shipment</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className={td}>{p.description}</td>
                  <td className={td}>{p.weight_kg}</td>
                  <td className={td}>{p.declared_value}</td>
                  <td className={`${td} font-mono text-xs`}>{p.shipment_id}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    <div className="flex justify-end gap-1">
                      <EditButton onClick={() => openEdit(p)} />
                      <DeleteButton onClick={() => setPendingDelete({ id: p.id, label: p.description })} />
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className={`${td} text-slate-400`} colSpan={5}>{term ? 'No matches.' : 'No packages yet.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ManagerShell>

      {open && (
        <Modal title={editingId ? 'Edit package' : 'Add package'} onClose={close}>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Shipment ID">
                <input className={inputClass} value={draft.shipment_id} onChange={(e) => set('shipment_id', e.target.value)} placeholder="uuid" required />
              </Field>
              <Field label="Description">
                <input className={inputClass} value={draft.description} onChange={(e) => set('description', e.target.value)} required />
              </Field>
              <Field label="Weight (kg)">
                <input type="number" step="0.01" min="0" className={inputClass} value={draft.weight_kg} onChange={(e) => set('weight_kg', e.target.value)} required />
              </Field>
              <Field label="Declared value">
                <input type="number" step="0.01" min="0" className={inputClass} value={draft.declared_value} onChange={(e) => set('declared_value', e.target.value)} required />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={btnGhost} onClick={close}>Cancel</button>
              <button type="submit" className={btnPrimary} disabled={saving}>
                {editingId ? 'Save changes' : 'Add package'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete package"
          message={`Delete package "${pendingDelete.label}"? This can't be undone.`}
          pending={remove.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() =>
            remove.mutate({ packageId: pendingDelete.id }, { onSuccess: () => setPendingDelete(null) })
          }
        />
      )}
    </>
  )
}
