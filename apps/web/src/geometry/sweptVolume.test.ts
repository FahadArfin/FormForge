import { expect, it } from 'vitest'
import { createDocument, createNode, vec3, type SculptStroke } from '@formforge/model'
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { meshPayloadToGeometry } from '../lib/exporters'
import { evaluate, VolumeEvaluator } from './geometry.worker'

it.each(['add', 'carve'] as const)('sweeps a continuous %s surface between widely spaced samples', async mode => {
  const document = createDocument(), plate = createNode('box')
  plate.parameters = { ...plate.parameters, width: 60, depth: 40, height: 10 }; plate.transform.position = vec3(0, 0, 5); document.nodes = [plate]
  const stroke = (x: number, from: number): SculptStroke => ({ id: String(x), nodeId: plate.id, mode, center: vec3(x, 0, mode === 'add' ? 9 : 11), sweepFrom: vec3(from, 0, mode === 'add' ? 9 : 11), radius: 3, strength: .5, createdAt: '' })
  document.sculptStrokes = [stroke(-10, -10), stroke(10, -10)]
  const incremental = new VolumeEvaluator()
  try {
    await incremental.evaluate({ ...document, sculptStrokes: document.sculptStrokes.slice(0, 1) })
    const full = await evaluate(document), cached = await incremental.evaluate(document)
    expect(cached.volume).toBeCloseTo(full.volume, 7)
    expect(incremental.lastEvaluation.appliedStamps).toBe(1)
    const geometry = meshPayloadToGeometry(full), material = new MeshBasicMaterial({ side: DoubleSide }), mesh = new Mesh(geometry, material)
    try {
      const heights = [-8, -4, 0, 4, 8].map(x => new Raycaster(new Vector3(x, 0, 30), new Vector3(0, 0, -1)).intersectObject(mesh)[0]!.point.z)
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(.01)
      expect(heights[2]).toBeCloseTo(mode === 'add' ? 12 : 8, 2)
      const legacy = await evaluate({ ...document, sculptStrokes: document.sculptStrokes.map(({ sweepFrom: _, ...s }) => s) })
      expect(full.volume).not.toBeCloseTo(legacy.volume, 2)
    } finally { geometry.dispose(); material.dispose() }
  } finally { incremental.dispose() }
})

it('keeps curved sweeps equivalent across live batches, replay and edited endpoints', async () => {
  const document = createDocument(), plate = createNode('box')
  plate.parameters = { ...plate.parameters, width: 60, depth: 40, height: 10 }; plate.transform.position = vec3(0, 0, 5); document.nodes = [plate]
  const incremental = new VolumeEvaluator()
  try {
    let previous = vec3(-20, 0, 9)
    for (let i = 0; i <= 20; i++) {
      const center = vec3(-20 + i * 2, Math.sin(i / 5) * 4, 9)
      document.sculptStrokes.push({ id: String(i), nodeId: plate.id, mode: 'add', center, sweepFrom: previous, radius: 3, strength: .5, createdAt: '' })
      previous = center
      const live = await incremental.evaluate(document)
      if (i % 5 === 0) expect(live.volume).toBeCloseTo((await evaluate(document)).volume, 6)
    }
    const changed = structuredClone(document)
    changed.sculptStrokes[5]!.sweepFrom!.z -= 1
    const edited = await incremental.evaluate(changed)
    expect(incremental.lastEvaluation.reused).toBe(false)
    expect(edited.volume).toBeCloseTo((await evaluate(changed)).volume, 6)
  } finally { incremental.dispose() }
})
