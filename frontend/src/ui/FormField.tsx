import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes } from 'react'

export const inputClass =
  'w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm outline-none transition focus:ring-2 focus:border-violet-500 focus:ring-violet-100'

const errorRing = 'border-rose-400 focus:border-rose-500 focus:ring-rose-100'

export function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  )
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export function TextField({ label, error, className = '', required, ...rest }: TextFieldProps) {
  return (
    <Field label={label} required={required}>
      <input
        required={required}
        aria-invalid={error ? true : undefined}
        className={`${inputClass} ${error ? errorRing : ''} ${className}`}
        {...rest}
      />
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </Field>
  )
}

interface Option {
  value: string
  label: string
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  options: Option[]
  error?: string
}

export function SelectField({
  label,
  options,
  error,
  className = '',
  required,
  ...rest
}: SelectFieldProps) {
  return (
    <Field label={label} required={required}>
      <select
        required={required}
        aria-invalid={error ? true : undefined}
        className={`${inputClass} ${error ? errorRing : ''} ${className}`}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </Field>
  )
}
