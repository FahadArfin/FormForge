import type { MeshPayload, ModelDocument } from '@formforge/model'
import * as THREE from 'three'

const cache = new Map<string, string>()
export const thumbnailKey = (document: ModelDocument) => `${document.id}:${document.revision}:${document.updatedAt}`
export const cachedProjectThumbnail = (document: ModelDocument) => cache.get(thumbnailKey(document))

/** One worker and renderer serve the whole library, then release their resources. */
export async function renderProjectThumbnails(documents: ModelDocument[], signal: AbortSignal, onThumbnail: (key: string, image: string | null) => void) {
  const pending = documents.filter((document) => !cache.has(thumbnailKey(document)))
  if (!pending.length || signal.aborted) return
  let renderer: THREE.WebGLRenderer | undefined
  let worker: Worker | undefined
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setSize(600, 390, false)
    renderer.setPixelRatio(1)
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.35
    worker = new Worker(new URL('../geometry/geometry.worker.ts', import.meta.url), { type: 'module' })
    for (const document of pending) {
      if (signal.aborted) break
      const key = thumbnailKey(document)
      if (!document.nodes.some((node) => node.visible && !node.suppressed)) { onThumbnail(key, null); continue }
      try {
        const mesh = await new Promise<MeshPayload>((resolve, reject) => {
          const timer = window.setTimeout(() => done(new Error('Preview took too long')), 15000)
          const abort = () => done(new DOMException('Preview cancelled', 'AbortError'))
          const done = (error?: Error, payload?: MeshPayload) => {
            window.clearTimeout(timer)
            signal.removeEventListener('abort', abort)
            if (error) reject(error)
            else resolve(payload!)
          }
          signal.addEventListener('abort', abort, { once: true })
          worker!.onmessage = (event: MessageEvent<MeshPayload & { ok: boolean; error?: string }>) => {
            if (event.data.ok) done(undefined, event.data)
            else done(new Error(event.data.error || 'Preview unavailable'))
          }
          worker!.onerror = () => done(new Error('Preview unavailable'))
          worker!.postMessage({ id: 1, document })
        })
        if (signal.aborted) break
        if (!mesh.positions.length) { onThumbnail(key, null); continue }
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
        geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1))
        geometry.computeVertexNormals()
        geometry.computeBoundingBox()
        const center = geometry.boundingBox!.getCenter(new THREE.Vector3())
        geometry.translate(-center.x, -center.y, -center.z)
        geometry.computeBoundingSphere()
        const radius = Math.max(geometry.boundingSphere?.radius ?? 1, 0.01)
        const color = document.nodes.find((node) => node.boolean === 'add' && node.visible)?.color || '#9b89e4'
        const material = new THREE.MeshStandardMaterial({ color, roughness: 0.46, metalness: 0.12, side: THREE.DoubleSide })
        const scene = new THREE.Scene()
        scene.add(new THREE.Mesh(geometry, material), new THREE.HemisphereLight('#ffffff', '#9b91b2', 2.8))
        const keyLight = new THREE.DirectionalLight('#ffffff', 3.8)
        keyLight.position.set(-radius, -radius * 2, radius * 3)
        scene.add(keyLight)
        const fillLight = new THREE.DirectionalLight('#c7b7ff', 1.2)
        fillLight.position.set(radius * 2, radius, radius)
        scene.add(fillLight)
        const frame = radius * 1.14
        const aspect = 600 / 390
        const camera = new THREE.OrthographicCamera(-frame * aspect, frame * aspect, frame, -frame, radius * 0.01, radius * 20)
        camera.up.set(0, 0, 1)
        camera.position.set(radius * 3, -radius * 4, radius * 3)
        camera.lookAt(0, 0, 0)
        try {
          renderer.render(scene, camera)
          const image = renderer.domElement.toDataURL('image/webp', 0.85)
          cache.set(key, image)
          while (cache.size > 80) cache.delete(cache.keys().next().value!)
          onThumbnail(key, image)
        } finally { geometry.dispose(); material.dispose() }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      } catch {
        if (!signal.aborted) onThumbnail(key, null)
        // Replace timed-out workers so late responses cannot be attributed to another project.
        worker.terminate()
        if (!signal.aborted) worker = new Worker(new URL('../geometry/geometry.worker.ts', import.meta.url), { type: 'module' })
      }
    }
  } catch {
    if (!signal.aborted) pending.forEach((document) => onThumbnail(thumbnailKey(document), null))
  } finally { worker?.terminate(); renderer?.dispose(); renderer?.forceContextLoss() }
}
