import { AlertTriangle, Box, Check, RotateCw, WandSparkles } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import {
  createProfileRecipe,
  type ProfileRecipe,
  type ProfileRecipeSpec,
} from '@formforge/model'

export type ProfileRecipeOperation = 'extrude' | 'revolve'

export interface ProfileRecipeCreatorProps {
  onCreate: (result: ProfileRecipe, operation: ProfileRecipeOperation) => void
  unit: 'mm' | 'in'
}

type RecipeKind = ProfileRecipeSpec['kind']

interface RecipeOption {
  kind: RecipeKind
  label: string
  description: string
}

interface RecipeDraft {
  width: string
  height: string
  sides: string
  teeth: string
  innerRatio: string
  cornerRadius: string
}

const RECIPE_OPTIONS: readonly RecipeOption[] = [
  { kind: 'circle', label: 'Circle', description: 'A perfectly round outline' },
  { kind: 'ellipse', label: 'Ellipse', description: 'An oval with exact width and height' },
  { kind: 'regularPolygon', label: 'Polygon', description: 'A precise triangle, hexagon, or custom shape' },
  { kind: 'star', label: 'Star', description: 'Adjustable tips and inner depth' },
  { kind: 'capsule', label: 'Capsule / slot', description: 'A smooth pill-shaped outline' },
  { kind: 'roundedRectangle', label: 'Rounded rectangle', description: 'A box outline with softened corners' },
  { kind: 'gear', label: 'Gear-like', description: 'A simple toothed decorative outline' },
] as const

const defaultsForUnit = (unit: ProfileRecipeCreatorProps['unit']): RecipeDraft => unit === 'mm'
  ? {
      width: '30',
      height: '20',
      sides: '6',
      teeth: '12',
      innerRatio: '65',
      cornerRadius: '4',
    }
  : {
      width: '1.25',
      height: '0.75',
      sides: '6',
      teeth: '12',
      innerRatio: '65',
      cornerRadius: '0.15',
    }

function convertDimension(value: string, factor: number, unit: ProfileRecipeCreatorProps['unit']) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return value
  const precision = unit === 'mm' ? 3 : 4
  return String(Number((parsed * factor).toFixed(precision)))
}

function radialPath(vertexCount: number, innerRatio = 1) {
  const centerX = 36
  const centerY = 27
  const radius = 20
  const points = Array.from({ length: vertexCount * (innerRatio < 1 ? 2 : 1) }, (_, index) => {
    const alternating = innerRatio < 1
    const pointRadius = alternating && index % 2 ? radius * innerRatio : radius
    const angle = -Math.PI / 2 + index * Math.PI * 2 / (vertexCount * (alternating ? 2 : 1))
    return `${centerX + Math.cos(angle) * pointRadius},${centerY + Math.sin(angle) * pointRadius}`
  })
  return `M ${points.join(' L ')} Z`
}

function RecipeGlyph({ kind }: { kind: RecipeKind }) {
  return <svg className="profile-recipe-glyph" viewBox="0 0 72 54" aria-hidden="true">
    {kind === 'circle' && <circle cx="36" cy="27" r="19" />}
    {kind === 'ellipse' && <ellipse cx="36" cy="27" rx="25" ry="16" />}
    {kind === 'regularPolygon' && <path d={radialPath(6)} />}
    {kind === 'star' && <path d={radialPath(5, 0.45)} />}
    {kind === 'capsule' && <rect x="8" y="13" width="56" height="28" rx="14" />}
    {kind === 'roundedRectangle' && <rect x="9" y="10" width="54" height="34" rx="7" />}
    {kind === 'gear' && <path d={radialPath(12, 0.72)} />}
  </svg>
}

interface NumberFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  suffix?: string
  min?: number
  max?: number
  step?: number
  hint?: string
}

function NumberField({ id, label, value, onChange, suffix, min, max, step, hint }: NumberFieldProps) {
  return <label className="profile-recipe-field" htmlFor={id}>
    <span className="profile-recipe-field-label">{label}</span>
    <span className="profile-recipe-input-shell">
      <input
        id={id}
        className="profile-recipe-input"
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.target.value)}
      />
      {suffix && <span className="profile-recipe-input-suffix">{suffix}</span>}
    </span>
    {hint && <small className="profile-recipe-field-hint">{hint}</small>}
  </label>
}

function readPositive(value: string, label: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be greater than zero.`)
  return parsed
}

function readNonNegative(value: string, label: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} cannot be negative.`)
  return parsed
}

function readWholeNumber(value: string, label: string, minimum: number, maximum: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be a whole number from ${minimum} to ${maximum}.`)
  }
  return parsed
}

function readRatio(value: string, minimum: number, maximum: number) {
  const percentage = Number(value)
  if (!Number.isFinite(percentage) || percentage < minimum || percentage > maximum) {
    throw new Error(`Inner size must be between ${minimum}% and ${maximum}%.`)
  }
  return percentage / 100
}

function recipeTitle(kind: RecipeKind) {
  return RECIPE_OPTIONS.find((recipe) => recipe.kind === kind)?.label ?? 'Profile'
}

export function ProfileRecipeCreator({ onCreate, unit }: ProfileRecipeCreatorProps) {
  const id = useId()
  const previousUnit = useRef(unit)
  const [kind, setKind] = useState<RecipeKind>('circle')
  const [operation, setOperation] = useState<ProfileRecipeOperation>('extrude')
  const [draft, setDraft] = useState<RecipeDraft>(() => defaultsForUnit(unit))
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)
  const dimensionStep = unit === 'mm' ? 0.1 : 0.001

  useEffect(() => {
    if (previousUnit.current === unit) return
    const factor = previousUnit.current === 'mm' ? 1 / 25.4 : 25.4
    setDraft((current) => ({
      ...current,
      width: convertDimension(current.width, factor, unit),
      height: convertDimension(current.height, factor, unit),
      cornerRadius: convertDimension(current.cornerRadius, factor, unit),
    }))
    previousUnit.current = unit
    setError(null)
    setCreated(null)
  }, [unit])

  const updateDraft = (field: keyof RecipeDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setError(null)
    setCreated(null)
  }

  const selectKind = (nextKind: RecipeKind) => {
    setKind(nextKind)
    setError(null)
    setCreated(null)
  }

  const handleCreate = () => {
    try {
      const unitScale = unit === 'in' ? 25.4 : 1
      const toMillimetres = (value: string, label: string) => readPositive(value, label) * unitScale
      const width = toMillimetres(draft.width, kind === 'circle' ? 'Diameter' : 'Width')
      let spec: ProfileRecipeSpec

      switch (kind) {
        case 'circle':
          spec = { kind, width }
          break
        case 'ellipse':
          spec = { kind, width, height: toMillimetres(draft.height, 'Height') }
          break
        case 'regularPolygon':
          spec = {
            kind,
            width,
            height: toMillimetres(draft.height, 'Height'),
            sides: readWholeNumber(draft.sides, 'Sides', 3, 64),
          }
          break
        case 'star':
          spec = {
            kind,
            width,
            height: toMillimetres(draft.height, 'Height'),
            sides: readWholeNumber(draft.sides, 'Tips', 3, 64),
            innerRatio: readRatio(draft.innerRatio, 10, 90),
          }
          break
        case 'capsule':
          spec = { kind, width, height: toMillimetres(draft.height, 'Thickness') }
          break
        case 'roundedRectangle':
          spec = {
            kind,
            width,
            height: toMillimetres(draft.height, 'Height'),
            cornerRadius: readNonNegative(draft.cornerRadius, 'Corner radius') * unitScale,
          }
          break
        case 'gear':
          spec = {
            kind,
            width,
            height: toMillimetres(draft.height, 'Height'),
            teeth: readWholeNumber(draft.teeth, 'Teeth', 4, 128),
            innerRatio: readRatio(draft.innerRatio, 35, 95),
          }
          break
      }

      const result = createProfileRecipe(spec)
      onCreate(result, operation)
      setError(null)
      setCreated(`${recipeTitle(kind)} profile created for ${operation === 'extrude' ? 'extrusion' : 'revolving'}.`)
    } catch (cause) {
      setCreated(null)
      setError(cause instanceof Error ? cause.message : 'This profile could not be created. Check its dimensions and try again.')
    }
  }

  const widthLabel = kind === 'circle'
    ? 'Diameter'
    : kind === 'capsule'
      ? 'Overall length'
      : 'Width'
  const showsHeight = kind !== 'circle'
  const showsSides = kind === 'regularPolygon' || kind === 'star'
  const showsInnerRatio = kind === 'star' || kind === 'gear'

  return <section className="profile-recipe-creator" aria-labelledby={`${id}-title`}>
    <header className="profile-recipe-header">
      <span className="profile-recipe-header-icon"><WandSparkles size={18} /></span>
      <span className="profile-recipe-header-copy">
        <strong id={`${id}-title`}>Start with an outline</strong>
        <small>Pick a recipe, set exact dimensions, then create it once.</small>
      </span>
    </header>

    <div className="profile-recipe-operation" role="radiogroup" aria-label="How to turn this outline into a solid">
      <button
        className={`profile-recipe-operation-button ${operation === 'extrude' ? 'profile-recipe-operation-button-selected' : ''}`}
        type="button"
        role="radio"
        aria-checked={operation === 'extrude'}
        onClick={() => { setOperation('extrude'); setCreated(null) }}
      >
        <Box size={15} />
        <span><strong>Extrude</strong><small>Pull the outline straight up</small></span>
      </button>
      <button
        className={`profile-recipe-operation-button ${operation === 'revolve' ? 'profile-recipe-operation-button-selected' : ''}`}
        type="button"
        role="radio"
        aria-checked={operation === 'revolve'}
        onClick={() => { setOperation('revolve'); setCreated(null) }}
      >
        <RotateCw size={15} />
        <span><strong>Revolve</strong><small>Spin the outline around an axis</small></span>
      </button>
    </div>

    <div className="profile-recipe-gallery" role="radiogroup" aria-label="Outline recipe">
      {RECIPE_OPTIONS.map((recipe) => <button
        className={`profile-recipe-card ${kind === recipe.kind ? 'profile-recipe-card-selected' : ''}`}
        key={recipe.kind}
        type="button"
        role="radio"
        aria-checked={kind === recipe.kind}
        aria-label={`${recipe.label}: ${recipe.description}`}
        title={recipe.description}
        onClick={() => selectKind(recipe.kind)}
      >
        <span className="profile-recipe-card-preview"><RecipeGlyph kind={recipe.kind} /></span>
        <span className="profile-recipe-card-label">{recipe.label}</span>
        {kind === recipe.kind && <span className="profile-recipe-card-check"><Check size={11} /></span>}
      </button>)}
    </div>

    <div className="profile-recipe-selection-copy">
      <strong>{recipeTitle(kind)}</strong>
      <span>{RECIPE_OPTIONS.find((recipe) => recipe.kind === kind)?.description}</span>
    </div>

    <div className="profile-recipe-fields">
      <NumberField
        id={`${id}-width`}
        label={widthLabel}
        value={draft.width}
        suffix={unit}
        min={dimensionStep}
        step={dimensionStep}
        onChange={(value) => updateDraft('width', value)}
      />
      {showsHeight && <NumberField
        id={`${id}-height`}
        label={kind === 'capsule' ? 'Thickness' : 'Height'}
        value={draft.height}
        suffix={unit}
        min={dimensionStep}
        step={dimensionStep}
        onChange={(value) => updateDraft('height', value)}
      />}
      {showsSides && <NumberField
        id={`${id}-sides`}
        label={kind === 'star' ? 'Tips' : 'Sides'}
        value={draft.sides}
        min={3}
        max={64}
        step={1}
        hint={kind === 'regularPolygon' ? '3 creates a triangle, 6 a hexagon' : undefined}
        onChange={(value) => updateDraft('sides', value)}
      />}
      {kind === 'gear' && <NumberField
        id={`${id}-teeth`}
        label="Teeth"
        value={draft.teeth}
        min={4}
        max={128}
        step={1}
        onChange={(value) => updateDraft('teeth', value)}
      />}
      {showsInnerRatio && <NumberField
        id={`${id}-inner-ratio`}
        label={kind === 'gear' ? 'Root size' : 'Inner size'}
        value={draft.innerRatio}
        suffix="%"
        min={kind === 'gear' ? 35 : 10}
        max={kind === 'gear' ? 95 : 90}
        step={1}
        hint="Lower values make deeper cuts"
        onChange={(value) => updateDraft('innerRatio', value)}
      />}
      {kind === 'roundedRectangle' && <NumberField
        id={`${id}-corner-radius`}
        label="Corner radius"
        value={draft.cornerRadius}
        suffix={unit}
        min={0}
        step={dimensionStep}
        hint="Large values are safely limited to fit"
        onChange={(value) => updateDraft('cornerRadius', value)}
      />}
    </div>

    {error && <div className="profile-recipe-message profile-recipe-message-error" role="alert">
      <AlertTriangle size={14} /><span>{error}</span>
    </div>}
    {created && <div className="profile-recipe-message profile-recipe-message-success" role="status">
      <Check size={14} /><span>{created}</span>
    </div>}

    <footer className="profile-recipe-footer">
      <span className="profile-recipe-footer-hint">Dimensions stay editable here without rebuilding the model.</span>
      <button className="profile-recipe-create" type="button" onClick={handleCreate}>
        <WandSparkles size={15} /> Create {recipeTitle(kind)}
      </button>
    </footer>
  </section>
}
