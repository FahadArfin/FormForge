import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Braces, ImagePlus, LoaderCircle, MessageSquareText, Send, Sparkles, Upload, WandSparkles, X } from 'lucide-react'
import type { ModelNode } from '@formforge/model'
import { imageFileToReliefMesh, parseCadScript, promptToParametricNodes } from '@/lib/generative'
import { importGlbData } from '@/lib/importers'
import { useEditor } from '@/store/editor'

type GenerateMode = 'chat' | 'image' | 'script'
type Capabilities = { trellis: boolean; provider: string | null; externalService: boolean; localRelief: boolean }
type JobStatus = { status: string; progress: number; message: string; error?: string; modelUrl?: string }

const exampleScript = `# Safe, editable parametric CAD commands
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

export function GenerateStudio({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<GenerateMode>('chat')
  const [prompt, setPrompt] = useState('Make a rounded wall-mount enclosure with two mounting holes')
  const [script, setScript] = useState(exampleScript)
  const [image, setImage] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [provider, setProvider] = useState<'local' | 'trellis'>('local')
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [working, setWorking] = useState(false)
  const [job, setJob] = useState<JobStatus | null>(null)
  const [messages, setMessages] = useState<{ role: 'assistant' | 'user'; text: string }[]>([
    { role: 'assistant', text: 'Describe a printable object, upload a reference image, or open Script to build an exact parametric recipe.' },
  ])
  const fileRef = useRef<HTMLInputElement>(null)
  const dispatch = useEditor((state) => state.dispatch)
  const selectNode = useEditor((state) => state.selectNode)
  const setTool = useEditor((state) => state.setTool)
  const importMesh = useEditor((state) => state.importMesh)
  const setNotice = useEditor((state) => state.setNotice)

  useEffect(() => {
    void fetch('/api/ai/capabilities').then((response) => response.ok ? response.json() : null).then((value) => setCapabilities(value as Capabilities | null)).catch(() => setCapabilities({ trellis: false, provider: null, externalService: false, localRelief: true }))
  }, [])
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl) }, [imageUrl])

  const addParametric = (nodes: ModelNode[], response: string) => {
    const groupId = crypto.randomUUID()
    const grouped = nodes.map((node) => ({ ...node, combined: nodes.length > 1, groupId: nodes.length > 1 ? groupId : undefined, groupOperation: nodes.length > 1 ? 'boolean' as const : undefined }))
    dispatch({ type: 'add-nodes', nodes: grouped })
    const selected = grouped.at(-1)
    if (selected) { selectNode(selected.id); setTool('move') }
    setMessages((current) => [...current, { role: 'assistant', text: response }])
    setNotice(`${nodes.length} editable parametric feature${nodes.length === 1 ? '' : 's'} generated.`)
  }

  const generatePrompt = () => {
    if (!prompt.trim()) return
    setMessages((current) => [...current, { role: 'user', text: prompt.trim() }])
    try {
      const nodes = promptToParametricNodes(prompt)
      addParametric(nodes, `I created ${nodes.length} editable feature${nodes.length === 1 ? '' : 's'} from that request. Select a feature to change its exact dimensions, modifiers, material, or Boolean role.`)
    } catch (error) { setMessages((current) => [...current, { role: 'assistant', text: error instanceof Error ? error.message : 'I could not build that design.' }]) }
  }

  const chooseImage = (file: File | null) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setNotice('Choose a PNG, JPEG, or WebP image up to 10 MB.'); return }
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImage(file); setImageUrl(URL.createObjectURL(file)); setJob(null)
  }

  const generateLocalRelief = async () => {
    if (!image) { setNotice('Upload a reference image first.'); return }
    setWorking(true); setJob({ status: 'generating', progress: 35, message: 'Sampling the image into a watertight height field' })
    try {
      const mesh = await imageFileToReliefMesh(image, prompt)
      importMesh(`${image.name.replace(/\.[^.]+$/, '')} relief`, mesh)
      setJob({ status: 'ready', progress: 100, message: 'Printable relief imported as an editable polygon mesh' })
      setMessages((current) => [...current, { role: 'assistant', text: 'The image was converted locally into a closed relief mesh. Nothing was uploaded to an external service.' }])
      setNotice('Local image relief generated and imported.')
    } catch (error) { setJob({ status: 'failed', progress: 100, message: error instanceof Error ? error.message : 'Relief generation failed' }) }
    finally { setWorking(false) }
  }

  const generateTrellis = async () => {
    if (!image) { setNotice('Upload a reference image first.'); return }
    if (!capabilities?.trellis) { setNotice('TRELLIS.2 is not configured. Local Relief remains available.'); return }
    setWorking(true); setJob({ status: 'queued', progress: 2, message: 'Sending the approved image to the configured TRELLIS.2 provider' })
    try {
      const upload = await normalizedImageUpload(image)
      const response = await fetch('/api/ai/models3d', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...upload, resolution: '512', decimationTarget: 150000, textureSize: 1024 }) })
      const created = await response.json() as { id?: string; error?: string }
      if (!response.ok || !created.id) throw new Error(created.error ?? 'Could not start TRELLIS.2.')
      let status: JobStatus
      do {
        await new Promise((resolve) => setTimeout(resolve, 1600))
        const poll = await fetch(`/api/ai/jobs/${created.id}`)
        status = await poll.json() as JobStatus
        setJob(status)
      } while (!['ready', 'failed', 'cancelled'].includes(status.status))
      if (status.status !== 'ready' || !status.modelUrl) throw new Error(status.error ?? status.message)
      const modelResponse = await fetch(status.modelUrl)
      if (!modelResponse.ok) throw new Error('Could not download the generated GLB.')
      const mesh = await importGlbData(await modelResponse.arrayBuffer())
      importMesh('TRELLIS.2 generated model', mesh)
      setMessages((current) => [...current, { role: 'assistant', text: 'TRELLIS.2 returned a textured GLB. Its geometry is imported for editing; run Print checks before slicing because AI meshes may contain thin walls or small holes.' }])
      setNotice('TRELLIS.2 model generated and imported.')
    } catch (error) {
      setJob({ status: 'failed', progress: 100, message: error instanceof Error ? error.message : 'TRELLIS.2 generation failed' })
    } finally { setWorking(false) }
  }

  const runScript = () => {
    try { addParametric(parseCadScript(script), 'The script ran in the safe declarative CAD engine. Every result remains a normal editable feature—no untrusted JavaScript was executed.') }
    catch (error) { setNotice(error instanceof Error ? error.message : 'The CAD script could not run.') }
  }

  const providerCopy = useMemo(() => capabilities?.trellis ? `Connected to ${capabilities.provider}` : 'Requires a configured 24 GB+ CUDA worker or the optional Hugging Face Space adapter', [capabilities])

  return <div className="generate-backdrop" onMouseDown={onClose}>
    <section className="generate-studio" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span><Sparkles size={16} /> Generate Studio</span><strong>Idea, image, or code → editable 3D</strong></div><button onClick={onClose}><X size={18} /></button></header>
      <nav>
        <button className={mode === 'chat' ? 'active' : ''} onClick={() => setMode('chat')}><MessageSquareText size={15} /> Chat to CAD</button>
        <button className={mode === 'image' ? 'active' : ''} onClick={() => setMode('image')}><ImagePlus size={15} /> Image to 3D</button>
        <button className={mode === 'script' ? 'active' : ''} onClick={() => setMode('script')}><Braces size={15} /> Parametric script</button>
      </nav>

      {mode === 'chat' && <div className="generate-chat-layout">
        <div className="generate-messages">{messages.map((message, index) => <article key={index} className={message.role}><i>{message.role === 'assistant' ? <Bot size={15} /> : <MessageSquareText size={15} />}</i><p>{message.text}</p></article>)}</div>
        <aside><strong>Try a printable request</strong>{['A wall-mount electronics enclosure', 'A 20-tooth gear', 'A tapered twisted vase', 'A spring-loaded stand'].map((example) => <button key={example} onClick={() => setPrompt(example)}>{example}</button>)}</aside>
        <footer><textarea rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe dimensions, holes, shape, and print intent…" /><button onClick={generatePrompt}><Send size={16} /> Generate editable design</button></footer>
      </div>}

      {mode === 'image' && <div className="generate-image-layout">
        <div className={`generate-drop ${imageUrl ? 'has-image' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseImage(event.dataTransfer.files[0] ?? null) }}>
          {imageUrl ? <img src={imageUrl} alt="3D generation reference" /> : <><Upload size={30} /><strong>Drop a clean object image</strong><span>PNG, JPEG, or WebP · 10 MB maximum</span></>}
          <button onClick={() => fileRef.current?.click()}>{image ? 'Choose another image' : 'Browse images'}</button>
          <input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseImage(event.target.files?.[0] ?? null)} />
        </div>
        <div className="generate-image-controls">
          <label><span>Modeling instructions</span><textarea rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Deep relief, smooth surface, preserve silhouette…" /></label>
          <div className="provider-cards">
            <button className={provider === 'local' ? 'active' : ''} onClick={() => setProvider('local')}><strong>Local Relief</strong><span>Instant, private, watertight height-map model</span><em>Always available</em></button>
            <button className={provider === 'trellis' ? 'active' : ''} onClick={() => setProvider('trellis')}><strong>TRELLIS.2</strong><span>Full single-image 3D with PBR materials</span><em className={capabilities?.trellis ? 'connected' : ''}>{providerCopy}</em></button>
          </div>
          {provider === 'trellis' && <p className="external-disclosure">TRELLIS.2 does not read the chat prompt—it uses the uploaded image. Generating sends that image to the configured external provider. The 3D result must be checked and repaired before printing.</p>}
          {job && <div className={`generate-progress ${job.status}`}><span><i style={{ width: `${job.progress}%` }} /></span><div>{working && <LoaderCircle size={14} />}<strong>{job.message}</strong><em>{job.progress}%</em></div></div>}
          <button className="generate-primary" disabled={working || !image} onClick={() => void (provider === 'local' ? generateLocalRelief() : generateTrellis())}><WandSparkles size={17} /> {working ? 'Generating…' : provider === 'local' ? 'Create printable relief' : 'Generate with TRELLIS.2'}</button>
        </div>
      </div>}

      {mode === 'script' && <div className="generate-script-layout">
        <div className="script-guide"><strong>FormForge declarative CAD</strong><p>One shape per line. Prefix with <code>cut</code> or <code>intersect</code>. Results are ordinary timeline features.</p><code>box name W D H [X Y Z]</code><code>roundedBox name W D H corner [X Y Z]</code><code>cylinder name radius H [X Y Z]</code><code>gear name radius H teeth root [X Y Z]</code><code>loft name baseW baseD topW topD H twist [X Y Z]</code><code>spring name coilR wireR H turns [X Y Z]</code></div>
        <textarea spellCheck={false} value={script} onChange={(event) => setScript(event.target.value)} />
        <footer><span>Safe AST parser · no network, DOM, credentials, or arbitrary JavaScript</span><button onClick={runScript}><Braces size={16} /> Run parametric script</button></footer>
      </div>}
    </section>
  </div>
}
