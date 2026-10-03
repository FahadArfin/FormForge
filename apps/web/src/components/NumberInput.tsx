import { useLayoutEffect, useReducer, useRef, useState } from 'react'

type Props = { label: string; accessibleLabel?: string; value: number; onChange: (value: number) => void; suffix?: string; min?: number; max?: number; step?: number; disabled?: boolean; allowZero?: boolean }
const format = (value: number) => String(Number(value.toFixed(4)))

export function NumberInput({ label, accessibleLabel, value, onChange, suffix, min, max, step = 0.5, disabled, allowZero = true }: Props) {
  const [draft, setDraft] = useState(format(value))
  const editing = useRef(false)
  const latest = useRef(value)
  const skipBlur = useRef(false)
  const [commitRevision, reconcile] = useReducer(value => value + 1, 0)
  latest.current = value
  useLayoutEffect(() => { if (!editing.current) setDraft(format(value)) }, [value, commitRevision])
  const commit = () => {
    editing.current = false
    if (skipBlur.current) { skipBlur.current = false; return }
    const parsed = draft.trim() ? Number(draft) : NaN
    if (!Number.isFinite(parsed) || (!allowZero && parsed === 0)) { setDraft(format(latest.current)); return }
    const next = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, parsed))
    setDraft(format(next))
    if (next !== latest.current) onChange(next)
    reconcile()
  }
  const dimensions: Record<string, string> = { W: 'Width', D: 'Depth', H: 'Height', R: 'Radius', 'Base W': 'Base width', 'Base D': 'Base depth', 'Top W': 'Top width', 'Top D': 'Top depth', 'Coil R': 'Coil radius', 'Wire R': 'Wire radius', Outer: 'Outer radius', Root: 'Root radius', Top: 'Top radius', Inner: 'Inner radius', Minor: 'Minor radius' }
  const name = accessibleLabel ?? dimensions[label] ?? label
  return <label className="number-field"><span>{label}</span><div><input
    aria-label={`${name}${suffix ? ` (${suffix === 'mm' ? 'millimeters' : suffix === '°' ? 'degrees' : suffix})` : ''}`}
    type="text" inputMode="decimal" value={draft} disabled={disabled}
    onFocus={() => { editing.current = true }} onChange={event => { editing.current = true; setDraft(event.target.value) }} onBlur={commit}
    onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); skipBlur.current = true; setDraft(format(latest.current)); event.currentTarget.blur() }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); const current = Number(draft); if (Number.isFinite(current)) setDraft(format(current + (event.key === 'ArrowUp' ? step : -step))) }
    }} />{suffix && <em>{suffix}</em>}</div></label>
}
