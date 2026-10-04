import { useEffect, useMemo, useState } from 'react'
import { sampleClosedProfile, solveSketchConstraints, type ModelNode } from '@formforge/model'
import {SketchCanvas,type SketchPick} from './SketchCanvas'
import {NumberInput} from './NumberInput'
import {resizeSketchEdge} from '@/lib/sketchPrecision'

type ProfilePoint = NonNullable<ModelNode['profile']>[number]
type ProfileSettings = NonNullable<ModelNode['profileSettings']>

export interface ProfileEditorProps {
  node: ModelNode
  unit: 'mm' | 'in'
  onUpdate: (patch: Partial<Omit<ModelNode, 'id' | 'createdAt'>>) => void
}

const defaultSettings: ProfileSettings = {
  curveMode: 'polyline',
  cornerRadius: 0,
  offset: 0,
  tension: 0.5,
  resolution: 8,
}

const curveOptions: readonly { mode: ProfileSettings['curveMode']; label: string; hint: string }[] = [
  { mode: 'polyline', label: 'Straight', hint: 'Exact lines between control points' },
  { mode: 'rounded', label: 'Rounded', hint: 'Radius-controlled corners' },
  { mode: 'spline', label: 'Smooth', hint: 'Flowing curve through every point' },
]

function settingsFor(node: ModelNode): ProfileSettings {
  return { ...defaultSettings, ...node.profileSettings }
}

function finite(value: string, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function profileErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'This outline cannot produce a safe closed profile.'
}

export function ProfileEditor({ node, onUpdate }: ProfileEditorProps) {
  const unit='mm'
  const [pick,setPick]=useState<SketchPick|null>(null)
  const [draftConstraints,setDraftConstraints]=useState(node.profileConstraints??[])
  const [draftPoints, setDraftPoints] = useState<ProfilePoint[]>(() => structuredClone(node.profile ?? []))
  const [draftSettings, setDraftSettings] = useState<ProfileSettings>(() => settingsFor(node))
  const [constraintsReset, setConstraintsReset] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setDraftPoints(structuredClone(node.profile ?? []))
    setDraftSettings(settingsFor(node))
    setConstraintsReset(false)
    setMessage(null)
    setPick(null);setDraftConstraints(node.profileConstraints??[])
  }, [node.id, node.profile, node.profileSettings, node.profileConstraints])

  const preview = useMemo(() => {
    try {
      const points = sampleClosedProfile(draftPoints, draftSettings)
      const displayPoints = points.map((point) => ({ x: point.x, y: -point.y }))
      const xs = displayPoints.map((point) => point.x)
      const ys = displayPoints.map((point) => point.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      const span = Math.max(maxX - minX, maxY - minY, 1)
      const padding = span * 0.12
      return {
        points: displayPoints,
        path: `${displayPoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')} Z`,
        viewBox: `${minX - padding} ${minY - padding} ${Math.max(maxX - minX, 1) + padding * 2} ${Math.max(maxY - minY, 1) + padding * 2}`,
        error: null,
      }
    } catch (error) {
      return { points: [], path: '', viewBox: '0 0 100 100', error: profileErrorMessage(error) }
    }
  }, [draftPoints, draftSettings])

  const dirty = JSON.stringify(draftPoints) !== JSON.stringify(node.profile ?? [])
    || JSON.stringify(draftSettings) !== JSON.stringify(settingsFor(node))
    || constraintsReset
    || JSON.stringify(draftConstraints)!==JSON.stringify(node.profileConstraints??[])

  const updatePoint = (index: number, axis: 'x' | 'y', value: string) => {
    setDraftPoints((points) => points.map((point, pointIndex) => pointIndex === index
      ? { ...point, [axis]: finite(value, point[axis]) }
      : point))
    setMessage(null)
  }

  const insertPointAfter = (index: number) => {
    setPick(null);setDraftConstraints([])
    setDraftPoints((points) => {
      if (points.length >= 1_024) return points
      const current = points[index]!
      const next = points[(index + 1) % points.length]!
      const copy = [...points]
      copy.splice(index + 1, 0, { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 })
      return copy
    })
    setConstraintsReset(true)
    setMessage('Point topology changed. Existing sketch constraints will be cleared when applied.')
  }

  const removePoint = (index: number) => {
    if (draftPoints.length <= 3) return
    setPick(null);setDraftConstraints([])
    setDraftPoints((points) => points.filter((_, pointIndex) => pointIndex !== index))
    setConstraintsReset(true)
    setMessage('Point topology changed. Existing sketch constraints will be cleared when applied.')
  }

  const centerPoints = () => {
    const center = draftPoints.reduce((sum, point) => ({
      x: sum.x + point.x / draftPoints.length,
      y: sum.y + point.y / draftPoints.length,
    }), { x: 0, y: 0 })
    setDraftPoints((points) => points.map((point) => ({ x: point.x - center.x, y: point.y - center.y })))
    setMessage(null)
  }

  const reversePoints = () => {
    setPick(null);setDraftConstraints([])
    setDraftPoints((points) => [...points].reverse())
    setConstraintsReset(true)
    setMessage('Point order changed. Existing sketch constraints will be cleared when applied.')
  }

  const resetDraft = () => {
    setPick(null);setDraftConstraints(node.profileConstraints??[])
    setDraftPoints(structuredClone(node.profile ?? []))
    setDraftSettings(settingsFor(node))
    setConstraintsReset(false)
    setMessage(null)
  }

  const apply = () => {
    try {
      const constraints = constraintsReset ? [] : draftConstraints
      const solved = solveSketchConstraints(draftPoints, constraints)
      if (solved.diagnostics.invalidConstraints.length) throw new Error('One or more sketch constraints reference a missing point or edge.')
      if(!solved.diagnostics.converged)throw new Error('The outline conflicts with its constraints. Adjust the outline or change the rules before applying.')
      sampleClosedProfile(solved.points, draftSettings)
      onUpdate({
        profile: solved.points,
        profileSettings: draftSettings,
        profileConstraints:constraints,
      })
      setDraftPoints(solved.points)
      setConstraintsReset(false)
      setMessage(solved.diagnostics.converged || constraints.length === 0
        ? 'Profile applied to the model.'
        : 'Profile applied. Some sketch constraints still need attention.')
    } catch (error) {
      setMessage(profileErrorMessage(error))
    }
  }

  if (!node.profile?.length) return null

  return (
    <section className="profile-editor" aria-label="Profile shape editor">
      <header className="profile-editor-heading">
        <div><strong>Shape the outline</strong><span>Choose a curve style, then fine-tune its control points.</span></div>
        <span>{preview.points.length || draftPoints.length} samples</span>
      </header>

      <div className="profile-editor-mode-grid" role="group" aria-label="Profile curve style">
        {curveOptions.map((option) => (
          <button
            type="button"
            key={option.mode}
            className={draftSettings.curveMode === option.mode ? 'active' : ''}
            aria-pressed={draftSettings.curveMode === option.mode}
            title={option.hint}
            onClick={() => setDraftSettings((settings) => ({ ...settings, curveMode: option.mode }))}
          >
            <strong>{option.label}</strong><small>{option.mode === 'polyline' ? 'Lines' : option.mode === 'rounded' ? 'Corners' : 'Spline'}</small>
          </button>
        ))}
      </div>

      <div className="profile-editor-settings">
        <label>
          <span>Outline offset</span>
          <div><input type="number" step="0.1" value={draftSettings.offset} onChange={(event) => setDraftSettings((settings) => ({ ...settings, offset: finite(event.target.value) }))} /><em>{unit}</em></div>
          <small>Positive grows outward; negative moves inward.</small>
        </label>
        {draftSettings.curveMode === 'rounded' && <label>
          <span>Corner radius</span>
          <div><input type="number" min="0" step="0.1" value={draftSettings.cornerRadius} onChange={(event) => setDraftSettings((settings) => ({ ...settings, cornerRadius: Math.max(0, finite(event.target.value)) }))} /><em>{unit}</em></div>
        </label>}
        {draftSettings.curveMode === 'spline' && <>
          <label>
            <span>Curve tension</span>
            <input type="range" min="0" max="1" step="0.05" value={draftSettings.tension} onChange={(event) => setDraftSettings((settings) => ({ ...settings, tension: finite(event.target.value, 0.5) }))} />
            <small>{draftSettings.tension.toFixed(2)} · lower is softer, higher is tighter</small>
          </label>
          <label>
            <span>Preview quality</span>
            <div><input type="number" min="1" max="64" step="1" value={draftSettings.resolution} onChange={(event) => setDraftSettings((settings) => ({ ...settings, resolution: Math.min(64, Math.max(1, Math.round(finite(event.target.value, 8)))) }))} /><em>steps</em></div>
          </label>
        </>}
      </div>

      <div className={`profile-editor-preview${preview.error ? ' invalid' : ''}`}>
        {preview.error&&<p role="alert">{preview.error}</p>}
        <SketchCanvas points={draftPoints} sampledPoints={preview.points.map(p=>({x:p.x,y:-p.y}))} selection={pick?[pick]:[]} onSelect={setPick} disabled={node.locked}/>
      </div>
      {pick&&draftPoints[pick.index]&&<div className="sketch-picked-fields"><strong>{pick.kind==='point'?'Point':'Edge'} {pick.index+1}</strong>{pick.kind==='point'?<div className="size-fields">{(['x','y'] as const).map(axis=><NumberInput key={`${pick.index}-${axis}`} label={`Selected point ${axis.toUpperCase()}`} suffix="mm" value={draftPoints[pick.index]![axis]} onChange={value=>updatePoint(pick.index,axis,String(value))}/>)}</div>:<NumberInput label="Selected edge length" suffix="mm" min={0.001} value={Math.hypot(draftPoints[pick.index]!.x-draftPoints[(pick.index+1)%draftPoints.length]!.x,draftPoints[pick.index]!.y-draftPoints[(pick.index+1)%draftPoints.length]!.y)} onChange={length=>{try{const resized=resizeSketchEdge(draftPoints,pick.index,length,constraintsReset?[]:draftConstraints);sampleClosedProfile(resized.points,draftSettings);setDraftPoints(resized.points);setDraftConstraints(resized.constraints);setConstraintsReset(false);setMessage('Length previewed. Apply profile to keep the dimension rule.')}catch(e){setMessage(profileErrorMessage(e))}}}/>}</div>}

      <details className="profile-editor-points">
        <summary><span><strong>Control points</strong><small>{draftPoints.length} editable points</small></span></summary>
        <div className="profile-editor-point-list">
          {draftPoints.map((point, index) => <div className="profile-editor-point-row" key={index}>
            <span>{index + 1}</span>
            <label><em>X</em><input aria-label={`Point ${index + 1} X`} type="number" step="0.1" value={point.x} onChange={(event) => updatePoint(index, 'x', event.target.value)} /></label>
            <label><em>Y</em><input aria-label={`Point ${index + 1} Y`} type="number" step="0.1" value={point.y} onChange={(event) => updatePoint(index, 'y', event.target.value)} /></label>
            <button type="button" title={`Insert a point after point ${index + 1}`} onClick={() => insertPointAfter(index)}>+</button>
            <button type="button" title={`Delete point ${index + 1}`} disabled={draftPoints.length <= 3} onClick={() => removePoint(index)}>−</button>
          </div>)}
        </div>
        <div className="profile-editor-point-actions">
          <button type="button" onClick={centerPoints}>Center points</button>
          <button type="button" onClick={reversePoints}>Reverse order</button>
        </div>
      </details>

      {(message || constraintsReset) && <p className={preview.error ? 'profile-editor-message error' : 'profile-editor-message'} aria-live="polite">{message}</p>}
      <footer className="profile-editor-actions">
        <button type="button" disabled={!dirty} onClick={resetDraft}>Reset</button>
        <button type="button" className="primary" disabled={!dirty || Boolean(preview.error)} onClick={apply}>Apply profile</button>
      </footer>
      <small className="profile-editor-rebuild-note">Changes preview here instantly. The printable model rebuilds only when you apply.</small>
    </section>
  )
}

export default ProfileEditor
