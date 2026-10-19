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
import { ManagerShell, Modal, ConfirmDialog, EditButton, DeleteButton } from './widgets'
import { Button } from '../ui/Button'
import { TextField } from '../ui/FormField'
import { DataTable } from '../ui/DataTable'
import { useCrudManager } from './useCrudManager'

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

  const mgr = useCrudManager<CustomerRead, Draft>({
    empty: EMPTY,
    rowId: (c) => c.id,
    toDraft: (c) => ({
      first_name: c.first_name,
      last_name: c.last_name,
      phone_number: c.phone_number,
      address: c.address,
    }),
    searchText: (c) => `${c.first_name} ${c.last_name} ${c.phone_number} ${c.address}`,
    saving: create.isPending || update.isPending,
    deleting: remove.isPending,
    saveError: create.error ?? update.error,
    deleteError: remove.error,
    resetErrors: () => {
      create.reset()
      update.reset()
      remove.reset()
    },
    onSubmit: ({ editingId, draft, done }) => {
      if (editingId) {
        update.mutate({ customerId: editingId, data: draft }, { onSuccess: done })
      } else {
        create.mutate({ data: draft }, { onSuccess: done })
      }
    },
    onDelete: ({ id, done }) => remove.mutate({ customerId: id }, { onSuccess: done }),
  })

  const rows = mgr.filterRows(list.data?.data ?? [])

  return (
    <>
      <ManagerShell title="Customers" addLabel="+ Add customer" onAdd={mgr.openCreate} search={mgr.q} onSearch={mgr.setQ} isLoading={list.isLoading} isError={list.isError} error={list.error}>
        <DataTable
          rows={rows}
          getRowKey={(c) => c.id}
          emptyText={mgr.term ? 'No matches.' : 'No customers yet.'}
          columns={[
            { header: 'Name', cell: (c) => `${c.first_name} ${c.last_name}` },
            { header: 'Phone', cell: (c) => c.phone_number },
            { header: 'Address', cell: (c) => c.address },
          ]}
          renderCard={(c) => (
            <>
              <p className="font-medium text-slate-800">{c.first_name} {c.last_name}</p>
              <p className="mt-0.5 text-sm text-slate-500">{c.phone_number}</p>
              <p className="mt-0.5 text-sm text-slate-500 break-words">{c.address}</p>
            </>
          )}
          actions={(c) => (
            <>
              <EditButton onClick={() => mgr.openEdit(c)} />
              <DeleteButton onClick={() => mgr.askDelete(c.id, `${c.first_name} ${c.last_name}`)} />
            </>
          )}
        />
      </ManagerShell>

      {mgr.open && (
        <Modal title={mgr.editingId ? 'Edit customer' : 'Add customer'} onClose={mgr.close}>
          <form onSubmit={mgr.submit} noValidate className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField label="First name" name="first_name" value={mgr.draft.first_name} onChange={(e) => mgr.set('first_name', e.target.value)} error={mgr.errors.first_name} required />
              <TextField label="Last name" name="last_name" value={mgr.draft.last_name} onChange={(e) => mgr.set('last_name', e.target.value)} error={mgr.errors.last_name} required />
              <TextField label="Phone number" name="phone_number" value={mgr.draft.phone_number} onChange={(e) => mgr.set('phone_number', e.target.value)} error={mgr.errors.phone_number} placeholder="+1..." required />
              <TextField label="Address" name="address" value={mgr.draft.address} onChange={(e) => mgr.set('address', e.target.value)} error={mgr.errors.address} required />
            </div>
            {mgr.saveError && (
              <p role="alert" className="text-sm text-rose-600">{mgr.saveError}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={mgr.close}>Cancel</Button>
              <Button type="submit" disabled={mgr.saving || !mgr.dirty}>
                {mgr.editingId ? 'Save changes' : 'Add customer'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {mgr.pendingDelete && (
        <ConfirmDialog
          title="Delete customer"
          message={`Delete ${mgr.pendingDelete.label}? This also permanently deletes all of their shipments and packages. This can't be undone.`}
          pending={mgr.deleting}
          error={mgr.deleteError}
          onCancel={mgr.cancelDelete}
          onConfirm={mgr.confirmDelete}
        />
      )}
    </>
  )
}
