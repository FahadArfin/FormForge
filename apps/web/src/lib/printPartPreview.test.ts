import { expect, it, vi } from 'vitest'
import { createDocument, createNode, type MeshPayload } from '@formforge/model'
import { evaluate } from '../geometry/geometry.worker'
import { applyPrintPart, previewPrintPart } from './printPartPreview'
import { printPartDefaults } from './printPartRecipes'

it('previews without touching the source and applies all nodes in one append', async () => {
  let current = createDocument()
  const original = current, append = vi.fn(nodes => { current = { ...current, nodes: [...current.nodes, ...nodes] } })
  const preview = await previewPrintPart(() => current, printPartDefaults.vent, new AbortController().signal, evaluate)
  expect(current).toBe(original)
  expect(current.nodes).toHaveLength(1)
  applyPrintPart(() => current, preview, append)
  expect(append).toHaveBeenCalledTimes(1)
  expect(current.nodes).toHaveLength(14)
  expect(current.nodes[0]).toBe(original.nodes[0])
  expect(() => applyPrintPart(() => current, preview, append)).toThrow(/changed/i)
  expect(append).toHaveBeenCalledTimes(1)
})

it('rejects a stale completion after an intervening project edit', async () => {
  let current = createDocument(), complete!: (mesh: MeshPayload) => void
  const mesh = await evaluate({ ...createDocument(), nodes: [createNode('box')] })
  const pending = previewPrintPart(() => current, printPartDefaults.boss, new AbortController().signal, () => new Promise(resolve => { complete = resolve }))
  current = { ...current, name: 'Renamed project' }
  complete(mesh)
  await expect(pending).rejects.toThrow(/project changed/i)
  expect(current.nodes).toHaveLength(1)
})

it('keeps cancellation and evaluator failure out of the project', async () => {
  const source = createDocument(), controller = new AbortController()
  const mesh = await evaluate(source)
  await expect(previewPrintPart(() => source, printPartDefaults.boss, controller.signal, async () => { controller.abort(); return mesh })).rejects.toMatchObject({ name: 'AbortError' })
  await expect(previewPrintPart(() => source, printPartDefaults.boss, new AbortController().signal, async () => { throw new Error('Worker timed out') })).rejects.toThrow('Worker timed out')
  expect(source.nodes).toHaveLength(1)
})

it('rejects empty and open meshes before enabling Apply', async () => {
  const source = createDocument(), options = printPartDefaults.bracket
  await expect(previewPrintPart(() => source, options, new AbortController().signal, async () => ({ positions: new Float32Array(), indices: new Uint32Array(), triangleCount: 0, volume: 0 }))).rejects.toThrow(/closed printable/)
  const mesh = await evaluate(source)
  await expect(previewPrintPart(() => source, options, new AbortController().signal, async () => ({ ...mesh, indices: mesh.indices.slice(3) }))).rejects.toThrow(/closed printable/)
})
