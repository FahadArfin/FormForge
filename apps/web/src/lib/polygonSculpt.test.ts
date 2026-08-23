import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { splitMeshIntoConnectedComponents } from './componentMesh'
import { analyzeMesh } from './meshTools'
import { adaptiveSubdivideMesh, applyPolygonBrush, buildAdjacency, connectedVertexSet, createGrabWeights, subdivideMesh } from './polygonSculpt'

const tetrahedron = { positions: [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10], indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] }

describe('polygon sculpting', () => {
  it('subdivides without opening a watertight mesh', () => {
    const result = subdivideMesh(tetrahedron, 2)
    expect(result.indices.length / 3).toBe(64)
    expect(analyzeMesh(result).watertight).toBe(true)
  })

  it('adaptively adds detail only when long edges are inside the brush', () => {
    const untouched = adaptiveSubdivideMesh(tetrahedron, [new THREE.Vector3(100, 100, 100)], 2, 2)
    const refined = adaptiveSubdivideMesh(tetrahedron, [new THREE.Vector3(4, 0, 0)], 8, 2)
    expect(untouched).toBe(tetrahedron)
    expect(refined.indices.length).toBeGreaterThan(tetrahedron.indices.length)
    expect(analyzeMesh(refined).watertight).toBe(true)
  })

  it('moves unmasked vertices with a draw brush while preserving masked vertices', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(tetrahedron.positions, 3))
    geometry.setIndex(tetrahedron.indices)
    geometry.computeVertexNormals()
    const mask = new Float32Array([1, 0, 0, 0])
    const before = Array.from(geometry.getAttribute('position').array)
    const changed = applyPolygonBrush({ geometry, mode: 'draw', center: new THREE.Vector3(), normal: new THREE.Vector3(0, 0, 1), radius: 20, strength: 0.8, falloff: 'smooth', symmetry: { x: false, y: false, z: false }, mask, adjacency: buildAdjacency(tetrahedron.indices, 4) })
    const after = Array.from(geometry.getAttribute('position').array)
    expect(changed).toBeGreaterThan(0)
    expect(after.slice(0, 3)).toEqual(before.slice(0, 3))
    expect(after).not.toEqual(before)
  })

  it('mirrors a brush across the enabled local axes', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0], 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 3))
    applyPolygonBrush({ geometry, mode: 'draw', center: new THREE.Vector3(1, 0, 0), normal: new THREE.Vector3(0, 0, 1), radius: 0.4, strength: 1, falloff: 'flat', symmetry: { x: true, y: false, z: false }, mask: new Float32Array(2) })
    const positions = geometry.getAttribute('position')
    expect(positions.getZ(0)).toBeGreaterThan(0)
    expect(positions.getZ(1)).toBeGreaterThan(0)
  })

  it('paints a reversible per-vertex mask without moving geometry', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 3))
    const mask = new Float32Array(2)
    const before = Array.from(geometry.getAttribute('position').array)
    applyPolygonBrush({ geometry, mode: 'mask', center: new THREE.Vector3(), normal: new THREE.Vector3(0, 0, 1), radius: 0.4, strength: 1, falloff: 'flat', symmetry: { x: false, y: false, z: false }, mask })
    expect(mask[0]).toBeGreaterThan(0)
    expect(mask[1]).toBe(0)
    expect(Array.from(geometry.getAttribute('position').array)).toEqual(before)
  })

  it('can restrict deformation to camera-facing vertices', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.1, 0, 0], 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, -1], 3))
    applyPolygonBrush({ geometry, mode: 'inflate', center: new THREE.Vector3(), normal: new THREE.Vector3(0, 0, 1), radius: 1, strength: 1, falloff: 'flat', symmetry: { x: false, y: false, z: false }, mask: new Float32Array(2), frontFacesOnly: true, viewDirection: new THREE.Vector3(0, 0, 1) })
    const positions = geometry.getAttribute('position')
    expect(positions.getZ(0)).toBeGreaterThan(0)
    expect(positions.getZ(1)).toBe(0)
  })

  it('scales Grab displacement by brush strength instead of creating a full-distance spike', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 3))
    applyPolygonBrush({
      geometry,
      mode: 'grab',
      center: new THREE.Vector3(),
      normal: new THREE.Vector3(0, 0, 1),
      dragDelta: new THREE.Vector3(8, 0, 0),
      radius: 4,
      strength: 0.25,
      falloff: 'smooth',
      symmetry: { x: false, y: false, z: false },
      mask: new Float32Array(2),
      grabWeights: new Float32Array([1, 0.5]),
    })
    const positions = geometry.getAttribute('position')
    expect(positions.getX(0)).toBeCloseTo(2)
    expect(positions.getX(1)).toBeCloseTo(2)
  })

  it('keeps disconnected mesh islands independent for object and Grab edits', () => {
    const mesh = {
      positions: [0, 0, 0, .1, 0, 0, 0, .1, 0, .3, 0, 0, .4, 0, 0, .3, .1, 0],
      indices: [0, 1, 2, 3, 4, 5],
    }
    expect(splitMeshIntoConnectedComponents(mesh)).toHaveLength(2)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3))
    geometry.setIndex(mesh.indices)
    geometry.computeVertexNormals()
    const adjacency = buildAdjacency(mesh.indices, 6)
    const affectedVertices = connectedVertexSet(adjacency, 0)
    const beforeSecondIsland = Array.from(geometry.getAttribute('position').array).slice(9)
    const grabWeights = createGrabWeights(geometry, new THREE.Vector3(), 2, 'flat', { x: false, y: false, z: false }, affectedVertices)
    const changed = applyPolygonBrush({ geometry, mode: 'grab', center: new THREE.Vector3(), normal: new THREE.Vector3(0, 0, 1), dragDelta: new THREE.Vector3(1, 0, 0), radius: 2, strength: 1, falloff: 'flat', symmetry: { x: false, y: false, z: false }, mask: new Float32Array(6), adjacency, grabWeights, affectedVertices })
    expect(changed).toBe(3)
    expect(Array.from(geometry.getAttribute('position').array).slice(9)).toEqual(beforeSecondIsland)
  })
})
