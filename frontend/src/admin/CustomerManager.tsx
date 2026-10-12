import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import {
  useListCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  getListCustomersQueryKey,
} from '../api/generated/endpoints'
import type { CustomerRead } from '../api/generated/model'
import { Field, ManagerShell, Modal, ConfirmDialog, EditButton, DeleteButton, inputClass, btnPrimary, btnGhost, th, td, card, tableCard } from './widgets'

interface Draft {
  first_name: string
  last_name: string
  phone_number: string
  address: string
}

const EMPTY: Draft = { first_name: '', last_name: '', phone_number: '', address: '' }

export default function CustomerManager() {
  const qc = useQueryClient()
  const { isAuthenticated } = useAuth0()
  const invalidate = () => qc.invalidateQueries({ queryKey: getListCustomersQueryKey() })
  const list = useListCustomers({ query: { enabled: isAuthenticated } })
  const create = useCreateCustomer({ mutation: { onSuccess: invalidate } })
  const update = useUpdateCustomer({ mutation: { onSuccess: invalidate } })
  const remove = useDeleteCustomer({ mutation: { onSuccess: invalidate } })

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null)
  const [q, setQ] = useState('')

  const term = q.trim().toLowerCase()
  const rows = (list.data?.data ?? []).filter(
    (c) =>
      !term ||
      `${c.first_name} ${c.last_name} ${c.phone_number} ${c.address}`.toLowerCase().includes(term),
  )
  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }))

  const openCreate = () => {
    setEditingId(null)
    setDraft(EMPTY)
    setOpen(true)
  }
  const openEdit = (c: CustomerRead) => {
    setEditingId(c.id)
    setDraft({ first_name: c.first_name, last_name: c.last_name, phone_number: c.phone_number, address: c.address })
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    setEditingId(null)
    setDraft(EMPTY)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (editingId) {
      update.mutate({ customerId: editingId, data: draft }, { onSuccess: close })
    } else {
      create.mutate({ data: draft }, { onSuccess: close })
    }
  }

  const saving = create.isPending || update.isPending

  return (
    <>
      <ManagerShell title="Customers" addLabel="+ Add customer" onAdd={openCreate} search={q} onSearch={setQ} isLoading={list.isLoading} isError={list.isError} error={list.error}>
        <ul className="flex flex-col gap-3 md:hidden">
          {rows.map((c) => (
            <li key={c.id} className={card}>
              <p className="font-medium text-slate-800">{c.first_name} {c.last_name}</p>
              <p className="mt-0.5 text-sm text-slate-500">{c.phone_number}</p>
              <p className="mt-0.5 text-sm text-slate-500 break-words">{c.address}</p>
              <div className="mt-3 flex justify-end gap-1">
                <EditButton onClick={() => openEdit(c)} />
                <DeleteButton onClick={() => setPendingDelete({ id: c.id, label: `${c.first_name} ${c.last_name}` })} />
              </div>
            </li>
          ))}
          {rows.length === 0 && (
            <li className={`${card} text-sm text-slate-400`}>{term ? 'No matches.' : 'No customers yet.'}</li>
          )}
        </ul>

        <div className={tableCard}>
          <table className="w-full text-sm">
            <thead className="sticky top-14 z-10">
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Phone</th>
                <th className={th}>Address</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className={td}>{c.first_name} {c.last_name}</td>
                  <td className={td}>{c.phone_number}</td>
                  <td className={td}>{c.address}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    <div className="flex justify-end gap-1">
                      <EditButton onClick={() => openEdit(c)} />
                      <DeleteButton onClick={() => setPendingDelete({ id: c.id, label: `${c.first_name} ${c.last_name}` })} />
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className={`${td} text-slate-400`} colSpan={4}>{term ? 'No matches.' : 'No customers yet.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ManagerShell>

      {open && (
        <Modal title={editingId ? 'Edit customer' : 'Add customer'} onClose={close}>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="First name">
                <input className={inputClass} value={draft.first_name} onChange={(e) => set('first_name', e.target.value)} required />
              </Field>
              <Field label="Last name">
                <input className={inputClass} value={draft.last_name} onChange={(e) => set('last_name', e.target.value)} required />
              </Field>
              <Field label="Phone number">
                <input className={inputClass} value={draft.phone_number} onChange={(e) => set('phone_number', e.target.value)} placeholder="+1..." required />
              </Field>
              <Field label="Address">
                <input className={inputClass} value={draft.address} onChange={(e) => set('address', e.target.value)} required />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={btnGhost} onClick={close}>Cancel</button>
              <button type="submit" className={btnPrimary} disabled={saving}>
                {editingId ? 'Save changes' : 'Add customer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete customer"
          message={`Delete ${pendingDelete.label}? This also permanently deletes all of their shipments and packages. This can't be undone.`}
          pending={remove.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() =>
            remove.mutate({ customerId: pendingDelete.id }, { onSuccess: () => setPendingDelete(null) })
          }
        />
      )}
    </>
  )
}
