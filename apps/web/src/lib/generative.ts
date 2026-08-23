import { createNode, vec3, type ModelNode } from '@formforge/model'

export interface ReliefOptions {
  width?: number
  baseThickness?: number
  reliefHeight?: number
  invert?: boolean
  smooth?: boolean
}

export function imageDataToReliefMesh(image: Pick<ImageData, 'width' | 'height' | 'data'>, options: ReliefOptions = {}): NonNullable<ModelNode['mesh']> {
  const columns = image.width; const rows = image.height
  if (columns < 2 || rows < 2) throw new Error('The reference image is too small.')
  const width = Math.max(5, options.width ?? 60)
  const depth = width * rows / columns
  const base = Math.max(0.4, options.baseThickness ?? 1.6)
  const relief = Math.max(0.2, options.reliefHeight ?? 7)
  let heights = new Float32Array(columns * rows)
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
    const offset = (y * columns + x) * 4
    const luminance = ((image.data[offset] ?? 0) * 0.2126 + (image.data[offset + 1] ?? 0) * 0.7152 + (image.data[offset + 2] ?? 0) * 0.0722) / 255
    const alpha = (image.data[offset + 3] ?? 255) / 255
    const value = (options.invert ? 1 - luminance : luminance) * alpha
    heights[y * columns + x] = value
  }
  if (options.smooth) {
    const next = new Float32Array(heights.length)
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
      let sum = 0; let count = 0
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const sx = Math.max(0, Math.min(columns - 1, x + dx)); const sy = Math.max(0, Math.min(rows - 1, y + dy))
        sum += heights[sy * columns + sx]!; count += 1
      }
      next[y * columns + x] = sum / count
    }
    heights = next
  }

  const positions: number[] = []
  for (let layer = 0; layer < 2; layer += 1) for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
    positions.push((x / (columns - 1) - 0.5) * width, (y / (rows - 1) - 0.5) * depth, layer === 0 ? base + heights[y * columns + x]! * relief : 0)
  }
  const layerSize = columns * rows
  const indices: number[] = []
  for (let y = 0; y < rows - 1; y += 1) for (let x = 0; x < columns - 1; x += 1) {
    const a = y * columns + x; const b = a + 1; const d = (y + 1) * columns + x; const c = d + 1
    indices.push(a, b, d, b, c, d)
    indices.push(layerSize + a, layerSize + d, layerSize + b, layerSize + b, layerSize + d, layerSize + c)
  }
  const addWall = (a: number, b: number) => indices.push(b, a, layerSize + a, b, layerSize + a, layerSize + b)
  for (let x = 0; x < columns - 1; x += 1) addWall(x, x + 1)
  for (let y = 0; y < rows - 1; y += 1) addWall(y * columns + columns - 1, (y + 1) * columns + columns - 1)
  for (let x = columns - 1; x > 0; x -= 1) addWall((rows - 1) * columns + x, (rows - 1) * columns + x - 1)
  for (let y = rows - 1; y > 0; y -= 1) addWall(y * columns, (y - 1) * columns)
  return { positions, indices }
}

export async function imageFileToReliefMesh(file: File, prompt: string) {
  const bitmap = await createImageBitmap(file)
  const longest = 56
  const scale = longest / Math.max(bitmap.width, bitmap.height)
  const width = Math.max(8, Math.round(bitmap.width * scale)); const height = Math.max(8, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Image processing is unavailable in this browser.')
  context.clearRect(0, 0, width, height); context.drawImage(bitmap, 0, 0, width, height); bitmap.close()
  const lower = prompt.toLowerCase()
  return imageDataToReliefMesh(context.getImageData(0, 0, width, height), {
    invert: lower.includes('lithophane') || lower.includes('engrave') || lower.includes('recess'),
    smooth: !lower.includes('pixel') && !lower.includes('sharp'),
    reliefHeight: lower.includes('subtle') ? 3 : lower.includes('deep') ? 12 : 7,
  })
}

type ScriptKind = 'box' | 'roundedBox' | 'cylinder' | 'sphere' | 'gear' | 'loft' | 'spring'
const scriptKinds = new Set<ScriptKind>(['box', 'roundedBox', 'cylinder', 'sphere', 'gear', 'loft', 'spring'])

export function parseCadScript(source: string) {
  const nodes: ModelNode[] = []
  for (const [lineIndex, raw] of source.split(/\r?\n/).entries()) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue
    const tokens = line.match(/"[^"]*"|\S+/g)?.map((token) => token.replace(/^"|"$/g, '')) ?? []
    let boolean: ModelNode['boolean'] = 'add'
    if (tokens[0] === 'cut' || tokens[0] === 'intersect') boolean = tokens.shift() as ModelNode['boolean']
    const kind = tokens.shift() as ScriptKind
    if (!scriptKinds.has(kind)) throw new Error(`Line ${lineIndex + 1}: unknown shape "${kind || ''}".`)
    const name = tokens.shift() || kind
    const values = tokens.map(Number)
    if (values.some((value) => !Number.isFinite(value))) throw new Error(`Line ${lineIndex + 1}: dimensions must be numbers.`)
    const node = createNode(kind, boolean, vec3())
    node.name = name
    const p = node.parameters
    if (kind === 'box' || kind === 'roundedBox') {
      if (values.length < 3) throw new Error(`Line ${lineIndex + 1}: ${kind} needs width depth height.`)
      p.width = values[0]!; p.depth = values[1]!; p.height = values[2]!; if (kind === 'roundedBox') p.fillet = values[3] ?? p.fillet
      node.transform.position.z = p.height / 2
      values.splice(0, kind === 'roundedBox' ? 4 : 3)
    } else if (kind === 'cylinder' || kind === 'sphere') {
      if (!values.length) throw new Error(`Line ${lineIndex + 1}: ${kind} needs a radius${kind === 'cylinder' ? ' and height' : ''}.`)
      p.radius = values[0]!; if (kind === 'cylinder') p.height = values[1] ?? p.height
      node.transform.position.z = kind === 'sphere' ? p.radius : p.height / 2
      values.splice(0, kind === 'sphere' ? 1 : 2)
    } else if (kind === 'gear') {
      p.radius = values[0] ?? p.radius; p.height = values[1] ?? p.height; p.count = values[2] ?? p.count; p.radiusTop = values[3] ?? p.radius * 0.74
      node.transform.position.z = p.height / 2; values.splice(0, 4)
    } else if (kind === 'spring') {
      p.radius = values[0] ?? p.radius; p.radiusTop = values[1] ?? p.radiusTop; p.height = values[2] ?? p.height; p.count = values[3] ?? p.count
      node.transform.position.z = p.height / 2; values.splice(0, 4)
    } else {
      p.width = values[0] ?? p.width; p.depth = values[1] ?? p.depth; p.topWidth = values[2] ?? p.topWidth; p.topDepth = values[3] ?? p.topDepth; p.height = values[4] ?? p.height; p.twist = values[5] ?? p.twist
      node.transform.position.z = p.height / 2; values.splice(0, 6)
    }
    if (values.length >= 3) node.transform.position = { x: values[0]!, y: values[1]!, z: values[2]! }
    nodes.push(node)
  }
  if (!nodes.length) throw new Error('Add at least one shape command.')
  return nodes
}

export function promptToParametricNodes(prompt: string) {
  const text = prompt.toLowerCase()
  if (text.includes('gear')) return parseCadScript('gear "Generated gear" 22 6 20 16')
  if (text.includes('spring') || text.includes('coil')) return parseCadScript('spring "Generated spring" 12 2 38 7')
  if (text.includes('vase') || text.includes('bottle') || text.includes('loft')) return parseCadScript('loft "Generated loft" 30 30 16 16 48 18')
  if (text.includes('bracket') || text.includes('stand')) return parseCadScript('roundedBox "Base" 58 36 6 3\nroundedBox "Back" 58 6 34 3 0 15 20\ncut cylinder "Mount hole" 3 10 -20 0 3\ncut cylinder "Mount hole 2" 3 10 20 0 3')
  if (text.includes('enclosure') || text.includes('case') || text.includes('box')) {
    const enclosure = 'roundedBox "Enclosure outer" 60 42 24 4\ncut roundedBox "Enclosure cavity" 54 36 22 3 0 0 14'
    if (text.includes('hole') || text.includes('mount')) {
      return parseCadScript(`${enclosure}\ncut cylinder "Mounting hole left" 2.5 10 -22 0 5\ncut cylinder "Mounting hole right" 2.5 10 22 0 5`)
    }
    return parseCadScript(enclosure)
  }
  return parseCadScript('roundedBox "Generated form" 36 28 20 4\ncylinder "Feature" 8 28 0 0 20')
}
