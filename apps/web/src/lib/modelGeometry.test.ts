import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, createNode, vec3, type MeshPayload, type ModelDocument, type ModelNode } from '@formforge/model'
import { nodeToWorldGeometry, nodeWorldBounds } from './modelGeometry'
import { getPlatePlacementTarget, placeDocumentFromMesh } from './platePlacement'

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

async function evaluateNode(node: ModelNode): Promise<MeshPayload> {
  const document = { ...createDocument(), nodes: [node] }
  return evaluateDocument(document)
}

async function evaluateDocument(document: ModelDocument): Promise<MeshPayload> {
  vi.resetModules()
  const worker = { postMessage: vi.fn(), onmessage: null as null | ((event: { data: { id: number; document: ModelDocument } }) => Promise<void>) }
  vi.stubGlobal('self', worker)
  await import('../geometry/geometry.worker')
  await worker.onmessage!({ data: { id: 1, document } })
  const result = worker.postMessage.mock.calls[0]![0] as MeshPayload & { ok: boolean; error?: string }
  expect(result.ok, result.error).toBe(true)
  return result
}

describe('preview and evaluated capsule bounds', () => {
  it('places an oversized-radius capsule on the plate in both preview and the export mesh', async () => {
    const node = createNode('capsule', 'add', vec3())
    node.parameters = { ...node.parameters, radius: 12, height: 18 }
    node.transform.position.z -= nodeWorldBounds(node).min.z
    const document = { ...createDocument(), nodes: [node] }
    const worker = { postMessage: vi.fn(), onmessage: null as null | ((event: { data: { id: number; document: ModelDocument } }) => Promise<void>) }
    vi.stubGlobal('self', worker)
    await import('../geometry/geometry.worker')
    await worker.onmessage!({ data: { id: 1, document } })
    const result = worker.postMessage.mock.calls[0]![0] as { ok: boolean; error?: string; positions: Float32Array }
    expect(result.ok, result.error).toBe(true)
    const z = Array.from(result.positions).filter((_, index) => index % 3 === 2)
    expect(Math.min(...z)).toBeCloseTo(0, 5)
    expect(Math.max(...z)).toBeCloseTo(18, 5)
    expect(nodeWorldBounds(node).min.z).toBeCloseTo(0, 5)
    expect(nodeWorldBounds(node).max.z).toBeCloseTo(18, 5)
  })
})

describe('preview and evaluated model transforms', () => {
  it.each([
    { kind: 'taper' as const, amount: 50, corners: [[0.5, 1, 3], [5.5, 1, 3], [0.5, 11, 3], [1.5, 3, 33]] },
    { kind: 'bend' as const, amount: 30, corners: [[-5, 2, 3], [5, 2, 3], [-5, 22, 3], [7, 2, 33]] },
    { kind: 'twist' as const, amount: 90, corners: [[2.121320344, 0.707106781, 3], [9.192388155, -6.363961031, 3], [16.263455967, 14.849242405, 3], [-0.707106781, 2.121320344, 33]] },
  ])('normalizes $kind using the imported mesh bounds rather than unused primitive dimensions', async ({ kind, amount, corners }) => {
    const node = createNode('mesh', 'add', vec3())
    node.mesh = { positions: [1, 2, 3, 11, 2, 3, 1, 22, 3, 1, 2, 33], indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] }
    node.parameters.height = 18
    node.deformation = { kind, amount }
    const result = await evaluateNode(node)
    const preview = nodeToWorldGeometry(node)
    for (const positions of [result.positions, preview.getAttribute('position').array]) {
      for (const corner of corners) {
        let found = false
        for (let index = 0; index < positions.length; index += 3) {
          if (corner.every((value, axis) => Math.abs(value - positions[index + axis]!) < 0.0001)) found = true
        }
        expect(found, `Missing deformed corner ${corner.join(', ')}`).toBe(true)
      }
    }
    preview.dispose()
  })

  it('tapers a sphere over its full diameter even when its unused height parameter differs', async () => {
    const node = createNode('sphere', 'add', vec3())
    node.parameters = { ...node.parameters, radius: 20, height: 18 }
    node.deformation = { kind: 'taper', amount: 50 }
    const result = await evaluateNode(node)
    for (let index = 0; index < result.positions.length; index += 3) {
      const x = result.positions[index]!; const y = result.positions[index + 1]!; const z = result.positions[index + 2]!
      // Radius-20 sphere, taper factors 0.5 at Z=-20 through 1.5 at Z=20.
      const expectedRadius = Math.sqrt(Math.max(0, 400 - z * z)) * (1 + z / 40)
      expect(Math.hypot(x, y)).toBeCloseTo(expectedRadius, 4)
    }
  })

  it('uses the viewport XYZ rotation convention for a compound rotation', async () => {
    const node = createNode('box', 'add', vec3(4, -6, 8))
    node.parameters = { ...node.parameters, width: 10, depth: 20, height: 30 }
    node.transform.rotation = vec3(30, 45, 60)
    const result = await evaluateNode(node)
    // Independently computed extrema of the eight corners after R_x R_y R_z.
    const halfSize = [18.498093028, 11.205448352, 17.623019683]
    const position = [4, -6, 8]
    const preview = nodeWorldBounds(node)
    for (let axis = 0; axis < 3; axis += 1) {
      const values = Array.from(result.positions).filter((_, index) => index % 3 === axis)
      expect(Math.min(...values)).toBeCloseTo(position[axis]! - halfSize[axis]!, 4)
      expect(Math.max(...values)).toBeCloseTo(position[axis]! + halfSize[axis]!, 4)
      expect(preview.min.getComponent(axis)).toBeCloseTo(Math.min(...values), 4)
      expect(preview.max.getComponent(axis)).toBeCloseTo(Math.max(...values), 4)
    }
    expect(result.volume).toBeCloseTo(6_000, 4)
  })

  it.each([
    { scale: vec3(-2, 1, 0.5), corners: [[5.5, -8, 10], [5.5, -28, 10], [5.5, -8, 30], [20.5, -8, 10]] },
    { scale: vec3(-2, -1, 0.5), corners: [[5.5, -8, 6], [5.5, -28, 6], [5.5, -8, -14], [20.5, -8, 6]] },
  ])('preserves off-center imported mesh vertices and volume under signed scale $scale', async ({ scale, corners }) => {
    const node = createNode('mesh', 'add', vec3(4, -6, 8))
    node.mesh = {
      positions: [1, 2, 3, 11, 2, 3, 1, 22, 3, 1, 2, 33],
      indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3],
    }
    node.transform.rotation = vec3(90, 90, 0)
    node.transform.scale = scale
    const result = await evaluateNode(node)
    const preview = nodeToWorldGeometry(node)
    const previewPositions = preview.getAttribute('position').array
    const hasCorner = (positions: ArrayLike<number>, corner: number[]) => {
      for (let index = 0; index < positions.length; index += 3) {
        if (corner.every((value, axis) => Math.abs(positions[index + axis]! - value) < 0.0001)) return true
      }
      return false
    }
    for (const corner of corners) {
      expect(hasCorner(result.positions, corner), `Export is missing ${corner.join(', ')}`).toBe(true)
      expect(hasCorner(previewPositions, corner), `Preview is missing ${corner.join(', ')}`).toBe(true)
    }
    expect(result.volume).toBeCloseTo(1_000, 4)
    preview.dispose()
  })

  it('centers and drops a rotated hollow model while preserving evaluated volume sculpting', async () => {
    const node = createNode('box', 'add', vec3(50, -10, 30))
    node.parameters = { ...node.parameters, width: 20, depth: 30, height: 40 }
    node.transform.rotation = vec3(30, 45, 60)
    node.transform.scale = vec3(-1, 1, 1)
    node.surface = { hollowThickness: 2, smoothAngle: 0, refineLength: 0, simplifyTolerance: 0 }
    const document = { ...createDocument(), nodes: [node] }
    document.sculptStrokes = [{ id: 'volume-add', nodeId: node.id, mode: 'add', center: vec3(80, -10, 30), radius: 5, strength: 1, createdAt: document.createdAt }]
    const before = await evaluateDocument(document)
    const placed = placeDocumentFromMesh(document, getPlatePlacementTarget(document, [], 'document'), before, 'center-and-drop')!
    const after = await evaluateDocument(placed)
    for (let axis = 0; axis < 3; axis += 1) {
      const values = Array.from(after.positions).filter((_, index) => index % 3 === axis)
      if (axis < 2) expect((Math.min(...values) + Math.max(...values)) / 2).toBeCloseTo(0, 4)
      else expect(Math.min(...values)).toBeCloseTo(0, 4)
    }
    expect(after.volume).toBeCloseTo(before.volume, 3)
    expect(after.triangleCount).toBe(before.triangleCount)
    expect(placed.sculptStrokes[0]!.center.x - placed.nodes[0]!.transform.position.x).toBeCloseTo(30, 6)
  })
})
