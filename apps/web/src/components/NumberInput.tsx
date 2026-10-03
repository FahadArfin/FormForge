import { useId, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { parseNumericExpression } from '@/lib/numericExpression'

type Props = { label: string; accessibleLabel?: string; value: number; onChange: (value: number) => void; suffix?: string; min?: number; max?: number; step?: number; disabled?: boolean; allowZero?: boolean }
const format = (value: number) => String(Number(value.toFixed(4)))

export function NumberInput({ label, accessibleLabel, value, onChange, suffix, min, max, step = 0.5, disabled, allowZero = true }: Props) {
  const [draft, setDraft] = useState(format(value))
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()
  const editing = useRef(false)
  const latest = useRef(value)
  const skipBlur = useRef(false)
  const [commitRevision, reconcile] = useReducer(value => value + 1, 0)
  latest.current = value
  useLayoutEffect(() => { if (!editing.current) setDraft(format(value)) }, [value, commitRevision])
  const commit = () => {
    editing.current = false
    if (skipBlur.current) { skipBlur.current = false; return }
    let parsed: number
    try {
      parsed = parseNumericExpression(draft, suffix)
      if (!allowZero && parsed === 0) throw new Error('This value cannot be zero.')
    } catch (cause) { setDraft(format(latest.current)); setError(cause instanceof Error ? cause.message : 'Check this value.'); return }
    setError(null)
    const next = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, parsed))
    setDraft(format(next))
    if (next !== latest.current) onChange(next)
    reconcile()
  }
  const dimensions: Record<string, string> = { W: 'Width', D: 'Depth', H: 'Height', R: 'Radius', 'Base W': 'Base width', 'Base D': 'Base depth', 'Top W': 'Top width', 'Top D': 'Top depth', 'Coil R': 'Coil radius', 'Wire R': 'Wire radius', Outer: 'Outer radius', Root: 'Root radius', Top: 'Top radius', Inner: 'Inner radius', Minor: 'Minor radius' }
  const name = accessibleLabel ?? dimensions[label] ?? label
  return <label className="number-field"><span>{label}</span><div><input
    aria-label={`${name}${suffix ? ` (${suffix === 'mm' ? 'millimeters' : suffix === '°' ? 'degrees' : suffix})` : ''}`}
    type="text" inputMode="text" value={draft} disabled={disabled} maxLength={256}
    title={suffix === 'mm' ? 'Millimeters. Also accepts 1/2 in, 2 cm, or 25.4 / 2.' : 'Accepts arithmetic, such as 90 / 2. Enter to apply; Escape to cancel.'}
    aria-invalid={!!error} aria-describedby={error ? errorId : undefined}
    onFocus={() => { editing.current = true }} onChange={event => { editing.current = true; setError(null); setDraft(event.target.value) }} onBlur={commit}
    onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); skipBlur.current = true; setError(null); setDraft(format(latest.current)); event.currentTarget.blur() }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); try { const current = parseNumericExpression(draft, suffix); setDraft(format(current + (event.key === 'ArrowUp' ? step : -step))) } catch { /* Keep the editable draft. */ } }
    }} />{suffix && <em>{suffix}</em>}</div>{error && <small id={errorId} role="alert" style={{ color: 'var(--danger, #dc6262)', display: 'block', lineHeight: 1.4 }}>{error}</small>}</label>
}
