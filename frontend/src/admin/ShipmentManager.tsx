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
import { ManagerShell, Modal, ConfirmDialog, StatusBadge, EditButton, DeleteButton } from './widgets'
import { Button } from '../ui/Button'
import { TextField, SelectField } from '../ui/FormField'
import { DataTable } from '../ui/DataTable'
import { useCrudManager } from './useCrudManager'

interface Draft {
  customer_id: string
  tracking_number: string
  status: ShipmentStatus
  carrier: string
  origin: string
  destination: string
  estimated_delivery: string
}

const EMPTY: Draft = {
  customer_id: '',
  tracking_number: '',
  status: ShipmentStatus.in_transit,
  carrier: '',
  origin: '',
  destination: '',
  estimated_delivery: '',
}

const blankDraft = (): Draft => ({ ...EMPTY })

const fmtUpdated = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export default function ShipmentManager() {
  const qc = useQueryClient()
  const { isAuthenticated } = useAuth0()
  const invalidate = () => qc.invalidateQueries({ queryKey: getListShipmentsQueryKey() })
  const list = useListShipments({ query: { enabled: isAuthenticated } })
  const create = useCreateShipment({ mutation: { onSuccess: invalidate } })
  const update = useUpdateShipment({ mutation: { onSuccess: invalidate } })
  const remove = useDeleteShipment({ mutation: { onSuccess: invalidate } })

  const mgr = useCrudManager<ShipmentRead, Draft>({
    empty: blankDraft,
    rowId: (s) => s.id,
    toDraft: (s) => ({
      customer_id: s.customer_id,
      tracking_number: s.tracking_number,
      status: s.status,
      carrier: s.carrier,
      origin: s.origin,
      destination: s.destination,
      estimated_delivery: s.estimated_delivery,
    }),
    searchText: (s) => `${s.tracking_number} ${s.status} ${s.carrier} ${s.origin} ${s.destination}`,
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
        update.mutate({ shipmentId: editingId, data: draft }, { onSuccess: done })
      } else {
        const data = { ...draft, last_update: new Date().toISOString() }
        create.mutate({ data }, { onSuccess: done })
      }
    },
    onDelete: ({ id, done }) => remove.mutate({ shipmentId: id }, { onSuccess: done }),
  })

  const rows = mgr.filterRows(list.data?.data ?? [])

  return (
    <>
      <ManagerShell title="Shipments" addLabel="+ Add shipment" onAdd={mgr.openCreate} search={mgr.q} onSearch={mgr.setQ} isLoading={list.isLoading} isError={list.isError} error={list.error}>
        <DataTable
          rows={rows}
          getRowKey={(s) => s.id}
          emptyText={mgr.term ? 'No matches.' : 'No shipments yet.'}
          columns={[
            { header: 'Tracking', cell: (s) => s.tracking_number, className: 'font-mono text-xs' },
            { header: 'Status', cell: (s) => <StatusBadge status={s.status} /> },
            { header: 'Carrier', cell: (s) => s.carrier },
            { header: 'Route', cell: (s) => <>{s.origin} &rarr; {s.destination}</> },
            { header: 'ETA', cell: (s) => s.estimated_delivery },
            { header: 'Last update', cell: (s) => fmtUpdated(s.last_update) },
          ]}
          renderCard={(s) => (
            <>
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
                <dt className="text-slate-400">Last update</dt>
                <dd className="text-slate-700">{fmtUpdated(s.last_update)}</dd>
              </dl>
            </>
          )}
          actions={(s) => (
            <>
              <EditButton onClick={() => mgr.openEdit(s)} />
              <DeleteButton onClick={() => mgr.askDelete(s.id, s.tracking_number)} />
            </>
          )}
        />
      </ManagerShell>

      {mgr.open && (
        <Modal title={mgr.editingId ? 'Edit shipment' : 'Add shipment'} onClose={mgr.close}>
          <form onSubmit={mgr.submit} noValidate className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField label="Customer ID" name="customer_id" value={mgr.draft.customer_id} onChange={(e) => mgr.set('customer_id', e.target.value)} error={mgr.errors.customer_id} placeholder="uuid" required />
              <TextField label="Tracking number" name="tracking_number" value={mgr.draft.tracking_number} onChange={(e) => mgr.set('tracking_number', e.target.value)} error={mgr.errors.tracking_number} required pattern="MX[0-9]{12}" maxLength={14} title="MX followed by 12 digits, e.g. MX012345678901" placeholder="MX012345678901" />
              <SelectField
                label="Status"
                name="status"
                value={mgr.draft.status}
                onChange={(e) => mgr.set('status', e.target.value)}
                options={Object.values(ShipmentStatus).map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))}
                required
              />
              <TextField label="Carrier" name="carrier" value={mgr.draft.carrier} onChange={(e) => mgr.set('carrier', e.target.value)} error={mgr.errors.carrier} required />
              <TextField label="Origin" name="origin" value={mgr.draft.origin} onChange={(e) => mgr.set('origin', e.target.value)} error={mgr.errors.origin} required />
              <TextField label="Destination" name="destination" value={mgr.draft.destination} onChange={(e) => mgr.set('destination', e.target.value)} error={mgr.errors.destination} required />
              <TextField label="Estimated delivery" name="estimated_delivery" type="date" value={mgr.draft.estimated_delivery} onChange={(e) => mgr.set('estimated_delivery', e.target.value)} error={mgr.errors.estimated_delivery} required />
            </div>
            {mgr.saveError && (
              <p role="alert" className="text-sm text-rose-600">{mgr.saveError}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={mgr.close}>Cancel</Button>
              <Button type="submit" disabled={mgr.saving || !mgr.dirty}>
                {mgr.editingId ? 'Save changes' : 'Add shipment'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {mgr.pendingDelete && (
        <ConfirmDialog
          title="Delete shipment"
          message={`Delete shipment ${mgr.pendingDelete.label}? This also permanently deletes its packages. This can't be undone.`}
          pending={mgr.deleting}
          error={mgr.deleteError}
          onCancel={mgr.cancelDelete}
          onConfirm={mgr.confirmDelete}
        />
      )}
    </>
  )
}
