import type { ReactNode } from 'react'

const th =
  'text-left font-semibold text-slate-500 px-3 py-2 bg-slate-50 border-b border-slate-200'
const td = 'px-3 py-2 text-slate-700 align-top'
const card = 'rounded-xl border border-slate-200 bg-white p-4'
const tableCard = 'hidden md:block rounded-xl border border-slate-200 bg-white'

export interface Column<Row> {
  header: ReactNode
  cell: (row: Row) => ReactNode
  className?: string
}

interface DataTableProps<Row> {
  rows: Row[]
  columns: Column<Row>[]
  getRowKey: (row: Row) => string
  renderCard: (row: Row) => ReactNode
  emptyText: string
  actions?: (row: Row) => ReactNode
}

// Responsive collection: stacked cards on mobile, a table on md+. Owns the
// breakpoint split, the sticky header, the empty state, and the shared edit/delete
// actions column so each manager only declares its columns and card body.
export function DataTable<Row>({
  rows,
  columns,
  getRowKey,
  renderCard,
  emptyText,
  actions,
}: DataTableProps<Row>) {
  const colSpan = columns.length + (actions ? 1 : 0)

  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li key={getRowKey(row)} className={card}>
            {renderCard(row)}
            {actions && (
              <div className="mt-3 flex justify-end gap-1">{actions(row)}</div>
            )}
          </li>
        ))}
        {rows.length === 0 && (
          <li className={`${card} text-sm text-slate-400`}>{emptyText}</li>
        )}
      </ul>

      <div className={tableCard}>
        <table className="w-full text-sm">
          <thead className="sticky top-14 z-10">
            <tr>
              {columns.map((c, i) => (
                <th key={i} className={th}>
                  {c.header}
                </th>
              ))}
              {actions && <th className={th}></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getRowKey(row)} className="border-b border-slate-100 last:border-0">
                {columns.map((c, i) => (
                  <td key={i} className={c.className ? `${td} ${c.className}` : td}>
                    {c.cell(row)}
                  </td>
                ))}
                {actions && (
                  <td className={`${td} whitespace-nowrap text-right`}>
                    <div className="flex justify-end gap-1">{actions(row)}</div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className={`${td} text-slate-400`} colSpan={colSpan}>
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
