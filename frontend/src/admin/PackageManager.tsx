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
import { ManagerShell, Modal, ConfirmDialog, EditButton, DeleteButton } from './widgets'
import { Button } from '../ui/Button'
import { TextField } from '../ui/FormField'
import { DataTable } from '../ui/DataTable'
import { useCrudManager } from './useCrudManager'

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

  const mgr = useCrudManager<PackageRead, Draft>({
    empty: EMPTY,
    rowId: (p) => p.id,
    toDraft: (p) => ({
      shipment_id: p.shipment_id,
      description: p.description,
      weight_kg: String(p.weight_kg),
      declared_value: String(p.declared_value),
    }),
    searchText: (p) => `${p.description} ${p.shipment_id}`,
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
        update.mutate({ packageId: editingId, data: draft }, { onSuccess: done })
      } else {
        create.mutate({ data: draft }, { onSuccess: done })
      }
    },
    onDelete: ({ id, done }) => remove.mutate({ packageId: id }, { onSuccess: done }),
  })

  const rows = mgr.filterRows(list.data?.data ?? [])

  return (
    <>
      <ManagerShell title="Packages" addLabel="+ Add package" onAdd={mgr.openCreate} search={mgr.q} onSearch={mgr.setQ} isLoading={list.isLoading} isError={list.isError} error={list.error}>
        <DataTable
          rows={rows}
          getRowKey={(p) => p.id}
          emptyText={mgr.term ? 'No matches.' : 'No packages yet.'}
          columns={[
            { header: 'Description', cell: (p) => p.description },
            { header: 'Weight (kg)', cell: (p) => p.weight_kg },
            { header: 'Declared value', cell: (p) => p.declared_value },
            { header: 'Shipment', cell: (p) => p.shipment_id, className: 'font-mono text-xs' },
          ]}
          renderCard={(p) => (
            <>
              <p className="font-medium break-words text-slate-800">{p.description}</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-slate-400">Weight</dt>
                <dd className="text-slate-700">{p.weight_kg} kg</dd>
                <dt className="text-slate-400">Declared</dt>
                <dd className="text-slate-700">{p.declared_value}</dd>
                <dt className="text-slate-400">Shipment</dt>
                <dd className="font-mono text-xs break-all text-slate-700">{p.shipment_id}</dd>
              </dl>
            </>
          )}
          actions={(p) => (
            <>
              <EditButton onClick={() => mgr.openEdit(p)} />
              <DeleteButton onClick={() => mgr.askDelete(p.id, p.description)} />
            </>
          )}
        />
      </ManagerShell>

      {mgr.open && (
        <Modal title={mgr.editingId ? 'Edit package' : 'Add package'} onClose={mgr.close}>
          <form onSubmit={mgr.submit} noValidate className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField label="Shipment ID" name="shipment_id" value={mgr.draft.shipment_id} onChange={(e) => mgr.set('shipment_id', e.target.value)} error={mgr.errors.shipment_id} placeholder="uuid" required />
              <TextField label="Description" name="description" value={mgr.draft.description} onChange={(e) => mgr.set('description', e.target.value)} error={mgr.errors.description} required />
              <TextField label="Weight (kg)" name="weight_kg" type="number" step="0.01" min="0" value={mgr.draft.weight_kg} onChange={(e) => mgr.set('weight_kg', e.target.value)} error={mgr.errors.weight_kg} required />
              <TextField label="Declared value" name="declared_value" type="number" step="0.01" min="0" value={mgr.draft.declared_value} onChange={(e) => mgr.set('declared_value', e.target.value)} error={mgr.errors.declared_value} required />
            </div>
            {mgr.saveError && (
              <p role="alert" className="text-sm text-rose-600">{mgr.saveError}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={mgr.close}>Cancel</Button>
              <Button type="submit" disabled={mgr.saving || !mgr.dirty}>
                {mgr.editingId ? 'Save changes' : 'Add package'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {mgr.pendingDelete && (
        <ConfirmDialog
          title="Delete package"
          message={`Delete package "${mgr.pendingDelete.label}"? This can't be undone.`}
          pending={mgr.deleting}
          error={mgr.deleteError}
          onCancel={mgr.cancelDelete}
          onConfirm={mgr.confirmDelete}
        />
      )}
    </>
  )
}
