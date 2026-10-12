import { type ReactNode } from 'react'

export const inputClass =
  'w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm outline-none transition focus:ring-2 focus:border-violet-500 focus:ring-violet-100'
export const btnPrimary =
  'px-3 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-semibold cursor-pointer hover:bg-violet-700 disabled:opacity-50 disabled:cursor-default transition'
export const btnGhost =
  'px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-sm cursor-pointer hover:bg-slate-50 transition'
export const btnDanger =
  'px-2.5 py-1 rounded-lg text-rose-600 text-sm cursor-pointer hover:bg-rose-50 transition'
export const btnDangerSolid =
  'px-3 py-1.5 rounded-lg bg-rose-600 text-white text-sm font-semibold cursor-pointer hover:bg-rose-700 disabled:opacity-50 disabled:cursor-default transition'
export const th =
  'text-left font-semibold text-slate-500 px-3 py-2 bg-slate-50 border-b border-slate-200'
export const td = 'px-3 py-2 text-slate-700 align-top'
export const card = 'rounded-xl border border-slate-200 bg-white p-4'
export const tableCard = 'hidden md:block rounded-xl border border-slate-200 bg-white'

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

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600">{label}</span>
      {children}
    </label>
  )
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl ring-1 ring-slate-200"
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
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel?: string
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-slate-600">{message}</p>
      <div className="flex justify-end gap-2 pt-5">
        <button type="button" className={btnGhost} onClick={onCancel}>Cancel</button>
        <button type="button" className={btnDangerSolid} onClick={onConfirm} disabled={pending}>
          {confirmLabel}
        </button>
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
  const forbidden =
    !!error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status?: number }).status === 403
  const errorMessage = forbidden
    ? 'Your account is not authorized for admin access. Ask the owner to add your Auth0 user id to AUTH0_ADMIN_SUBS.'
    : "Couldn't load data. Make sure you're signed in as an admin."
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
          <button
            type="button"
            className={`${btnPrimary} shrink-0 whitespace-nowrap`}
            onClick={onAdd}
          >
            {addLabel}
          </button>
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
