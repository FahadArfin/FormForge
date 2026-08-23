import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  label: string
  active?: boolean
  compact?: boolean
}

export function IconButton({ icon, label, active, compact, className = '', ...props }: IconButtonProps) {
  return (
    <button className={`icon-button ${active ? 'is-active' : ''} ${compact ? 'is-compact' : ''} ${className}`} title={label} aria-label={label} {...props}>
      {icon}
      {!compact && <span>{label}</span>}
    </button>
  )
}
