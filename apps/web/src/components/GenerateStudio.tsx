import { useEffect, useRef, useState } from 'react'
import { Braces, ImagePlus, LoaderCircle, Shapes, Upload, WandSparkles } from 'lucide-react'
import type { ModelNode } from '@formforge/model'
import { imageFileToReliefMesh, parseCadScript, promptToParametricNodes } from '@/lib/generative'
import { createGenerationSession, type GenerationSession } from '@/lib/generationSession'
import { importGlbData } from '@/lib/importers'
import { useEditor } from '@/store/editor'
import { WorkspaceDialog } from './WorkspaceDialog'
import './GenerateStudio.css'

type GenerateMode = 'recipes' | 'image' | 'script'
type JobStatus = { status: string; progress: number; message: string; error?: string }
type GenerationTask = { session: GenerationSession; jobId?: string }
const recipes = [
  { name: 'Open enclosure', keyword: 'enclosure', detail: '60 × 42 × 24 mm · rounded shell and cavity' },
  { name: 'Mounting enclosure', keyword: 'mount enclosure', detail: '60 × 42 × 24 mm · two 5 mm mounting holes' },
  { name: '20-tooth gear', keyword: 'gear', detail: '22 mm radius · 6 mm thick · no center hole' },
  { name: 'Twisted solid loft', keyword: 'loft', detail: '30 × 30 mm base · 48 mm tall · 18° twist' },
  { name: 'Coil', keyword: 'coil', detail: '12 mm coil radius · 2 mm wire radius · 7 turns' },
  { name: 'Support bracket', keyword: 'bracket', detail: '58 × 36 mm base · upright and two holes' },
] as const
const exampleScript = `# Dimensions and positions are in millimeters
roundedBox "Enclosure" 60 42 24 4
cut roundedBox "Cavity" 54 36 22 3 0 0 14
gear "Thumb wheel" 14 5 18 10 38 0 5`

function blobDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the image.'))
    reader.readAsDataURL(file)
  })
}

async function normalizedImageUpload(file: File) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) { bitmap.close(); throw new Error('Image processing is unavailable in this browser.') }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close()
  const mimeType = file.type === 'image/jpeg' ? 'image/jpeg' : file.type === 'image/webp' ? 'image/webp' : 'image/png'
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not prepare the reference image.')), mimeType, 0.92))
  return { imageBase64: await blobDataUrl(blob), mimeType: blob.type }
}

async function readServiceResponse(response: Response): Promise<Record<string, unknown>> {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The cloud generation service is unavailable on this site. Local relief still works.')
  const value: unknown = await response.json()
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The generation service returned an invalid response. Try again later.')
  const data = value as Record<string, unknown>
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `The generation service could not complete the request (${response.status}).`)
  return data
}

function waitForPoll(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return }
    const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, 1600)
    signal.addEventListener('abort', abort, { once: true })
  })
}

export function GenerateStudio({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<GenerateMode>('recipes')
  const [recipeIndex, setRecipeIndex] = useState(0)
  const [script, setScript] = useState(exampleScript)
  const [image, setImage] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [provider, setProvider] = useState<'local' | 'trellis'>('local')
  const [cloudStatus, setCloudStatus] = useState<'checking' | 'available' | 'unavailable'>('checking')
  const [depth, setDepth] = useState('7')
  const [invert, setInvert] = useState(false)
  const [smooth, setSmooth] = useState(true)
  const [working, setWorking] = useState(false)
  const [job, setJob] = useState<JobStatus | null>(null)
  const [feedback, setFeedback] = useState<{ error?: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const activeTask = useRef<GenerationTask | null>(null)
  const mounted = useRef(false)
  const setNotice = useEditor((state) => state.setNotice)

  const cancelActiveTask = () => {
    const task = activeTask.current
    activeTask.current = null
    task?.session.cancel()
    if (task?.jobId) void fetch(`/api/ai/jobs/${encodeURIComponent(task.jobId)}`, { method: 'DELETE', keepalive: true }).catch(() => undefined)
  }
  const isCurrent = (task: GenerationTask) => mounted.current && activeTask.current === task && task.session.isCurrent(useEditor.getState().document.id)
  const close = () => { cancelActiveTask(); onClose() }
  const stop = () => {
    cancelActiveTask(); setWorking(false)
    setJob({ status: 'cancelled', progress: 0, message: 'Stopped. No result will be added to your project.' })
  }

  useEffect(() => {
    mounted.current = true
    const unsubscribe = useEditor.subscribe((state) => {
      const task = activeTask.current
      if (task && !task.session.isCurrent(state.document.id)) {
        cancelActiveTask(); setWorking(false)
        setJob({ status: 'cancelled', progress: 0, message: 'Generation stopped because the active project changed. Start again in this project.' })
      }
    })
    return () => { mounted.current = false; unsubscribe(); cancelActiveTask() }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let disposed = false
    const timer = setTimeout(() => controller.abort(), 8000)
    void fetch('/api/ai/capabilities', { signal: controller.signal }).then(readServiceResponse).then((value) => {
      if (!disposed) setCloudStatus(value.trellis === true && value.externalService === true && typeof value.provider === 'string' && value.provider.length > 0 ? 'available' : 'unavailable')
    }).catch(() => { if (!disposed) setCloudStatus('unavailable') }).finally(() => clearTimeout(timer))
    return () => { disposed = true; clearTimeout(timer); controller.abort() }
  }, [])
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl) }, [imageUrl])

  const addParametric = (nodes: ModelNode[], label: string) => {
    const groupId = crypto.randomUUID()
    const grouped = nodes.map((node) => ({ ...node, combined: nodes.length > 1, groupId: nodes.length > 1 ? groupId : undefined, groupOperation: nodes.length > 1 ? 'boolean' as const : undefined }))
    const state = useEditor.getState()
    state.dispatch({ type: 'add-nodes', nodes: grouped })
    const selected = grouped.find((node) => node.boolean === 'add') ?? grouped[0]
    if (selected) { state.selectNode(selected.id); state.setTool('move') }
    setFeedback({ text: `${label} added: ${nodes.length} editable shape${nodes.length === 1 ? '' : 's'}. Close this window to adjust dimensions in Model. Undo removes this addition.` })
    setNotice(`${label} added to your project.`)
  }
  const addRecipe = () => {
    const recipe = recipes[recipeIndex]!
    try { addParametric(promptToParametricNodes(recipe.keyword), recipe.name) }
    catch (error) { setFeedback({ error: true, text: error instanceof Error ? error.message : 'This recipe could not be added.' }) }
  }
  const chooseImage = (file: File | null) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setFeedback({ error: true, text: 'Choose a PNG, JPEG, or WebP image up to 10 MB.' }); return }
    cancelActiveTask(); setWorking(false)
    setImage(file); setImageUrl(URL.createObjectURL(file)); setJob(null); setFeedback(null)
  }

  const generateImage = async () => {
    if (!image || working || (provider === 'trellis' && cloudStatus !== 'available')) return
    cancelActiveTask()
    const task: GenerationTask = { session: createGenerationSession(useEditor.getState().document.id) }
    activeTask.current = task
    setWorking(true); setFeedback(null)
    setJob({ status: 'generating', progress: 0, message: provider === 'local' ? 'Converting image brightness into a relief surface…' : 'Preparing the image for the configured cloud provider…' })
    const timeout = setTimeout(() => {
      if (!isCurrent(task)) return
      cancelActiveTask(); setWorking(false)
      setJob({ status: 'failed', progress: 0, message: 'Generation timed out. No model was added. Try a smaller image or use local relief.' })
    }, provider === 'local' ? 30000 : 10 * 60 * 1000)
    try {
      if (provider === 'local') {
        const options = `${depth === '3' ? 'subtle' : depth === '12' ? 'deep' : ''} ${invert ? 'recess' : ''} ${smooth ? '' : 'sharp'}`
        const mesh = await imageFileToReliefMesh(image, options)
        if (!isCurrent(task)) return
        useEditor.getState().importMesh(`${image.name.replace(/\.[^.]+$/, '')} relief`, mesh)
        setJob({ status: 'ready', progress: 100, message: 'Relief added as a polygon mesh. Review its scale and run Print checks before exporting.' })
        setNotice('Local image relief added. Nothing was uploaded.')
      } else {
        const upload = await normalizedImageUpload(image)
        if (!isCurrent(task)) return
        const created = await readServiceResponse(await fetch('/api/ai/models3d', { signal: task.session.signal, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...upload, resolution: '512', decimationTarget: 150000, textureSize: 1024 }) }))
        if (typeof created.id !== 'string' || !created.id) throw new Error('The generation service did not return a job. Try again later.')
        task.jobId = created.id
        if (!isCurrent(task)) { void fetch(`/api/ai/jobs/${encodeURIComponent(task.jobId)}`, { method: 'DELETE' }).catch(() => undefined); return }
        const jobPath = `/api/ai/jobs/${encodeURIComponent(task.jobId)}`
        for (;;) {
          await waitForPoll(task.session.signal)
          const value = await readServiceResponse(await fetch(jobPath, { signal: task.session.signal }))
          if (!isCurrent(task)) return
          if (typeof value.status !== 'string' || !['queued', 'preprocessing', 'generating-shape', 'extracting', 'ready', 'failed', 'cancelled'].includes(value.status) || typeof value.message !== 'string') throw new Error('The generation service returned an invalid job status. Try again later.')
          const status: JobStatus = { status: value.status, message: value.message, progress: typeof value.progress === 'number' && Number.isFinite(value.progress) ? Math.max(0, Math.min(100, value.progress)) : 0 }
          if (status.status === 'failed' || status.status === 'cancelled') throw new Error(typeof value.error === 'string' ? value.error : status.message)
          if (status.status === 'ready') break
          setJob(status)
        }
        setJob({ status: 'extracting', progress: 95, message: 'Loading the generated geometry into your project…' })
        const modelResponse = await fetch(`${jobPath}/model`, { signal: task.session.signal })
        if (!modelResponse.ok) throw new Error('Could not download the generated model. Try again later.')
        const data = await modelResponse.arrayBuffer()
        if (!isCurrent(task)) return
        const mesh = await importGlbData(data)
        if (!isCurrent(task)) return
        useEditor.getState().importMesh('TRELLIS.2 generated model', mesh)
        task.jobId = undefined
        setJob({ status: 'ready', progress: 100, message: 'Geometry added as a polygon mesh. Textures are not imported. Review scale, run Print checks, and inspect the result in your slicer.' })
        setNotice('Cloud-generated geometry added to your project.')
      }
    } catch (error) {
      if (isCurrent(task)) {
        setJob({ status: 'failed', progress: 0, message: error instanceof Error ? error.message : 'Generation failed. No model was added.' })
        if (task.jobId) void fetch(`/api/ai/jobs/${encodeURIComponent(task.jobId)}`, { method: 'DELETE' }).catch(() => undefined)
      }
    } finally {
      clearTimeout(timeout)
      if (isCurrent(task)) { activeTask.current = null; setWorking(false) }
    }
  }

  const runScript = () => {
    try { addParametric(parseCadScript(script), 'Script result') }
    catch (error) { setFeedback({ error: true, text: error instanceof Error ? error.message : 'The CAD script could not run.' }) }
  }

  return <WorkspaceDialog title="Create from a starting point" description="Add an editable recipe, an image relief, or a dimensioned CAD script to this project." onClose={close} className="generate-studio">
    <nav className="generate-tabs" aria-label="Creation methods">
      <button data-initial-focus aria-pressed={mode === 'recipes'} onClick={() => { setMode('recipes'); setFeedback(null) }}><Shapes size={17} /> Recipes</button>
      <button aria-pressed={mode === 'image'} onClick={() => { setMode('image'); setFeedback(null) }}><ImagePlus size={17} /> Image</button>
      <button aria-pressed={mode === 'script'} onClick={() => { setMode('script'); setFeedback(null) }}><Braces size={17} /> CAD script</button>
    </nav>

    {mode === 'recipes' && <section className="generate-recipe-section" aria-label="Local parametric recipes">
      <div className="generate-section-heading"><h3>Useful shapes, ready to adapt</h3><p>These are fixed local recipes, not AI prompt generation. Start with the dimensions shown, then edit each shape in Model or use a CAD script for exact sizes.</p></div>
      <div className="generate-recipes" role="group" aria-label="Choose a recipe">{recipes.map((recipe, index) => <button key={recipe.keyword} aria-pressed={recipeIndex === index} onClick={() => { setRecipeIndex(index); setFeedback(null) }}><strong>{recipe.name}</strong><span>{recipe.detail}</span></button>)}</div>
      <div className="generate-action-row"><span>Built in your browser. No upload or account needed.</span><button className="studio-primary" disabled={working} onClick={addRecipe}><Shapes size={17} /> Add {recipes[recipeIndex]!.name.toLowerCase()}</button></div>
    </section>}

    {mode === 'image' && <section className="generate-image-panel" aria-label="Create from an image">
      <div className="generate-image-source"><div className={`generate-image-drop ${imageUrl ? 'has-image' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseImage(event.dataTransfer.files[0] ?? null) }}>
        {imageUrl ? <img src={imageUrl} alt="Selected source image" /> : <><Upload size={28} /><strong>Choose a source image</strong><span>PNG, JPEG, or WebP · up to 10 MB</span></>}
        <button className="studio-secondary" onClick={() => fileRef.current?.click()}>{image ? 'Choose another image' : 'Browse images'}</button>
        <input ref={fileRef} hidden aria-label="Source image" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { chooseImage(event.target.files?.[0] ?? null); event.target.value = '' }} />
      </div>{image && <p className="generate-filename">{image.name}</p>}</div>
      <div className="generate-image-settings">
        <div className="generate-provider-options" role="group" aria-label="Image generation method">
          <button aria-pressed={provider === 'local'} disabled={working} onClick={() => { setProvider('local'); setJob(null) }}><strong>Local relief</strong><span>Image brightness becomes surface height</span><em>Available · stays on this device</em></button>
          <button aria-pressed={provider === 'trellis'} disabled={working || cloudStatus !== 'available'} onClick={() => { setProvider('trellis'); setJob(null) }}><strong>Cloud 3D · TRELLIS.2</strong><span>Optional image-to-mesh service</span><em>{cloudStatus === 'checking' ? 'Checking service availability…' : cloudStatus === 'available' ? 'Configured · uploads your image' : 'Unavailable on this site'}</em></button>
        </div>
        {cloudStatus === 'unavailable' && <p className="generate-note">This site has no available cloud generation service. Recipes, scripts, and local image relief work in your browser.</p>}
        {provider === 'local' ? <fieldset className="generate-relief-options" disabled={working}><legend>Relief settings</legend><label className="generate-depth"><span>Maximum relief height</span><select value={depth} onChange={(event) => setDepth(event.target.value)}><option value="3">3 mm · subtle</option><option value="7">7 mm · standard</option><option value="12">12 mm · deep</option></select></label><label><input type="checkbox" checked={invert} onChange={(event) => setInvert(event.target.checked)} /> Make dark areas higher</label><label><input type="checkbox" checked={smooth} onChange={(event) => setSmooth(event.target.checked)} /> Smooth the surface</label><p>Creates a 60 mm wide relief on a 1.6 mm base, sampled at up to 56 points along its longest side. This is a raised image, not a reconstruction of the pictured object.</p></fieldset> : <p className="generate-note">Generate uploads this image to the configured external provider. The result is a polygon mesh; textures are not imported. Check its size and geometry before printing.</p>}
        <div className="generate-image-actions"><button className="studio-primary" disabled={working || !image || (provider === 'trellis' && cloudStatus !== 'available')} onClick={() => void generateImage()}>{working ? <LoaderCircle size={17} className="generate-spinner" /> : <WandSparkles size={17} />}{working ? 'Creating…' : provider === 'local' ? 'Create local relief' : 'Upload & generate 3D'}</button>{working && <button className="studio-secondary" onClick={stop}>Stop</button>}</div>
      </div>
    </section>}

    {mode === 'script' && <section className="generate-script-panel" aria-label="Parametric CAD script">
      <div className="generate-section-heading"><h3>Set exact dimensions in a few lines</h3><p>One shape per line. Dimensions and X, Y, Z positions are in millimeters; twist is in degrees. Prefix a shape with <code>cut</code> or <code>intersect</code> to combine it with the solids in this script.</p></div>
      <label className="generate-script-field"><span>CAD commands</span><textarea spellCheck={false} rows={9} value={script} onChange={(event) => setScript(event.target.value)} /></label>
      <details className="generate-script-reference"><summary>Supported shape commands</summary><p>Use a quoted name. Optional X Y Z values set the shape’s center; omitted positions place its base at Z = 0.</p>{['box "Name" W D H [X Y Z]', 'roundedBox "Name" W D H corner [X Y Z]', 'cylinder "Name" radius H [X Y Z]', 'sphere "Name" radius [X Y Z]', 'gear "Name" radius H teeth rootRadius [X Y Z]', 'loft "Name" baseW baseD topW topD H twist [X Y Z]', 'spring "Name" coilRadius wireRadius H turns [X Y Z]'].map((command) => <code key={command}>{command}</code>)}</details>
      <div className="generate-action-row"><span>Local shape commands only. No JavaScript runs.</span><button className="studio-primary" disabled={working} onClick={runScript}><Braces size={17} /> Add script shapes</button></div>
    </section>}
    {feedback && <p className={`generate-feedback ${feedback.error ? 'error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    {job && <div className={`generate-job ${job.status}`} role={job.status === 'failed' ? 'alert' : 'status'}>{working && <LoaderCircle size={17} className="generate-spinner" />}<p>{job.message}</p>{working && mode !== 'image' && <button className="studio-secondary" onClick={() => setMode('image')}>View progress</button>}{working && job.progress > 0 && <progress aria-label="Cloud generation progress" value={job.progress} max={100} />}</div>}
    <p className="generate-session-note">Closing this window stops pending generation. Completed shapes remain in this project.</p>
  </WorkspaceDialog>
}
