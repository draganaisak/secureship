import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-violet-600 text-white font-semibold hover:bg-violet-700',
  ghost: 'border border-slate-300 text-slate-700 hover:bg-slate-50',
  danger: 'bg-rose-600 text-white font-semibold hover:bg-rose-700',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({
  variant = 'primary',
  type = 'button',
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer transition disabled:opacity-50 disabled:cursor-default ${variants[variant]} ${className}`}
      {...rest}
    />
  )
}
