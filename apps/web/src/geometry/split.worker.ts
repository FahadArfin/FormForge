/// <reference lib="webworker" />
import Module, { type Manifold, type ManifoldToplevel } from 'manifold-3d'
import type { MeshPayload } from '@formforge/model'
export interface SplitPlane { axis: 'x' | 'y' | 'z'; offset: number }
export interface SplitParts { positive: MeshPayload; negative: MeshPayload }
export type SplitWorkerResponse = { ok: true; parts: SplitParts } | { ok: false; error: string }
let modulePromise: Promise<ManifoldToplevel> | null = null

function toPayload(solid: Manifold): MeshPayload {
  if (solid.status() !== 'NoError' || solid.isEmpty() || !(solid.volume() > 0)) throw new Error('The plane must leave a nonempty closed solid on both sides. Move it inside the model.')
  const mesh = solid.getMesh()
  if (mesh.triVerts.length > 3_000_000 || mesh.numVert > 1_000_000) throw new Error('The split result is too complex. Simplify the model before splitting it.')
  const positions = new Float32Array(mesh.numVert * 3)
  for (let vertex = 0; vertex < mesh.numVert; vertex += 1) {
    positions[vertex * 3] = mesh.vertProperties[vertex * mesh.numProp]!
    positions[vertex * 3 + 1] = mesh.vertProperties[vertex * mesh.numProp + 1]!
    positions[vertex * 3 + 2] = mesh.vertProperties[vertex * mesh.numProp + 2]!
  }
  return { positions, indices: new Uint32Array(mesh.triVerts), triangleCount: mesh.triVerts.length / 3, volume: solid.volume() }
}

/** Positive coordinates are >= offset, independent of the inspection view's side flip. */
export async function splitMeshAtPlane(mesh: MeshPayload, plane: SplitPlane): Promise<SplitParts> {
  if (!['x', 'y', 'z'].includes(plane.axis) || !Number.isFinite(plane.offset) || Math.abs(plane.offset) > 1_000_000) throw new Error('Choose a finite X, Y, or Z plane position within ±1,000,000 mm.')
  if (!mesh.positions.length || mesh.positions.length % 3 || !mesh.indices.length || mesh.indices.length % 3) throw new Error('A nonempty closed solid is required for splitting.')
  if (mesh.positions.length > 3_000_000 || mesh.indices.length > 3_000_000) throw new Error('Splitting supports up to one million vertices and triangles. Simplify the model first.')
  if (mesh.positions.some(value => !Number.isFinite(value)) || mesh.indices.some(value => value >= mesh.positions.length / 3)) throw new Error('The model contains invalid mesh coordinates or faces.')
  const coordinate = ['x', 'y', 'z'].indexOf(plane.axis)
  let min = Infinity; let max = -Infinity
  for (let i = coordinate; i < mesh.positions.length; i += 3) { min = Math.min(min, mesh.positions[i]!); max = Math.max(max, mesh.positions[i]!) }
  if (plane.offset <= min || plane.offset >= max) throw new Error('Move the plane strictly inside the model. Both sides must contain a solid.')
  const api = await (modulePromise ??= Module().then(api => { api.setup(); return api }))
  const input = new api.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices })
  input.merge()
  const solid = new api.Manifold(input)
  let halves: [Manifold, Manifold] | undefined
  try {
    if (solid.status() !== 'NoError' || solid.isEmpty() || !(solid.volume() > 0)) throw new Error('Splitting needs a closed manifold solid. Repair the source mesh and try again.')
    const normal: [number, number, number] = [0, 0, 0]; normal[coordinate] = 1
    halves = solid.splitByPlane(normal, plane.offset)
    return { positive: toPayload(halves[0]), negative: toPayload(halves[1]) }
  } finally { halves?.forEach(half => half.delete()); solid.delete() }
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = async (event: MessageEvent<{ mesh: MeshPayload; plane: SplitPlane }>) => {
    try {
      const parts = await splitMeshAtPlane(event.data.mesh, event.data.plane)
      const response: SplitWorkerResponse = { ok: true, parts }
      self.postMessage(response, { transfer: [parts.positive.positions.buffer, parts.positive.indices.buffer, parts.negative.positions.buffer, parts.negative.indices.buffer] })
    } catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'The model could not be split.' } satisfies SplitWorkerResponse) }
  }
}
