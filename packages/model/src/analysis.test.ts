import { describe, expect, it } from 'vitest'
import { analyzeForPrint } from './analysis.js'
import { createDocument } from './defaults.js'
import type { MeshPayload } from './types.js'

const mesh: MeshPayload = { positions: new Float32Array(), indices: new Uint32Array(), triangleCount: 12, volume: 80 }

describe('basic print analysis', () => {
  it('warns when a flat plate is thinner than the configured dimension target', () => {
    const result = analyzeForPrint(createDocument(), mesh, { x: 20, y: 20, z: 0.2 })
    expect(result.status).toBe('warning')
    expect(result.issues.some((issue) => issue.id === 'thin')).toBe(true)
  })

  it('checks a model against the selected printer volume', () => {
    const document = createDocument()
    document.printer.buildVolume = { x: 100, y: 200, z: 150 }
    expect(analyzeForPrint(document, mesh, { x: 101, y: 20, z: 20 }).status).toBe('blocked')
    expect(analyzeForPrint(document, mesh, { x: 100, y: 20, z: 20 }).status).toBe('ready')
  })
})
