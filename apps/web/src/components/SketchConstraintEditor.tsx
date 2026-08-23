import { AlertTriangle, CheckCircle2, Plus, Trash2, WandSparkles } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import {
  normalizeSketchAngleDegrees,
  solveSketchConstraints,
  type ModelNode,
  type SketchConstraint,
  type SketchSolveResult,
} from '@formforge/model'

export type SketchConstraintPatch = Pick<ModelNode, 'profile' | 'profileConstraints'>

export interface SketchConstraintEditorProps {
  node: ModelNode
  onUpdate: (patch: SketchConstraintPatch) => void
  unit?: string
}

type ConstraintType = SketchConstraint['type']

interface SolveAttempt {
  result: SketchSolveResult | null
  error: string | null
}

const TYPE_LABELS: Record<ConstraintType, string> = {
  horizontal: 'Make edge horizontal',
  vertical: 'Make edge vertical',
  distance: 'Set distance',
  equal: 'Make two edges equal',
  coincident: 'Join two points',
  parallel: 'Make two edges parallel',
  perpendicular: 'Make two edges perpendicular',
  angle: 'Set a directed angle',
}

function usesSegments(type: ConstraintType) {
  return type === 'equal' || type === 'parallel' || type === 'perpendicular' || type === 'angle'
}

function solveSafely(
  profile: NonNullable<ModelNode['profile']>,
  constraints: readonly SketchConstraint[],
): SolveAttempt {
  try {
    return { result: solveSketchConstraints(profile, constraints), error: null }
  } catch (error) {
    return {
      result: null,
      error: error instanceof Error ? error.message : 'The sketch could not be solved.',
    }
  }
}

function isSameConstraint(first: SketchConstraint, second: SketchConstraint) {
  if (first.type !== second.type) return false
  if (first.type === 'angle') {
    return first.a === second.a
      && first.b === second.b
      && normalizeSketchAngleDegrees(first.value ?? 0) === normalizeSketchAngleDegrees(second.value ?? 0)
  }
  const sameReferences = (first.a === second.a && first.b === second.b)
    || (first.a === second.b && first.b === second.a)
  if (!sameReferences) return false
  if (first.type !== 'distance') return true
  return first.value === second.value
}

function pointLabel(index: number, profile: NonNullable<ModelNode['profile']>) {
  const point = profile[index]
  if (!point) return `Point ${index + 1} (missing)`
  return `Point ${index + 1} (${point.x.toFixed(1)}, ${point.y.toFixed(1)})`
}

function edgeLabel(index: number, pointCount: number) {
  return `Edge ${index + 1} (P${index + 1} → P${(index + 1) % pointCount + 1})`
}

function describeConstraint(constraint: SketchConstraint, unit: string) {
  if (constraint.type === 'equal') return `Edge ${constraint.a + 1} equals edge ${constraint.b + 1}`
  if (constraint.type === 'parallel') return `Edge ${constraint.a + 1} parallel to edge ${constraint.b + 1}`
  if (constraint.type === 'perpendicular') return `Edge ${constraint.a + 1} perpendicular to edge ${constraint.b + 1}`
  if (constraint.type === 'angle') return `${constraint.value ?? '—'}° from edge ${constraint.a + 1} to edge ${constraint.b + 1}`
  if (constraint.type === 'coincident') return `Join point ${constraint.a + 1} to point ${constraint.b + 1}`
  const relation = constraint.type === 'horizontal'
    ? 'Horizontal'
    : constraint.type === 'vertical'
      ? 'Vertical'
      : `Distance ${constraint.value ?? '—'} ${unit}`
  return `${relation}: point ${constraint.a + 1} to point ${constraint.b + 1}`
}

function formatResidual(value: number, unit: string) {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return `0 ${unit}`
  if (value < 0.001) return `${value.toExponential(2)} ${unit}`
  return `${value.toFixed(4)} ${unit}`
}

function formatConstraintResidual(
  residual: { residual: number; unit: 'length' | 'degrees' },
  profileUnit: string,
) {
  return formatResidual(residual.residual, residual.unit === 'degrees' ? '°' : profileUnit)
}

function maximumResidualSummary(
  residuals: readonly { residual: number; unit: 'length' | 'degrees' }[],
  profileUnit: string,
) {
  const maximumLength = residuals
    .filter((residual) => residual.unit === 'length')
    .reduce((maximum, residual) => Math.max(maximum, residual.residual), 0)
  const maximumAngle = residuals
    .filter((residual) => residual.unit === 'degrees')
    .reduce((maximum, residual) => Math.max(maximum, residual.residual), 0)
  const parts: string[] = []
  if (residuals.some((residual) => residual.unit === 'length')) parts.push(formatResidual(maximumLength, profileUnit))
  if (residuals.some((residual) => residual.unit === 'degrees')) parts.push(formatResidual(maximumAngle, '°'))
  return parts.join(' · ') || `0 ${profileUnit}`
}

export function SketchConstraintEditor({ node, onUpdate, unit = 'mm' }: SketchConstraintEditorProps) {
  const id = useId()
  const profile = node.profile ?? []
  const constraints = node.profileConstraints ?? []
  const pointCount = profile.length
  const [type, setType] = useState<ConstraintType>('horizontal')
  const [referenceA, setReferenceA] = useState(0)
  const [referenceB, setReferenceB] = useState(pointCount > 1 ? 1 : 0)
  const [distanceValue, setDistanceValue] = useState(10)
  const [angleValue, setAngleValue] = useState(90)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const highestIndex = Math.max(0, pointCount - 1)
    setReferenceA((current) => Math.min(current, highestIndex))
    setReferenceB((current) => Math.min(current, highestIndex))
  }, [pointCount])

  const draftConstraint = useMemo<SketchConstraint | null>(() => {
    if (pointCount < 2 || referenceA === referenceB) return null
    if (type === 'distance') {
      if (!Number.isFinite(distanceValue) || distanceValue < 0) return null
      return { type, a: referenceA, b: referenceB, value: distanceValue }
    }
    if (type === 'angle') {
      if (!Number.isFinite(angleValue)) return null
      return { type, a: referenceA, b: referenceB, value: normalizeSketchAngleDegrees(angleValue) }
    }
    return { type, a: referenceA, b: referenceB }
  }, [angleValue, distanceValue, pointCount, referenceA, referenceB, type])

  const draftIsDuplicate = draftConstraint
    ? constraints.some((constraint) => isSameConstraint(constraint, draftConstraint))
    : false
  const previewIncludesDraft = draftConstraint !== null && !draftIsDuplicate
  const currentSolve = useMemo(
    () => solveSafely(profile, constraints),
    [constraints, profile],
  )
  const previewSolve = useMemo(
    () => previewIncludesDraft
      ? solveSafely(profile, [...constraints, draftConstraint])
      : currentSolve,
    [constraints, currentSolve, draftConstraint, previewIncludesDraft, profile],
  )
  const diagnostics = previewSolve.result?.diagnostics ?? currentSolve.result?.diagnostics ?? null

  const applySolved = (nextConstraints: SketchConstraint[], solved: SolveAttempt) => {
    if (!solved.result) {
      setMessage(solved.error ?? 'The sketch could not be solved.')
      return
    }
    onUpdate({
      profile: solved.result.points,
      profileConstraints: nextConstraints,
    })
  }

  const addConstraint = () => {
    setMessage(null)
    if (!draftConstraint) {
      setMessage(pointCount < 2
        ? 'Draw at least two points before adding constraints.'
        : referenceA === referenceB
          ? 'Choose two different points or edges.'
          : type === 'angle'
            ? 'Enter a valid angle in degrees.'
            : 'Enter a valid non-negative distance.')
      return
    }
    if (draftIsDuplicate) {
      setMessage('That constraint is already in the sketch.')
      return
    }
    const nextConstraints = [...constraints, draftConstraint]
    if (!previewSolve.result) {
      applySolved(nextConstraints, previewSolve)
      return
    }
    applySolved(nextConstraints, previewSolve)
    setMessage(previewSolve.result.diagnostics.converged
      ? 'Constraint added and sketch solved.'
      : 'Constraint added with the best available fit. Review the highlighted conflicts.')
  }

  const removeConstraint = (constraintIndex: number) => {
    setMessage(null)
    const nextConstraints = constraints.filter((_, index) => index !== constraintIndex)
    applySolved(nextConstraints, solveSafely(profile, nextConstraints))
  }

  const solveNow = () => {
    setMessage(null)
    if (!currentSolve.result) {
      setMessage(currentSolve.error ?? 'The sketch could not be solved.')
      return
    }
    applySolved([...constraints], currentSolve)
    setMessage(currentSolve.result.diagnostics.converged
      ? 'Sketch coordinates updated.'
      : 'Best available solution applied. Review the highlighted conflicts.')
  }

  const status = diagnostics
    ? diagnostics.overconstrained
      ? 'conflict'
      : diagnostics.converged
        ? diagnostics.estimatedDegreesOfFreedom === 0 ? 'complete' : 'solved'
        : 'conflict'
    : 'empty'
  const statusTitle = status === 'complete'
    ? 'Fully constrained'
    : status === 'solved'
      ? 'Sketch solved'
      : status === 'conflict'
        ? 'Constraints need attention'
        : 'No sketch to solve'
  const segmentReferences = usesSegments(type)

  return (
    <section className="sketch-constraint-editor" aria-labelledby={`${id}-title`}>
      <div className="sketch-constraint-heading">
        <div>
          <h3 id={`${id}-title`}>Sketch constraints</h3>
          <p>Tell edges how they should line up or how large they should be.</p>
        </div>
        <span className={`sketch-constraint-count sketch-constraint-count-${status}`}>
          {constraints.length} {constraints.length === 1 ? 'rule' : 'rules'}
        </span>
      </div>

      <div className={`sketch-constraint-status sketch-constraint-status-${status}`} aria-live="polite">
        {status === 'complete' || status === 'solved'
          ? <CheckCircle2 size={18} aria-hidden="true" />
          : <AlertTriangle size={18} aria-hidden="true" />}
        <div>
          <strong>{statusTitle}</strong>
          <span>
            {diagnostics
              ? diagnostics.overconstrained
                ? 'Remove or change conflicting rules.'
                : `${diagnostics.estimatedDegreesOfFreedom} ${diagnostics.estimatedDegreesOfFreedom === 1 ? 'movement' : 'movements'} left`
              : 'Add profile points to begin.'}
          </span>
        </div>
        {diagnostics && <small>Max error {maximumResidualSummary(diagnostics.residuals, unit)}</small>}
      </div>

      {previewIncludesDraft && (
        <p className="sketch-constraint-preview-note">Previewing the rule below. Choose Add rule to keep it.</p>
      )}

      <div className="sketch-constraint-builder">
        <label className="sketch-constraint-field sketch-constraint-type-field" htmlFor={`${id}-type`}>
          <span>Rule</span>
          <select id={`${id}-type`} value={type} onChange={(event) => { setType(event.target.value as ConstraintType); setMessage(null) }}>
            {(Object.keys(TYPE_LABELS) as ConstraintType[]).map((constraintType) => (
              <option key={constraintType} value={constraintType}>{TYPE_LABELS[constraintType]}</option>
            ))}
          </select>
        </label>

        <div className="sketch-constraint-reference-fields">
          <label className="sketch-constraint-field" htmlFor={`${id}-a`}>
            <span>{segmentReferences ? 'First edge' : 'First point'}</span>
            <select id={`${id}-a`} value={referenceA} disabled={pointCount < 2} onChange={(event) => { setReferenceA(Number(event.target.value)); setMessage(null) }}>
              {profile.map((_, index) => (
                <option key={index} value={index}>{segmentReferences ? edgeLabel(index, pointCount) : pointLabel(index, profile)}</option>
              ))}
            </select>
          </label>
          <label className="sketch-constraint-field" htmlFor={`${id}-b`}>
            <span>{segmentReferences ? 'Second edge' : 'Second point'}</span>
            <select id={`${id}-b`} value={referenceB} disabled={pointCount < 2} onChange={(event) => { setReferenceB(Number(event.target.value)); setMessage(null) }}>
              {profile.map((_, index) => (
                <option key={index} value={index}>{segmentReferences ? edgeLabel(index, pointCount) : pointLabel(index, profile)}</option>
              ))}
            </select>
          </label>
        </div>

        {type === 'distance' && (
          <label className="sketch-constraint-field sketch-constraint-distance-field" htmlFor={`${id}-distance`}>
            <span>Distance</span>
            <div>
              <input
                id={`${id}-distance`}
                type="number"
                min="0"
                step="0.1"
                value={distanceValue}
                onChange={(event) => { setDistanceValue(Number(event.target.value)); setMessage(null) }}
              />
              <em>{unit}</em>
            </div>
          </label>
        )}

        {type === 'angle' && (
          <label className="sketch-constraint-field sketch-constraint-angle-field" htmlFor={`${id}-angle`}>
            <span>Directed angle</span>
            <div>
              <input
                id={`${id}-angle`}
                type="number"
                min="-180"
                max="180"
                step="1"
                value={angleValue}
                onChange={(event) => { setAngleValue(Number(event.target.value)); setMessage(null) }}
              />
              <em>°</em>
            </div>
            <small>Positive turns counter-clockwise from the first edge to the second.</small>
          </label>
        )}

        <button
          type="button"
          className="sketch-constraint-add"
          disabled={!draftConstraint || draftIsDuplicate}
          onClick={addConstraint}
        >
          <Plus size={15} aria-hidden="true" /> Add rule
        </button>
        {draftIsDuplicate && <small className="sketch-constraint-duplicate">This rule already exists.</small>}
      </div>

      <div className="sketch-constraint-list" aria-label="Applied sketch constraints">
        <h4>Applied rules</h4>
        {constraints.length === 0 ? (
          <div className="sketch-constraint-empty">
            <strong>No rules yet</strong>
            <span>Start with a horizontal edge or a known distance.</span>
          </div>
        ) : constraints.map((constraint, index) => {
          const residual = currentSolve.result?.diagnostics.residuals.find((item) => item.constraintIndex === index)
          return (
            <article className={`sketch-constraint-item ${residual && !residual.satisfied ? 'sketch-constraint-item-conflict' : ''}`} key={`${constraint.type}-${constraint.a}-${constraint.b}-${index}`}>
              <span className="sketch-constraint-item-index">{index + 1}</span>
              <div>
                <strong>{describeConstraint(constraint, unit)}</strong>
                <small>{residual ? `Error ${formatConstraintResidual(residual, unit)}` : 'Waiting to solve'}</small>
              </div>
              <button type="button" title={`Remove rule ${index + 1}`} aria-label={`Remove rule ${index + 1}`} onClick={() => removeConstraint(index)}>
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </article>
          )
        })}
      </div>

      {message && <p className="sketch-constraint-message" role="status">{message}</p>}
      {(currentSolve.error || previewSolve.error) && (
        <p className="sketch-constraint-error" role="alert">{currentSolve.error ?? previewSolve.error}</p>
      )}

      <button type="button" className="sketch-constraint-solve" disabled={pointCount < 2 || !currentSolve.result} onClick={solveNow}>
        <WandSparkles size={15} aria-hidden="true" /> Solve now
      </button>

      {diagnostics && (
        <details className="sketch-constraint-expert">
          <summary>Expert diagnostics</summary>
          <dl>
            <div><dt>Converged</dt><dd>{diagnostics.converged ? 'Yes' : 'No'}</dd></div>
            <div><dt>Degrees of freedom</dt><dd>{diagnostics.estimatedDegreesOfFreedom}</dd></div>
            <div><dt>Constraint rank</dt><dd>{diagnostics.estimatedConstraintRank} / {diagnostics.scalarConstraintCount}</dd></div>
            <div><dt>Iterations</dt><dd>{diagnostics.iterations}</dd></div>
            <div><dt>Maximum residual</dt><dd>{maximumResidualSummary(diagnostics.residuals, unit)}</dd></div>
            <div><dt>Mixed-unit RMS</dt><dd>{diagnostics.rmsResidual.toPrecision(4)}</dd></div>
            <div><dt>Redundant rules</dt><dd>{diagnostics.redundantConstraintCount}</dd></div>
          </dl>
          {diagnostics.conflictingConstraintIndices.length > 0 && (
            <p className="sketch-constraint-conflicts">
              Conflicting rules: {diagnostics.conflictingConstraintIndices.map((index) => index + 1).join(', ')}
            </p>
          )}
          {diagnostics.invalidConstraints.length > 0 && (
            <ul className="sketch-constraint-invalid-list">
              {diagnostics.invalidConstraints.map((invalid) => (
                <li key={invalid.constraintIndex}>Rule {invalid.constraintIndex + 1}: {invalid.message}</li>
              ))}
            </ul>
          )}
        </details>
      )}
    </section>
  )
}
