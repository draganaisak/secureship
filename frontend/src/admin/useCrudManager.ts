import { useState, type FormEvent } from 'react'
import { describeAdminError } from './errors'

interface PendingDelete {
  id: string
  label: string
}

interface CrudConfig<Entity, Draft> {
  empty: Draft | (() => Draft)
  toDraft: (entity: Entity) => Draft
  rowId: (entity: Entity) => string
  searchText: (entity: Entity) => string
  saving: boolean
  deleting: boolean
  saveError?: unknown
  deleteError?: unknown
  resetErrors?: () => void
  onSubmit: (args: { editingId: string | null; draft: Draft; done: () => void }) => void
  onDelete: (args: { id: string; done: () => void }) => void
}

function draftsDiffer<Draft>(a: Draft, b: Draft): boolean {
  return (Object.keys(a as object) as (keyof Draft)[]).some((k) => a[k] !== b[k])
}

// Owns the state machine shared by every admin manager (add/edit modal, delete
// confirmation, search). The entity-specific bits - the generated query/mutation
// hooks and the create/update/delete payloads - stay in each manager and arrive
// here as `onSubmit` / `onDelete`.
export function useCrudManager<Entity, Draft>(config: CrudConfig<Entity, Draft>) {
  const blank = () =>
    typeof config.empty === 'function' ? (config.empty as () => Draft)() : config.empty

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(blank)
  const [initialDraft, setInitialDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [q, setQ] = useState('')

  const term = q.trim().toLowerCase()
  const set = (k: keyof Draft, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }) as Draft)
    setErrors((e) => {
      if (!(k in e)) return e
      const rest = { ...e }
      delete rest[k as string]
      return rest
    })
  }

  const openCreate = () => {
    config.resetErrors?.()
    setEditingId(null)
    setDraft(blank())
    setInitialDraft(null)
    setErrors({})
    setOpen(true)
  }
  const openEdit = (entity: Entity) => {
    config.resetErrors?.()
    const d = config.toDraft(entity)
    setEditingId(config.rowId(entity))
    setDraft(d)
    setInitialDraft(d)
    setErrors({})
    setOpen(true)
  }
  const close = () => {
    config.resetErrors?.()
    setOpen(false)
    setEditingId(null)
    setDraft(blank())
    setInitialDraft(null)
    setErrors({})
  }

  // In edit mode the Save button stays disabled until a field actually differs
  // from the row as it was opened; create mode has no baseline, so always dirty.
  const dirty = initialDraft === null || draftsDiffer(draft, initialDraft)

  // Collect the browser's own constraint messages (required, pattern, ...) into
  // per-field errors keyed by input `name`, so we can render them inline in our
  // styling instead of the native bubble. The form must set `noValidate`.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const found: Record<string, string> = {}
    let firstBad: HTMLElement | null = null
    for (const el of Array.from(e.currentTarget.elements)) {
      const field = el as HTMLInputElement | HTMLSelectElement
      if (field.name && typeof field.checkValidity === 'function' && !field.checkValidity()) {
        found[field.name] = field.validationMessage
        if (!firstBad) firstBad = field
      }
    }
    if (firstBad) {
      setErrors(found)
      firstBad.focus()
      return
    }
    setErrors({})
    config.onSubmit({ editingId, draft, done: close })
  }

  const askDelete = (id: string, label: string) => {
    config.resetErrors?.()
    setPendingDelete({ id, label })
  }
  const cancelDelete = () => {
    config.resetErrors?.()
    setPendingDelete(null)
  }
  const confirmDelete = () => {
    if (pendingDelete) config.onDelete({ id: pendingDelete.id, done: () => setPendingDelete(null) })
  }

  const saveError = config.saveError ? describeAdminError(config.saveError, 'save') : null
  const deleteError = config.deleteError ? describeAdminError(config.deleteError, 'delete') : null

  const filterRows = (rows: Entity[]) =>
    rows.filter((e) => !term || config.searchText(e).toLowerCase().includes(term))

  return {
    open,
    editingId,
    draft,
    dirty,
    errors,
    saveError,
    deleteError,
    set,
    openCreate,
    openEdit,
    close,
    submit,
    saving: config.saving,
    pendingDelete,
    askDelete,
    cancelDelete,
    confirmDelete,
    deleting: config.deleting,
    q,
    setQ,
    term,
    filterRows,
  }
}
