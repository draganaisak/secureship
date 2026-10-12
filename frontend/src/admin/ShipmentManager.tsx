import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import {
  useListShipments,
  useCreateShipment,
  useUpdateShipment,
  useDeleteShipment,
  getListShipmentsQueryKey,
} from '../api/generated/endpoints'
import { ShipmentStatus } from '../api/generated/model'
import type { ShipmentRead } from '../api/generated/model'
import { Field, ManagerShell, Modal, ConfirmDialog, StatusBadge, EditButton, DeleteButton, inputClass, btnPrimary, btnGhost, th, td, card, tableCard } from './widgets'

interface Draft {
  customer_id: string
  tracking_number: string
  status: ShipmentStatus
  carrier: string
  origin: string
  destination: string
  estimated_delivery: string
  last_update: string
}

const EMPTY: Draft = {
  customer_id: '',
  tracking_number: '',
  status: ShipmentStatus.in_transit,
  carrier: '',
  origin: '',
  destination: '',
  estimated_delivery: '',
  last_update: '',
}

export default function ShipmentManager() {
  const qc = useQueryClient()
  const { isAuthenticated } = useAuth0()
  const invalidate = () => qc.invalidateQueries({ queryKey: getListShipmentsQueryKey() })
  const list = useListShipments({ query: { enabled: isAuthenticated } })
  const create = useCreateShipment({ mutation: { onSuccess: invalidate } })
  const update = useUpdateShipment({ mutation: { onSuccess: invalidate } })
  const remove = useDeleteShipment({ mutation: { onSuccess: invalidate } })

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null)
  const [q, setQ] = useState('')

  const term = q.trim().toLowerCase()
  const rows = (list.data?.data ?? []).filter(
    (s) =>
      !term ||
      `${s.tracking_number} ${s.status} ${s.carrier} ${s.origin} ${s.destination}`
        .toLowerCase()
        .includes(term),
  )
  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }))

  const openCreate = () => {
    setEditingId(null)
    setDraft(EMPTY)
    setOpen(true)
  }
  const openEdit = (s: ShipmentRead) => {
    setEditingId(s.id)
    setDraft({
      customer_id: s.customer_id,
      tracking_number: s.tracking_number,
      status: s.status,
      carrier: s.carrier,
      origin: s.origin,
      destination: s.destination,
      estimated_delivery: s.estimated_delivery,
      last_update: s.last_update.slice(0, 16),
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
    const data = { ...draft, last_update: new Date(draft.last_update).toISOString() }
    if (editingId) {
      update.mutate({ shipmentId: editingId, data }, { onSuccess: close })
    } else {
      create.mutate({ data }, { onSuccess: close })
    }
  }

  const saving = create.isPending || update.isPending

  return (
    <>
      <ManagerShell title="Shipments" addLabel="+ Add shipment" onAdd={openCreate} search={q} onSearch={setQ} isLoading={list.isLoading} isError={list.isError} error={list.error}>
        <ul className="flex flex-col gap-3 md:hidden">
          {rows.map((s) => (
            <li key={s.id} className={card}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs break-all text-slate-700">{s.tracking_number}</span>
                <StatusBadge status={s.status} />
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-slate-400">Carrier</dt>
                <dd className="text-slate-700">{s.carrier}</dd>
                <dt className="text-slate-400">Route</dt>
                <dd className="text-slate-700">{s.origin} &rarr; {s.destination}</dd>
                <dt className="text-slate-400">ETA</dt>
                <dd className="text-slate-700">{s.estimated_delivery}</dd>
              </dl>
              <div className="mt-3 flex justify-end gap-1">
                <EditButton onClick={() => openEdit(s)} />
                <DeleteButton onClick={() => setPendingDelete({ id: s.id, label: s.tracking_number })} />
              </div>
            </li>
          ))}
          {rows.length === 0 && (
            <li className={`${card} text-sm text-slate-400`}>{term ? 'No matches.' : 'No shipments yet.'}</li>
          )}
        </ul>

        <div className={tableCard}>
          <table className="w-full text-sm">
            <thead className="sticky top-14 z-10">
              <tr>
                <th className={th}>Tracking</th>
                <th className={th}>Status</th>
                <th className={th}>Carrier</th>
                <th className={th}>Route</th>
                <th className={th}>ETA</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0">
                  <td className={`${td} font-mono text-xs`}>{s.tracking_number}</td>
                  <td className={td}><StatusBadge status={s.status} /></td>
                  <td className={td}>{s.carrier}</td>
                  <td className={td}>{s.origin} &rarr; {s.destination}</td>
                  <td className={td}>{s.estimated_delivery}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    <div className="flex justify-end gap-1">
                      <EditButton onClick={() => openEdit(s)} />
                      <DeleteButton onClick={() => setPendingDelete({ id: s.id, label: s.tracking_number })} />
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className={`${td} text-slate-400`} colSpan={6}>{term ? 'No matches.' : 'No shipments yet.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ManagerShell>

      {open && (
        <Modal title={editingId ? 'Edit shipment' : 'Add shipment'} onClose={close}>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Customer ID">
                <input className={inputClass} value={draft.customer_id} onChange={(e) => set('customer_id', e.target.value)} placeholder="uuid" required />
              </Field>
              <Field label="Tracking number">
                <input className={inputClass} value={draft.tracking_number} onChange={(e) => set('tracking_number', e.target.value)} required />
              </Field>
              <Field label="Status">
                <select className={inputClass} value={draft.status} onChange={(e) => set('status', e.target.value)}>
                  {Object.values(ShipmentStatus).map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </Field>
              <Field label="Carrier">
                <input className={inputClass} value={draft.carrier} onChange={(e) => set('carrier', e.target.value)} required />
              </Field>
              <Field label="Origin">
                <input className={inputClass} value={draft.origin} onChange={(e) => set('origin', e.target.value)} required />
              </Field>
              <Field label="Destination">
                <input className={inputClass} value={draft.destination} onChange={(e) => set('destination', e.target.value)} required />
              </Field>
              <Field label="Estimated delivery">
                <input type="date" className={inputClass} value={draft.estimated_delivery} onChange={(e) => set('estimated_delivery', e.target.value)} required />
              </Field>
              <Field label="Last update">
                <input type="datetime-local" className={inputClass} value={draft.last_update} onChange={(e) => set('last_update', e.target.value)} required />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={btnGhost} onClick={close}>Cancel</button>
              <button type="submit" className={btnPrimary} disabled={saving}>
                {editingId ? 'Save changes' : 'Add shipment'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete shipment"
          message={`Delete shipment ${pendingDelete.label}? This also permanently deletes its packages. This can't be undone.`}
          pending={remove.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() =>
            remove.mutate({ shipmentId: pendingDelete.id }, { onSuccess: () => setPendingDelete(null) })
          }
        />
      )}
    </>
  )
}
