import { describe, expect, it } from 'vitest'
import { createDocument, createNode, modelDocumentSchema, vec3 } from '@formforge/model'
import { evaluate } from '../geometry/geometry.worker'
import { splitMeshAtPlane } from '../geometry/split.worker'
import { connectorDefaults } from '../geometry/splitConnectors'
import { decomposeParts } from '../geometry/parts.worker'
import { createSplitDocument } from './planeSplit'
import { meshBounds } from './importReview'
import { arrangeMesh } from './plateLayout'

describe('split connector export and arrangement integration', () => {
  for (const kind of ['dowel', 'dovetail'] as const) {
    it.each(['x', 'y', 'z'] as const)(`${kind} produces separate printable exports after a translated %s cut`, async axis => {
      const source = createDocument('Translated connector source')
      const node = createNode('box', 'add', vec3(12, -8, 28))
      node.parameters = { ...node.parameters, width: 40, depth: 40, height: 40 }
      source.nodes = [node]
      const options = { axis, offset: node.transform.position[axis], keep: 'both' as const, connector: connectorDefaults[kind] }
      const parts = await splitMeshAtPlane(await evaluate(source), options, options.connector)
      const meshes = [parts.positive, parts.negative, ...(parts.extras ?? []).map(part => part.mesh)]
      const replacement = createSplitDocument(source, parts, options)
      expect(modelDocumentSchema.safeParse(replacement).success).toBe(true)
      expect(replacement.nodes).toHaveLength(kind === 'dowel' ? 4 : 2)
      replacement.nodes.forEach((part, index) => {
        // Keep evaluated world-space mesh data unchanged; only placement transforms differ.
        expect(part.mesh!.positions).toEqual(Array.from(meshes[index]!.positions))
        expect(part.mesh!.indices).toEqual(Array.from(meshes[index]!.indices))
      })
      const exported = await evaluate(replacement)
      const separated = await decomposeParts(exported)
      expect(separated).toHaveLength(replacement.nodes.length)
      expect(separated.every(part => part.volume > 0)).toBe(true)
      expect(separated.reduce((sum, part) => sum + part.volume, 0)).toBeCloseTo(meshes.reduce((sum, part) => sum + part.volume, 0), 2)
      const bounds = separated.map(meshBounds).sort((a, b) => a.min.x - b.min.x)
      bounds.forEach((part, index) => {
        expect(part.min.z).toBeCloseTo(0, 4)
        if (index) expect(part.min.x - bounds[index - 1]!.max.x).toBeGreaterThanOrEqual(7.999)
      })
      const arranged = arrangeMesh(exported, { x: 256, y: 256, z: 256 })
      expect(arranged.parts).toHaveLength(replacement.nodes.length)
      expect(await decomposeParts(arranged.mesh)).toHaveLength(replacement.nodes.length)
    })
  }
})
