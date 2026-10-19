import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '../ui/Button'
import { describeAdminError } from './errors'

const statusStyles: Record<string, string> = {
  label_created: 'bg-slate-100 text-slate-600',
  in_transit: 'bg-blue-50 text-blue-700',
  out_for_delivery: 'bg-amber-50 text-amber-700',
  delivered: 'bg-emerald-50 text-emerald-700',
  exception: 'bg-rose-50 text-rose-700',
}

export function StatusBadge({ status }: { status: string }) {
  const cls = statusStyles[status] ?? 'bg-slate-100 text-slate-600'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

const rowIconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'w-4 h-4',
}

const iconBtn =
  'inline-flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition'

export function EditButton({ onClick, label = 'Edit' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`${iconBtn} text-slate-500 hover:bg-slate-100 hover:text-slate-800`}
    >
      <svg {...rowIconProps}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
      </svg>
    </button>
  )
}

export function DeleteButton({
  onClick,
  label = 'Delete',
}: {
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`${iconBtn} text-rose-500 hover:bg-rose-50 hover:text-rose-700`}
    >
      <svg {...rowIconProps}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    </button>
  )
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  // onClose may be a fresh closure each render; keep it in a ref so the main
  // effect runs once (focus-on-open / restore-on-close), not on every re-render.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const prevFocused = document.activeElement as HTMLElement | null
    dialog.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    dialog.addEventListener('keydown', onKeyDown)
    return () => {
      dialog.removeEventListener('keydown', onKeyDown)
      prevFocused?.focus?.()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 outline-none"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-2xl leading-none text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            &times;
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel?: string
  pending: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-slate-600">{message}</p>
      {error && (
        <p role="alert" className="pt-3 text-sm text-rose-600">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-5">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} disabled={pending}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

export function ManagerShell({
  title,
  addLabel,
  onAdd,
  search,
  onSearch,
  isLoading,
  isError,
  error,
  children,
}: {
  title: string
  addLabel: string
  onAdd: () => void
  search: string
  onSearch: (value: string) => void
  isLoading: boolean
  isError: boolean
  error?: unknown
  children: ReactNode
}) {
  const errorMessage = describeAdminError(error, 'load')
  return (
    <section className="flex flex-col">
      <div className="sticky top-0 z-20 bg-slate-100 py-2 sm:flex sm:h-14 sm:items-center sm:justify-between sm:gap-3 sm:py-0">
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        <div className="mt-2 flex items-center gap-2 sm:mt-0">
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search..."
            className="min-w-0 flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm outline-none transition focus:ring-2 focus:border-violet-500 focus:ring-violet-100 sm:w-56 sm:flex-none"
          />
          <Button className="shrink-0 whitespace-nowrap" onClick={onAdd}>
            {addLabel}
          </Button>
        </div>
      </div>
      {isError && (
        <p role="alert" className="pb-3 text-sm text-rose-700">
          {errorMessage}
        </p>
      )}
      {isLoading ? <p className="text-sm text-slate-400">Loading...</p> : children}
    </section>
  )
}
