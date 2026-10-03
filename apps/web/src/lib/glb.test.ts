import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { MeshPayload } from '@formforge/model'
import { exportGlb } from './exporters'
import { importGlbData } from './importers'

// Node supplies Blob but not the browser FileReader used by Three's real exporter.
class BlobReader {
  result: ArrayBuffer | string | null = null
  onloadend: (() => void) | null = null
  readAsArrayBuffer(blob: Blob) { void blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.() }) }
  readAsDataURL(blob: Blob) { void blob.arrayBuffer().then((result) => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.() }) }
}

const tetrahedron: MeshPayload = {
  positions: new Float32Array([-10, -20, 0, 10, -20, 0, -10, 20, 0, -10, -20, 60]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
  triangleCount: 4,
  volume: 8000,
}

beforeEach(() => {
  vi.stubGlobal('FileReader', BlobReader)
  vi.stubGlobal('ProgressEvent', class { constructor(public type: string) {} })
})
afterEach(() => vi.unstubAllGlobals())

describe('GLB interchange coordinates', () => {
  it('exports millimeter Z-up geometry as meter Y-up geometry in an actual GLB', async () => {
    const blob = await exportGlb(tetrahedron)
    const { scene } = await new GLTFLoader().parseAsync(await blob.arrayBuffer(), '')
    const bounds = new THREE.Box3().setFromObject(scene)
    const size = bounds.getSize(new THREE.Vector3())
    expect(size.x).toBeCloseTo(0.02, 6)
    expect(size.y).toBeCloseTo(0.06, 6)
    expect(size.z).toBeCloseTo(0.04, 6)
    expect(bounds.min.y).toBeCloseTo(0, 6)
    expect(Array.from(tetrahedron.positions)).toEqual([-10, -20, 0, 10, -20, 0, -10, 20, 0, -10, -20, 60])
  })

  it('imports a standard meter Y-up asset into millimeters on the Z-up workplane', async () => {
    const positions = new Float32Array([0, 0, 0, 0.02, 0, 0, 0, 0, -0.04, 0, 0.06, 0])
    const indices = new Uint16Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3])
    const binary = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)])
    const source = {
      asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      buffers: [{ byteLength: binary.length, uri: `data:application/octet-stream;base64,${binary.toString('base64')}` }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }, { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [0, 0, -0.04], max: [0.02, 0.06, 0] }, { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' }],
    }
    const result = await importGlbData(new TextEncoder().encode(JSON.stringify(source)).buffer)
    result.positions.forEach((coordinate, index) => expect(coordinate).toBeCloseTo(tetrahedron.positions[index]!, 4))
    expect(result.indices).toEqual(Array.from(tetrahedron.indices))
  })

  it('round trips an asymmetric solid through a binary GLB without changing its size or up axis', async () => {
    const result = await importGlbData(await (await exportGlb(tetrahedron)).arrayBuffer())
    result.positions.forEach((coordinate, index) => expect(coordinate).toBeCloseTo(tetrahedron.positions[index]!, 4))
    expect(result.indices).toEqual(Array.from(tetrahedron.indices))
  })
})
