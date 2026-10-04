import { useEffect, useState } from 'react'
import { Box3, Vector3 } from 'three'
import { type ModelNode } from '@formforge/model'
import { createFitCoupon, createHoleRecipe, type FitCoupon, type HoleRecipeOptions } from '@/lib/cadRecipes'
import { nodeWorldBounds } from '@/lib/modelGeometry'
import { parseNumericExpression } from '@/lib/numericExpression'
import { useEditor } from '@/store/editor'
import {useInspection} from '@/store/inspection'
import {calibrationMatches} from '@/lib/fitCalibration'
import './CadToolsPanel.css'

const initialHoleDraft = { diameter: '4', depth: '10', clearance: '0.2', x: '0', y: '0', bottomZ: '0', headDiameter: '8', headDepth: '3', includedAngle: '90', length: '14', acrossFlats: '7' }
type HoleDraft = typeof initialHoleDraft
const volumeHoleHelp = 'Volume sculpting is applied after cutouts and can refill holes. Export the evaluated mesh and reimport it before making new holes.'

function insertRecipe(nodes: ModelNode[], notice: string) {
  const editor = useEditor.getState()
  editor.dispatch({ type: 'add-nodes', nodes })
  if (!nodes.every(node => useEditor.getState().document.nodes.some(current => current.id === node.id))) return
  editor.selectNode(nodes[0]!.id)
  for (const node of nodes.slice(1)) editor.selectNode(node.id, true)
  editor.setTool('select')
  editor.setNotice(notice)
}

function HoleBuilder() {
  const pendingFit=useInspection(s=>s.pendingFit)
  const [kind, setKind] = useState<HoleRecipeOptions['kind']>('plain')
  const [draft, setDraft] = useState<HoleDraft>(initialHoleDraft)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)
  const locked = useEditor(state => state.document.nodes.some(node => node.locked && !node.suppressed))
  const hasVolumeSculpting = useEditor(state => state.document.sculptStrokes.length > 0)
  const hasSolid = useEditor(state => state.document.nodes.some(node => node.boolean === 'add' && !node.suppressed))
  const documentId = useEditor(state => state.document.id)
  useEffect(() => { setCreated(null); setError(null) }, [documentId])
  useEffect(()=>{if(!pendingFit)return;const doc=useEditor.getState().document;if(calibrationMatches(pendingFit,doc.printer,doc.printMaterial?.name??'Unspecified material')){setKind('plain');setDraft(current=>({...current,diameter:String(pendingFit.nominalDiameter),clearance:String(pendingFit.diametralClearance)}));setCreated(`Measured ${pendingFit.fit} fit loaded for review: ${pendingFit.layerHeight} mm layers, upright ${pendingFit.nominalDiameter} mm hole. Check the rest of your print settings.`)}else setError('That fit result belongs to a different printer, nozzle or material.');useInspection.setState({pendingFit:null})},[pendingFit])
  const field = (key: keyof HoleDraft, label: string, suffix = 'mm') => <label className="cad-recipe-field" key={key}>
    <span>{label} <small>{suffix}</small></span>
    <input aria-label={`${label} (${suffix})`} type="text" inputMode="decimal" value={draft[key]} maxLength={160} onChange={event => {
      setDraft(current => ({ ...current, [key]: event.target.value })); setError(null); setCreated(null)
    }} />
  </label>
  return <section className="cad-recipe-card" aria-labelledby="hole-builder-heading">
    <header><h3 id="hole-builder-heading">Hole builder</h3><p>Make editable cutouts for mounts, fasteners and slots.</p></header>
    <form noValidate onSubmit={event => {
      event.preventDefault()
      setCreated(null)
      try {
        const current = useEditor.getState().document
        if (current.sculptStrokes.length > 0) throw new Error(volumeHoleHelp)
        const nodes = current.nodes
        if (nodes.some(node => node.locked && !node.suppressed)) throw new Error('Unlock active parts before adding cutouts. Cutouts can affect every overlapping solid.')
        if (!nodes.some(node => node.boolean === 'add' && !node.suppressed)) throw new Error('Add a solid before making a cutout.')
        const length = (key: keyof HoleDraft) => parseNumericExpression(draft[key], 'mm')
        const placement = { depth: length('depth'), clearance: length('clearance'), x: length('x'), y: length('y'), bottomZ: length('bottomZ') }
        let options: HoleRecipeOptions
        if (kind === 'hex-pocket') options = { ...placement, kind, acrossFlats: length('acrossFlats') }
        else {
          const common = { ...placement, diameter: length('diameter') }
          if (kind === 'counterbore') options = { ...common, kind, headDiameter: length('headDiameter'), headDepth: length('headDepth') }
          else if (kind === 'countersink') options = { ...common, kind, headDiameter: length('headDiameter'), includedAngle: parseNumericExpression(draft.includedAngle, '°') }
          else if (kind === 'slot') options = { ...common, kind, length: length('length') }
          else options = { ...common, kind }
        }
        const cutters = createHoleRecipe(options)
        const notice = `${cutters.length === 1 ? 'Cutout' : 'Both cutout shapes'} added. Select and edit the cutouts in Model; Undo removes the recipe together.`
        insertRecipe(cutters, notice)
        setCreated(notice); setError(null)
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the hole dimensions.') }
    }}>
      <label className="cad-recipe-field"><span>Style</span><select aria-label="Hole style" value={kind} onChange={event => { setKind(event.target.value as HoleRecipeOptions['kind']); setError(null); setCreated(null) }}>
        <option value="plain">Plain hole</option><option value="counterbore">Counterbore</option><option value="countersink">Countersink</option><option value="slot">Elongated slot</option><option value="hex-pocket">Hex nut pocket</option>
      </select></label>
      <div className="cad-recipe-fields">
        {kind === 'hex-pocket' ? field('acrossFlats', 'Across flats') : field('diameter', kind === 'slot' ? 'Slot width' : 'Hole diameter')}
        {field('depth', 'Total cut depth')}
        {field('clearance', kind === 'hex-pocket' ? 'Across-flats clearance' : 'Diametral clearance')}
        {kind === 'slot' && field('length', 'Slot total length')}
        {(kind === 'counterbore' || kind === 'countersink') && field('headDiameter', 'Recess diameter')}
        {kind === 'counterbore' && field('headDepth', 'Recess depth')}
        {kind === 'countersink' && field('includedAngle', 'Included angle', '°')}
      </div>
      <p className="cad-recipe-hint">Clearance is added once to {kind === 'hex-pocket' ? 'the distance across parallel flats' : kind === 'slot' ? 'the width and total length' : 'each diameter'}, giving half that gap on each side. Custom sizes; no fastener standard is assumed.</p>
      <fieldset><legend>Placement</legend><div className="cad-recipe-fields cad-placement-fields">{field('x', 'Center X')}{field('y', 'Center Y')}{field('bottomZ', 'Bottom Z')}</div></fieldset>
      <p className="cad-recipe-hint">Cuts upward from Bottom Z by the total depth. Recesses open at the top. Position the cutout to overlap your solid; it cuts all earlier overlapping solids.</p>
      {locked && <p className="cad-recipe-warning">Unlock active parts before creating cutouts.</p>}
      {hasVolumeSculpting && <p className="cad-recipe-warning">{volumeHoleHelp}</p>}
      {!hasSolid && <p className="cad-recipe-warning">Add a solid before making a cutout.</p>}
      {error && <p className="cad-recipe-error" role="alert">{error}</p>}
      {created && <p className="cad-recipe-success" role="status">{created}</p>}
      <button className="cad-recipe-submit" type="submit" disabled={locked || hasVolumeSculpting || !hasSolid}>Create cutout</button>
    </form>
  </section>
}

const initialCouponDraft = { diameter: '4', clearanceStart: '0.1', clearanceStep: '0.1', sampleCount: '5', plateThickness: '3', pinHeight: '8' }
type CouponDraft = typeof initialCouponDraft

function FitCouponBuilder() {
  const [draft, setDraft] = useState<CouponDraft>(initialCouponDraft)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ samples: FitCoupon['samples']; diameter: number } | null>(null)
  const documentId = useEditor(state => state.document.id)
  useEffect(() => { setCreated(null); setError(null) }, [documentId])
  const field = (key: keyof CouponDraft, label: string, suffix = 'mm') => <label className="cad-recipe-field" key={key}>
    <span>{label} {suffix && <small>{suffix}</small>}</span>
    <input aria-label={`${label}${suffix ? ` (${suffix})` : ''}`} type="text" inputMode="decimal" value={draft[key]} maxLength={160} onChange={event => {
      setDraft(current => ({ ...current, [key]: event.target.value })); setError(null)
    }} />
  </label>
  return <section className="cad-recipe-card" data-cad-tool="coupon" aria-labelledby="fit-coupon-heading">
    <header><h3 id="fit-coupon-heading">Fit-test coupon</h3><p>Print a hole strip and a separate pin gauge to test your printer and material.</p></header>
    <form noValidate onSubmit={event => {
      event.preventDefault()
      try {
        const document = useEditor.getState().document
        const occupied = new Box3()
        for (const node of document.nodes) if (!node.suppressed) occupied.union(nodeWorldBounds(node))
        // Sculpting runs after every Boolean operation. Keep new gauge pieces clear
        // of its complete brush bounds as well as the ordinary source-node bounds.
        for (const stroke of document.sculptStrokes) {
          const radius = Math.max(stroke.radius, stroke.radius * (0.72 + stroke.strength * 0.28))
          occupied.expandByPoint(new Vector3(stroke.center.x - radius, stroke.center.y - radius, stroke.center.z - radius))
          occupied.expandByPoint(new Vector3(stroke.center.x + radius, stroke.center.y + radius, stroke.center.z + radius))
        }
        const length = (key: keyof CouponDraft) => parseNumericExpression(draft[key], 'mm')
        const diameter = length('diameter')
        const coupon = createFitCoupon({ diameter, clearanceStart: length('clearanceStart'), clearanceStep: length('clearanceStep'), sampleCount: parseNumericExpression(draft.sampleCount), plateThickness: length('plateThickness'), pinHeight: length('pinHeight'), x: occupied.isEmpty() ? 0 : occupied.min.x, y: occupied.isEmpty() ? 0 : occupied.max.y + 8, bottomZ: 0 })
        insertRecipe(coupon.nodes, `Fit-test coupon added beside the model. From left to right (+X): ${coupon.samples.map(sample => `+${sample.clearance}`).join(', ')} mm diametral clearance. The separate gauge pin is ${diameter} mm.`)
        setCreated({ samples: coupon.samples, diameter }); setError(null)
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the fit-test dimensions.') }
    }}>
      <div className="cad-recipe-fields">
        {field('diameter', 'Nominal pin diameter')}{field('sampleCount', 'Sample count', '')}
        {field('clearanceStart', 'First clearance')}{field('clearanceStep', 'Clearance step')}
        {field('plateThickness', 'Strip thickness')}{field('pinHeight', 'Pin height')}
      </div>
      <p className="cad-recipe-hint">3–7 holes, ordered left to right along +X. Hole diameter = nominal pin diameter + clearance. This is total diametral clearance, not a gap on each side.</p>
      <p className="cad-recipe-hint">Added on the +Y side of the model, with the gauge separate from the strip. Check the printer’s build volume before export. No text is printed; sample values are saved in the shape names.</p>
      {error && <p className="cad-recipe-error" role="alert">{error}</p>}
      <button className="cad-recipe-submit" type="submit">Create fit-test coupon</button>
      {created && <div className="cad-coupon-summary" role="status">
        <strong>Created: {created.diameter} mm pin gauge</strong>
        <span>Left to right in the workspace (+X)</span>
        <ol>{created.samples.map(sample => <li key={sample.label}><span>+{sample.clearance} mm clearance</span><small>Ø {sample.holeDiameter} mm</small></li>)}</ol>
        <p>Print and try the pin in each hole. The best fit depends on material, orientation and printer settings.</p>
      </div>}
    </form>
  </section>
}

export function CadToolsPanel() {
  return <div className="cad-tools-panel"><HoleBuilder /><FitCouponBuilder /></div>
}
