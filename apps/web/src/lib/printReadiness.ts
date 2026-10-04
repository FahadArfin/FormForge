import type { ModelDocument, PrintAnalysis, PrinterProfile } from '@formforge/model'

export interface PrintReadinessInput {
  document: ModelDocument
  meshDocument: ModelDocument | null
  analysis: PrintAnalysis | null
  geometryStatus: 'idle' | 'building' | 'ready' | 'error'
  geometryError?: string | null
  buildMode?: 'automatic' | 'manual'
  placingNodeId?: string | null
}

export interface PrintReadiness {
  status: 'building' | 'placing' | 'error' | 'empty' | 'stale' | PrintAnalysis['status']
  title: string
  message: string
  analysis: PrintAnalysis | null
  /** A current nonempty mesh can be handed to a slicer even if printer-size checks need attention. */
  canExportMesh: boolean
}

export function getPrintReadiness(state: PrintReadinessInput): PrintReadiness {
  const pending = (status: PrintReadiness['status'], title: string, message: string): PrintReadiness => ({ status, title, message, analysis: null, canExportMesh: false })
  if (state.placingNodeId) return pending('placing', 'Finish placing your shape', 'Click the workplane to place it, or press Escape in the canvas to cancel.')
  if (state.geometryStatus === 'error') return pending('error', 'Model needs attention', state.geometryError || 'The model could not be rebuilt. Retry, or undo the last edit.')
  if (state.geometryStatus !== 'ready' || state.meshDocument !== state.document || !state.analysis) {
    if (!state.document.nodes.some((node) => !node.suppressed)) return pending('empty', 'Add a shape to begin', 'Print checks will appear once your model has a solid shape.')
    if (state.buildMode === 'manual' && state.geometryStatus !== 'building') return pending('stale', 'Rebuild for print checks', 'Manual preview is enabled. Rebuild the latest edits to update dimensions and print checks.')
    return pending('building', 'Updating print checks', 'The model is rebuilding. Checks and dimensions will update when it is ready.')
  }
  if (!state.analysis.triangleCount) return pending('empty', 'No solid to export', 'Add a solid shape, or review the shapes and cuts in your model.')
  const status = state.analysis.status
  return {
    status,
    title: status === 'ready' ? 'Basic checks passed' : status === 'blocked' ? 'Review before slicing' : 'Checks need attention',
    message: status === 'ready' ? 'Your model is ready to open in a slicer. Review the remaining checks below.' : 'Review the findings below. You can still export the geometry for work in your slicer.',
    analysis: state.analysis,
    canExportMesh: true,
  }
}

export function withPrinterSettings(document: ModelDocument, printer: PrinterProfile): ModelDocument {
  const measurements = [...Object.values(printer.buildVolume), printer.nozzleDiameter, printer.minimumWall]
  if (measurements.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error('Enter a number greater than zero for each size, nozzle diameter, and wall target.')
  if (!Number.isFinite(printer.overhangAngle) || printer.overhangAngle < 0 || printer.overhangAngle > 90) throw new Error('The overhang angle must be between 0° and 90°.')
  return {
    ...document,
    printer: { ...printer, name: printer.name.trim() || 'My printer', buildVolume: { ...printer.buildVolume } },
    revision: document.revision + 1,
    updatedAt: new Date().toISOString(),
  }
}
