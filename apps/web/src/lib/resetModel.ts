import type { ModelDocument } from '@formforge/model'

export function hasResettableModel(document: ModelDocument) {
  return Boolean(document.nodes.length || document.sculptStrokes.length || document.namedParameters.length
    || document.annotations?.length || document.referenceImages?.length || document.workplane)
}

/** Keep project identity/settings and attribution; remove geometry and its dependent metadata. */
export function emptyModel(document: ModelDocument): ModelDocument {
  const material = document.printMaterial
  return {
    schemaVersion: document.schemaVersion,
    id: document.id, name: document.name, createdAt: document.createdAt,
    revision: document.revision + 1, updatedAt: new Date().toISOString(),
    units: document.units, workspaceMode: document.workspaceMode,
    printer: document.printer, materialPalette: document.materialPalette,
    communitySource: document.communitySource,
    printMaterial: material ? {
      name: material.name, density: material.density, pricePerKg: material.pricePerKg,
      currency: material.currency, priceConfigured: material.priceConfigured,
    } : undefined,
    nodes: [], sculptStrokes: [], namedParameters: [],
  }
}
