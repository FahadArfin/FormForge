import * as THREE from 'three'
import { STLExporter } from 'three/addons/exporters/STLExporter.js'
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { strToU8, zipSync } from 'fflate'
import type { MeshPayload, ModelNode } from '@formforge/model'
import { nodeToWorldGeometry } from './modelGeometry'

export function meshPayloadToGeometry(payload: MeshPayload) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(payload.positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(payload.indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

function createExportMesh(payload: MeshPayload) {
  return new THREE.Mesh(meshPayloadToGeometry(payload), new THREE.MeshStandardMaterial({ color: '#7aa2ff' }))
}

export function exportStl(payload: MeshPayload) {
  const mesh = createExportMesh(payload)
  const data = new STLExporter().parse(mesh, { binary: true })
  mesh.geometry.dispose()
  return new Blob([data.buffer], { type: 'model/stl' })
}

export function exportObj(payload: MeshPayload) {
  const mesh = createExportMesh(payload)
  const data = new OBJExporter().parse(mesh)
  mesh.geometry.dispose()
  return new Blob([data], { type: 'text/plain' })
}

export async function exportGlb(payload: MeshPayload) {
  const mesh = createExportMesh(payload)
  // glTF uses meters and Y-up; the modeling workspace uses millimeters and Z-up.
  // Transform the export object rather than mutating the store's shared position buffer.
  mesh.scale.setScalar(0.001)
  mesh.rotation.x = -Math.PI / 2
  try {
    const result = await new GLTFExporter().parseAsync(mesh, { binary: true, onlyVisible: true })
    if (!(result instanceof ArrayBuffer)) throw new Error('Binary glTF export failed.')
    return new Blob([result], { type: 'model/gltf-binary' })
  } finally {
    mesh.geometry.dispose()
    mesh.material.dispose()
  }
}

const xmlEscape = (value: string) => value.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!)

export function export3mf(payload: MeshPayload, name: string) {
  const vertices: string[] = []
  for (let i = 0; i < payload.positions.length; i += 3) {
    vertices.push(`<vertex x="${payload.positions[i]}" y="${payload.positions[i + 1]}" z="${payload.positions[i + 2]}"/>`)
  }
  const triangles: string[] = []
  for (let i = 0; i < payload.indices.length; i += 3) {
    triangles.push(`<triangle v1="${payload.indices[i]}" v2="${payload.indices[i + 1]}" v3="${payload.indices[i + 2]}"/>`)
  }
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">${xmlEscape(name)}</metadata><resources><object id="1" type="model"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`
  const archive = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    '3D/3dmodel.model': strToU8(model),
  }, { level: 6 })
  const buffer = new ArrayBuffer(archive.byteLength)
  new Uint8Array(buffer).set(archive)
  return new Blob([buffer], { type: 'model/3mf' })
}

export function exportMultiColor3mf(nodes: ModelNode[], name: string) {
  const active = nodes.filter((node) => !node.suppressed)
  if (active.some((node) => node.boolean !== 'add' || node.groupOperation === 'hull' || Object.values(node.surface ?? {}).some((value) => value > 0))) throw new Error('Use standard 3MF to preserve holes, intersections, hulls, and surface modifiers. Multi-color export supports separate solid parts.')
  const printable = active.filter((node) => node.boolean === 'add')
  if (!printable.length) throw new Error('Add at least one visible solid before exporting.')
  const slotColors = new Map<number, string>()
  printable.forEach((node) => slotColors.set(node.materialSlot ?? 1, node.color))
  const slots = [...slotColors.keys()].sort((a, b) => a - b)
  const materialIndex = new Map(slots.map((slot, index) => [slot, index]))
  const bases = slots.map((slot) => `<base name="AMS ${slot}" displaycolor="${slotColors.get(slot)}FF"/>`).join('')
  const objects: string[] = []
  const items: string[] = []

  printable.forEach((node, nodeIndex) => {
    const geometry = nodeToWorldGeometry(node)
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()
    const vertices: string[] = []
    for (let vertex = 0; vertex < position.count; vertex += 1) vertices.push(`<vertex x="${position.getX(vertex)}" y="${position.getY(vertex)}" z="${position.getZ(vertex)}"/>`)
    const values = index ? Array.from(index.array) : Array.from({ length: position.count }, (_, value) => value)
    const triangles: string[] = []
    const pindex = materialIndex.get(node.materialSlot ?? 1) ?? 0
    // World-space vertices already include the reflection; restore outward winding in the exported mesh.
    const { scale } = node.transform
    const mirrored = scale.x * scale.y * scale.z < 0
    for (let triangle = 0; triangle < values.length; triangle += 3) triangles.push(`<triangle v1="${values[triangle]}" v2="${values[triangle + (mirrored ? 2 : 1)]}" v3="${values[triangle + (mirrored ? 1 : 2)]}" pid="5" p1="${pindex}"/>`)
    const id = nodeIndex + 6
    objects.push(`<object id="${id}" name="${xmlEscape(node.name)}" type="model"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object>`)
    items.push(`<item objectid="${id}"/>`)
    geometry.dispose()
  })

  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02" requiredextensions="m"><metadata name="Title">${xmlEscape(name)}</metadata><metadata name="Application">FormForge AMS 2</metadata><resources><m:basematerials id="5">${bases}</m:basematerials>${objects.join('')}</resources><build>${items.join('')}</build></model>`
  const archive = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    '3D/3dmodel.model': strToU8(model),
  }, { level: 6 })
  const buffer = new ArrayBuffer(archive.byteLength)
  new Uint8Array(buffer).set(archive)
  return new Blob([buffer], { type: 'model/3mf' })
}
