import type { MeshPayload, ModelDocument, ModelNode } from '@formforge/model'
import { Vector3 } from 'three'
import { resolveDocumentParameterBindings } from './modelParameters'
import { modelTransformMatrix } from './modelTransforms'
import { validateInspectionMesh } from './meshInspection'
import { analyzeOverhangs } from './overhangs'

export interface EngineeringFinding {
  id: string
  title: string
  description: string
  evidence: 'deterministic' | 'heuristic' | 'unverified-ai'
  status: 'pass' | 'warning' | 'unknown' | 'info'
  value?: number
  target?: number
  unit?: 'mm' | 'deg' | 'mm²'
}
export interface EngineeringTargets {
  holeIds?: [string, string]
  targetSpacingMm?: number
  toleranceMm?: number
  alignmentToleranceDegrees?: number
}
export function isParametricHole(node: ModelNode) {
  return !node.suppressed && node.kind === 'cylinder' && node.boolean === 'cut' && !node.mesh &&
    (!node.deformation || node.deformation.kind === 'none') && !Object.values(node.surface ?? {}).some(v => v > 0) &&
    !node.edgeTreatment
}
const rounded = (value: number) => Number(value.toFixed(6))

/** Design-feature measurements and bounded mesh observations, never a certification of physical fit. */
export function engineeringFindings(document: ModelDocument, mesh: MeshPayload | null, targets: EngineeringTargets = {}): EngineeringFinding[] {
  const findings: EngineeringFinding[] = []
  const tolerance = targets.toleranceMm ?? .2, angularTolerance = targets.alignmentToleranceDegrees ?? 1
  const settingsValid = Number.isFinite(tolerance) && tolerance >= 0 && Number.isFinite(angularTolerance) && angularTolerance >= 0 && angularTolerance <= 90 &&
    (targets.targetSpacingMm === undefined || (Number.isFinite(targets.targetSpacingMm) && targets.targetSpacingMm >= 0))
  const resolved = resolveDocumentParameterBindings(document)
  const holes = resolved.document.nodes.filter(isParametricHole)
  const pair = targets.holeIds ? targets.holeIds.map(id => holes.find(h => h.id === id)) : holes.slice(0, 2)
  const [a,b] = pair
  const featuresKnown = settingsValid && Object.keys(resolved.errors).length === 0 && !document.sculptStrokes.length && a && b && a.id !== b.id
  if (featuresKnown) {
    const centerA = new Vector3().copy(a.transform.position), centerB = new Vector3().copy(b.transform.position)
    const axisA = new Vector3(0,0,1).transformDirection(modelTransformMatrix(a.transform))
    const axisB = new Vector3(0,0,1).transformDirection(modelTransformMatrix(b.transform))
    const offset = centerB.clone().sub(centerA), spacing = centerA.distanceTo(centerB)
    const angle = Math.acos(Math.min(1, Math.abs(axisA.dot(axisB)))) * 180 / Math.PI
    const coaxialOffset = offset.clone().addScaledVector(axisA,-offset.dot(axisA)).length()
    const scope = `${a.name} and ${b.name}. Nominal cylinder cutter geometry; intersection with the final solid and manufactured fit are not verified.`
    findings.push({id:'hole-spacing', title:'Hole center spacing', evidence:'deterministic',
      status:targets.targetSpacingMm === undefined ? 'info' : Math.abs(spacing-targets.targetSpacingMm) <= tolerance + 1e-9 ? 'pass' : 'warning',
      value:rounded(spacing), target:targets.targetSpacingMm, unit:'mm',
      description:`${scope} Center-to-center distance in 3D${targets.targetSpacingMm === undefined ? '; set a target to check tolerance.' : `; target ${targets.targetSpacingMm} ± ${tolerance} mm.`}`})
    findings.push({id:'hole-parallelism',title:'Hole axis parallelism',evidence:'deterministic',status:angle <= angularTolerance + 1e-9 ? 'pass':'warning',
      value:rounded(angle),target:angularTolerance,unit:'deg',description:`${scope} Acute angle between axes; tolerance ${angularTolerance}°. Parallel axes may still be offset.`})
    findings.push({id:'hole-coaxiality',title:'Hole axis offset',evidence:'deterministic',status:angle > angularTolerance + 1e-9 ? 'unknown' : coaxialOffset <= tolerance + 1e-9 ? 'pass':'warning',
      ...(angle <= angularTolerance + 1e-9 ? {value:rounded(coaxialOffset)} : {}),target:tolerance,unit:'mm',
      description:angle > angularTolerance + 1e-9 ? 'Axes are not parallel within the selected tolerance. A single coaxial offset is not reported.' : `Perpendicular distance between nominal axes: target 0 ± ${tolerance} mm. Offset is expected for a side-by-side hole pattern; only coaxial designs need zero offset.`})
  } else {
    const reason = !settingsValid ? 'Enter finite, nonnegative targets and an angular tolerance from 0° to 90°.' : Object.keys(resolved.errors).length ? 'Resolve parameter or attached-hole errors before measuring features.' : document.sculptStrokes.length ? 'Volume sculpting changes feature geometry. Hole design measurements are unavailable.' : 'Choose two enabled parametric cylinder cutters. Hole features are not inferred from imported or converted meshes.'
    for (const [id,title] of [['hole-spacing','Hole center spacing'],['hole-parallelism','Hole axis parallelism'],['hole-coaxiality','Hole axis offset']]) findings.push({id:id!,title:title!,evidence:'deterministic',status:'unknown',description:reason})
  }
  if (!mesh) {
    findings.push({id:'build-volume',title:'Evaluated build volume',evidence:'deterministic',status:'unknown',description:'Build the current solid before checking its dimensions.'})
  } else {
    try {
      validateInspectionMesh(mesh)
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity]
      for (const id of mesh.indices) for(let axis=0;axis<3;axis++) { const value=mesh.positions[id*3+axis]!;min[axis]=Math.min(min[axis]!,value);max[axis]=Math.max(max[axis]!,value) }
      const dimensions=max.map((value,axis)=>value-min[axis]!), volume=document.printer.buildVolume
      const fits=dimensions.every((v,i)=>v <= [volume.x,volume.y,volume.z][i]! + 1e-6)
      findings.push({id:'build-volume',title:'Evaluated build volume',evidence:'deterministic',status:fits?'pass':'warning',description:`${dimensions.map(v=>rounded(v)).join(' × ')} mm. Printer: ${volume.x} × ${volume.y} × ${volume.z} mm. Dimensions only; actual bed position is checked in Print review.`})
      const overhangs=analyzeOverhangs(mesh,document.printer.overhangAngle)
      findings.push({id:'overhangs',title:'Potential overhang area',evidence:'heuristic',status:overhangs.faceCount?'warning':'info',value:rounded(overhangs.area),unit:'mm²',description:`${overhangs.faceCount} downward faces below ${document.printer.overhangAngle}° from the bed. Geometric slopes only; bridges, support paths, material and cooling are not simulated.`})
    } catch(error) {
      findings.push({id:'build-volume',title:'Evaluated geometry unavailable',evidence:'deterministic',status:'unknown',description:error instanceof Error?error.message:'Inspection could not read this mesh.'})
    }
  }
  findings.push({id:'wall-thickness',title:'Local wall thickness',evidence:'heuristic',status:'unknown',description:'Run Sample wall distances below. At most 512 triangle-centroid rays are tested; a sampled minimum is not the global minimum wall thickness.'})
  findings.push({id:'clearance',title:'Part clearance and overlap',evidence:'deterministic',status:'unknown',description:'Choose two independent parts in Mechanical checks. Clearance is measured only within the configured search distance; manufacturing tolerances are not included.'})
  findings.push({id:'physical-fit',title:'Strength and physical fit',evidence:'unverified-ai',status:'unknown',description:'Not verified. AI suggestions, if requested, need independent geometry checks, slicer review and physical testing. No load, fatigue, material or printer-process simulation has been run.'})
  return findings
}
