import { describe, expect, it } from 'vitest'
import { createDocument, type PrintAnalysis } from '@formforge/model'
import { getPrintReadiness, withPrinterSettings } from './printReadiness'

const document = createDocument()
const analysis: PrintAnalysis = { status: 'ready', dimensions: { x: 20, y: 30, z: 40 }, volume: 500, triangleCount: 12, issues: [] }
const current = { document, meshDocument: document, geometryStatus: 'ready' as const, analysis }

describe('print readiness', () => {
  it('asks for a rebuild in manual mode without claiming work is in progress', () => {
    const stale = { ...current, document: { ...document }, geometryStatus: 'idle' as const, buildMode: 'manual' as const }
    expect(getPrintReadiness(stale)).toMatchObject({ status: 'stale', title: 'Rebuild for print checks', analysis: null, canExportMesh: false })
    expect(getPrintReadiness({ ...stale, geometryStatus: 'building' }).status).toBe('building')
  })
  it('hides stale analysis immediately after an edit, before the rebuild starts', () => {
    const result = getPrintReadiness({ ...current, document: { ...document, revision: 2 } })
    expect(result.status).toBe('building')
    expect(result.analysis).toBeNull()
    expect(result.canExportMesh).toBe(false)
  })
  it('shows a failed build instead of claiming a stale result is rebuilding or ready', () => {
    const result = getPrintReadiness({ ...current, document: { ...document }, geometryStatus: 'error', geometryError: 'Invalid surface' })
    expect(result.status).toBe('error')
    expect(result.message).toContain('Invalid surface')
    expect(result.analysis).toBeNull()
    expect(result.canExportMesh).toBe(false)
  })
  it('does not export an unplaced preview even when its mesh has finished', () => {
    expect(getPrintReadiness({ ...current, placingNodeId: 'preview' }).canExportMesh).toBe(false)
  })
  it('permits slicer handoff for an evaluated mesh while keeping printer issues visible', () => {
    const result = getPrintReadiness({ ...current, analysis: { ...analysis, status: 'blocked', issues: [{ id: 'build-volume', title: 'Too large', description: 'Resize it.', severity: 'error' }] } })
    expect(result.status).toBe('blocked')
    expect(result.canExportMesh).toBe(true)
  })
  it('does not report an empty evaluated document as printable', () => {
    const result = getPrintReadiness({ ...current, analysis: { ...analysis, triangleCount: 0 } })
    expect(result.status).toBe('empty')
    expect(result.canExportMesh).toBe(false)
  })
})

describe('printer settings', () => {
  it('rejects invalid dimensions and nozzle or wall targets before replacing the document', () => {
    for (const value of [0, -10, NaN, Infinity]) {
      expect(() => withPrinterSettings(document, { ...document.printer, buildVolume: { x: value, y: 220, z: 220 } })).toThrow()
      expect(() => withPrinterSettings(document, { ...document.printer, minimumWall: value })).toThrow()
      expect(() => withPrinterSettings(document, { ...document.printer, nozzleDiameter: value })).toThrow()
    }
  })
  it('changes only printer settings and revision metadata, preserving the editable model', () => {
    const result = withPrinterSettings(document, { ...document.printer, name: ' My printer ', buildVolume: { x: 120, y: 130, z: 140 } })
    expect(result.printer.name).toBe('My printer')
    expect(result.printer.buildVolume).toEqual({ x: 120, y: 130, z: 140 })
    expect(result.revision).toBe(document.revision + 1)
    expect(result.nodes).toBe(document.nodes)
    expect(document.printer.buildVolume.x).not.toBe(120)
  })
})
