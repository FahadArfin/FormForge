import type { MeshPayload } from '@formforge/model'
import { MAX_IMPORT_BYTES, validateImportMesh, type ImportMesh } from './importReview'

const MAX_VERTICES = 1_500_000
const MAX_FACES = 500_000
const MAX_LINE = 4096
const MAX_HEADER = 65_536
const decimal = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

/** Incremental line reader: never split an untrusted file into a giant token array. */
function reader(text: string, comments: boolean) {
  if (text.length > MAX_IMPORT_BYTES || new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error('Choose a mesh smaller than 25 MB.')
  let offset = 0
  return {
    get offset() { return offset },
    next(): string | null {
      while (offset < text.length) {
        let end = text.indexOf('\n', offset)
        if (end < 0) end = text.length
        if (end - offset > MAX_LINE) throw new Error('Mesh header or data line exceeds the 4,096 character limit.')
        const raw = text.slice(offset, end).replace(/\r$/, '')
        offset = end + 1
        const line = (comments ? raw.split('#', 1)[0]! : raw).trim()
        if (line) return line
      }
      return null
    },
  }
}

function count(value: string | undefined, maximum: number, label: string): number {
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`Invalid ${label} count.`)
  const result = Number(value)
  if (result > maximum) throw new Error('Mesh limit: 500,000 triangles and 1.5 million vertices. Simplify this mesh first.')
  return result
}

function number(value: string | undefined): number {
  if (!value || !decimal.test(value) || !Number.isFinite(Number(value))) throw new Error('Mesh coordinates and attributes must be finite decimal numbers.')
  return Number(value)
}

function face(tokens: string[], vertices: number, indices: number[]) {
  if (tokens[0] !== '3') throw new Error('Only triangle faces are supported. Triangulate polygon faces before importing.')
  if (tokens.length !== 4) throw new Error('Triangle faces must contain exactly three indices; face attributes are unsupported.')
  for (const token of tokens.slice(1)) {
    if (!/^\d+$/.test(token) || !Number.isSafeInteger(Number(token)) || Number(token) >= vertices) throw new Error('The mesh contains an invalid triangle index.')
    indices.push(Number(token))
  }
}

function requiredLine(input: ReturnType<typeof reader>) {
  const line = input.next()
  if (line === null) throw new Error('The mesh is truncated: missing vertex or face records.')
  return line.split(/\s+/)
}

/** ASCII OFF, xyz vertices and triangle faces. Colors and polygon faces require conversion. */
export function parseOff(text: string): ImportMesh {
  const input = reader(text, true)
  const magic = requiredLine(input)
  if (magic.shift() !== 'OFF') throw new Error('Choose plain ASCII OFF; colored and extended OFF variants are unsupported.')
  const counts = magic.length ? magic : requiredLine(input)
  if (counts.length !== 3) throw new Error('OFF needs vertex, face and edge counts.')
  const vertices = count(counts[0], MAX_VERTICES, 'vertex')
  const faces = count(counts[1], MAX_FACES, 'face')
  count(counts[2], Number.MAX_SAFE_INTEGER, 'edge') // OFF edge count is informational, never an allocation size.
  if (!vertices || !faces) throw new Error('The OFF mesh needs vertices and triangle faces.')
  const positions: number[] = [], indices: number[] = []
  for (let i = 0; i < vertices; i++) {
    const tokens = requiredLine(input)
    if (tokens.length !== 3) throw new Error('OFF vertices need exactly three coordinates; color attributes are unsupported.')
    positions.push(...tokens.map(number))
  }
  for (let i = 0; i < faces; i++) face(requiredLine(input), vertices, indices)
  if (input.next() !== null) throw new Error('Unexpected extra records after the OFF mesh.')
  return validateImportMesh({ positions, indices })
}

const integers: Record<string, readonly [number, number]> = {
  char: [-128, 127], int8: [-128, 127], uchar: [0, 255], uint8: [0, 255],
  short: [-32768, 32767], int16: [-32768, 32767], ushort: [0, 65535], uint16: [0, 65535],
  int: [-2147483648, 2147483647], int32: [-2147483648, 2147483647], uint: [0, 4294967295], uint32: [0, 4294967295],
}
const scalarType = (type: string) => Object.hasOwn(integers, type) || ['float', 'float32', 'double', 'float64'].includes(type)
function scalar(token: string, type: string) {
  const value = number(token), range = Object.hasOwn(integers, type) ? integers[type] : undefined
  if (range && (!Number.isInteger(value) || value < range[0] || value > range[1])) throw new Error('PLY scalar attribute exceeds its declared integer type.')
  if ((type === 'float' || type === 'float32') && !Number.isFinite(Math.fround(value))) throw new Error('PLY number exceeds its declared float type.')
  return value
}

/** ASCII PLY 1.0 only. Validate all declarations before reading any geometry records. */
export function parsePly(text: string): ImportMesh {
  const input = reader(text, false)
  if (input.next() !== 'ply') throw new Error('Missing PLY header.')
  if (input.next() !== 'format ascii 1.0') throw new Error('Only ASCII PLY 1.0 is supported. Convert binary PLY to ASCII first.')
  let element = '', vertices: number | undefined, faces: number | undefined, faceDeclared = false, ended = false
  let faceCountType = '', faceIndexType = ''
  const properties: { name: string; type: string }[] = []
  for (let lineIndex = 0; lineIndex < 256; lineIndex++) {
    const line = input.next()
    if (input.offset > MAX_HEADER) throw new Error('PLY header exceeds the 64 KiB limit.')
    if (line === null) break
    const tokens = line.split(/\s+/)
    if (tokens[0] === 'comment' || tokens[0] === 'obj_info') continue
    if (line === 'end_header') { ended = true; break }
    if (tokens[0] === 'element') {
      if (tokens.length !== 3) throw new Error('Invalid PLY element declaration in header.')
      element = tokens[1]!
      if (element === 'vertex' && vertices === undefined && faces === undefined) vertices = count(tokens[2], MAX_VERTICES, 'vertex')
      else if (element === 'face' && vertices !== undefined && faces === undefined) faces = count(tokens[2], MAX_FACES, 'face')
      else throw new Error('PLY requires one vertex element followed by one face element; other or duplicate elements are unsupported.')
    } else if (tokens[0] === 'property') {
      if (element === 'vertex') {
        if (tokens.length !== 3 || !scalarType(tokens[1]!)) throw new Error('PLY vertex properties must use supported scalar types; lists are unsupported.')
        if (properties.some(property => property.name === tokens[2])) throw new Error('Duplicate PLY vertex property.')
        if (properties.length >= 32) throw new Error('PLY supports up to 32 scalar vertex properties.')
        properties.push({ name: tokens[2]!, type: tokens[1]! })
      } else if (element === 'face') {
        if (faceDeclared || tokens.length !== 5 || tokens[1] !== 'list' || !Object.hasOwn(integers, tokens[2]!) || !Object.hasOwn(integers, tokens[3]!) || !['vertex_indices', 'vertex_index'].includes(tokens[4]!)) throw new Error('PLY faces support one integer vertex_indices list only; face attributes are unsupported.')
        faceCountType = tokens[2]!; faceIndexType = tokens[3]!; faceDeclared = true
      } else throw new Error('PLY property needs an element in the header.')
    } else throw new Error('Unsupported PLY header declaration.')
  }
  if (!ended) throw new Error('Missing end_header or PLY header exceeds 256 lines.')
  const axes = ['x', 'y', 'z'].map(axis => properties.findIndex(property => property.name === axis))
  if (axes.some(axis => axis < 0)) throw new Error('PLY vertices require x, y and z coordinate properties.')
  if (!vertices || !faces || !faceDeclared) throw new Error('PLY needs nonempty vertex and triangle face elements.')
  const positions: number[] = [], indices: number[] = []
  for (let i = 0; i < vertices; i++) {
    const tokens = requiredLine(input)
    if (tokens.length !== properties.length) throw new Error('PLY vertex record does not match its property count.')
    const values = tokens.map((token, index) => scalar(token, properties[index]!.type))
    positions.push(values[axes[0]!]!, values[axes[1]!]!, values[axes[2]!]!)
  }
  for (let i = 0; i < faces; i++) {
    const tokens = requiredLine(input)
    face(tokens, vertices, indices)
    scalar(tokens[0]!, faceCountType)
    for (const token of tokens.slice(1)) scalar(token, faceIndexType)
  }
  if (input.next() !== null) throw new Error('Unexpected extra records after the PLY mesh.')
  return validateImportMesh({ positions, indices })
}

/** Geometry-only coordinates remain in workspace millimeters; comments are advisory, not standardized unit metadata. */
export function serializeMesh(payload: MeshPayload, format: 'off' | 'ply'): string {
  const vertices = payload.positions.length / 3, faces = payload.indices.length / 3
  if (!Number.isInteger(vertices) || !Number.isInteger(faces) || vertices < 1 || faces < 1) throw new Error('Export needs complete vertices and triangle indices.')
  if (vertices > MAX_VERTICES || faces > MAX_FACES) throw new Error('Mesh export limit: 500,000 triangles and 1.5 million vertices.')
  // Validate without copying shared typed arrays or changing snapshot buffers.
  for (const value of payload.positions) if (!Number.isFinite(value) || Math.abs(value) > 1e7) throw new Error('Mesh coordinates must be finite and within 10 km.')
  for (const index of payload.indices) if (!Number.isInteger(index) || index < 0 || index >= vertices) throw new Error('Invalid triangle index in export.')
  const lines = format === 'off'
    ? ['OFF\n# Geometry only; coordinates in millimeters\n', `${vertices} ${faces} 0\n`]
    : [`ply\nformat ascii 1.0\ncomment Geometry only; coordinates in millimeters\nelement vertex ${vertices}\nproperty float x\nproperty float y\nproperty float z\nelement face ${faces}\nproperty list uchar int vertex_indices\nend_header\n`]
  let bytes = lines.reduce((sum, line) => sum + line.length, 0)
  const append = (line: string) => {
    bytes += line.length
    if (bytes > MAX_IMPORT_BYTES) throw new Error('ASCII mesh export exceeds 25 MB. Simplify the mesh or use binary STL.')
    lines.push(line)
  }
  for (let i = 0; i < payload.positions.length; i += 3) append(`${payload.positions[i]} ${payload.positions[i + 1]} ${payload.positions[i + 2]}\n`)
  for (let i = 0; i < payload.indices.length; i += 3) append(`3 ${payload.indices[i]} ${payload.indices[i + 1]} ${payload.indices[i + 2]}\n`)
  return lines.join('')
}
