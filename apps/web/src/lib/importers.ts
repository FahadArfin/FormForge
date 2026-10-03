import * as THREE from 'three'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { ModelNode } from '@formforge/model'

type MeshData = NonNullable<ModelNode['mesh']>

function geometryToMeshData(geometries: { geometry: THREE.BufferGeometry; matrix?: THREE.Matrix4 }[]): MeshData {
  const positions: number[] = []
  const indices: number[] = []
  let vertexOffset = 0

  for (const { geometry, matrix } of geometries) {
    const position = geometry.getAttribute('position')
    if (!position) continue
    const vector = new THREE.Vector3()
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      vector.fromBufferAttribute(position, vertex)
      if (matrix) vector.applyMatrix4(matrix)
      positions.push(vector.x, vector.y, vector.z)
    }
    const index = geometry.getIndex()
    if (index) {
      for (let i = 0; i < index.count; i += 1) indices.push(vertexOffset + index.getX(i))
    } else {
      for (let i = 0; i < position.count; i += 1) indices.push(vertexOffset + i)
    }
    vertexOffset += position.count
  }

  if (!positions.length || indices.length < 3) throw new Error('The file does not contain a triangle mesh.')
  const bounds = new THREE.Box3()
  const point = new THREE.Vector3()
  for (let i = 0; i < positions.length; i += 3) bounds.expandByPoint(point.set(positions[i]!, positions[i + 1]!, positions[i + 2]!))
  const center = bounds.getCenter(new THREE.Vector3())
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = positions[i]! - center.x
    positions[i + 1] = positions[i + 1]! - center.y
    positions[i + 2] = positions[i + 2]! - bounds.min.z
  }
  return { positions, indices }
}

export async function importMeshFile(file: File): Promise<MeshData> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'stl') {
    const geometry = new STLLoader().parse(await file.arrayBuffer())
    return geometryToMeshData([{ geometry }])
  }
  if (extension === 'obj') {
    const group = new OBJLoader().parse(await file.text())
    group.updateMatrixWorld(true)
    const geometries: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = []
    group.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) geometries.push({ geometry: (object as THREE.Mesh).geometry, matrix: object.matrixWorld.clone() })
    })
    return geometryToMeshData(geometries)
  }
  if (extension === 'glb' || extension === 'gltf') return importGlbData(await file.arrayBuffer())
  throw new Error('Choose an STL, OBJ, GLB mesh, or an editable .forge.json project.')
}

export async function importGlbData(data: ArrayBuffer): Promise<MeshData> {
  const result = await new GLTFLoader().parseAsync(data, '')
  result.scene.updateMatrixWorld(true)
  const toWorkspace = new THREE.Matrix4().makeRotationX(Math.PI / 2).scale(new THREE.Vector3(1000, 1000, 1000))
  const geometries: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = []
  result.scene.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) geometries.push({ geometry: (object as THREE.Mesh).geometry, matrix: toWorkspace.clone().multiply(object.matrixWorld) })
  })
  return geometryToMeshData(geometries)
}
