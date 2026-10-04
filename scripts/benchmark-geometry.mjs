import { createServer } from 'vite'
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { cpus, platform, arch } from 'node:os'
import { IcosahedronGeometry } from 'three'

const server = await createServer({ root: resolve('apps/web'), configFile: resolve('apps/web/vite.config.ts'), server: { middlewareMode: true, watch: null }, appType: 'custom' })
try {
  const { createStarter } = await server.ssrLoadModule('/src/lib/starters.ts')
  const { createDocument, createNode } = await server.ssrLoadModule('/../../packages/model/src/index.ts')
  const { evaluate } = await server.ssrLoadModule('/src/geometry/geometry.worker.ts')
  const { analyzeOverhangs } = await server.ssrLoadModule('/src/lib/overhangs.ts')
  const dense = detail => {
    const geometry = new IcosahedronGeometry(30, detail), node = createNode('mesh'), positions = Array.from(geometry.attributes.position.array)
    node.mesh = { positions, indices: positions.map((_, i) => i).slice(0, positions.length / 3) }
    node.transform.position.z = 30; geometry.dispose()
    return { ...createDocument(), name: `Dense mesh ${detail}`, nodes: [node] }
  }
  const {runMechanicalCheck}=await server.ssrLoadModule('/src/geometry/mechanicalChecks.worker.ts')
  const rows = []
  for (const [name, document] of [['Enclosure', createStarter('enclosure')], ['Calibration coupon', createStarter('coupon')], ['Dense 20k triangles', dense(31)], ['Dense 205k triangles', dense(100)]]) {
    const times = [], slopes = []; let mesh
    for (let i = 0; i < 4; i++) {
      const start = performance.now(); mesh = await evaluate(document); times.push(performance.now() - start)
      const inspect = performance.now(); analyzeOverhangs(mesh, 45); slopes.push(performance.now() - inspect)
    }
    const checkStart=performance.now();let wallCheck;try{const result=await runMechanicalCheck({kind:'walls',mesh,target:1.2});wallCheck={milliseconds:+(performance.now()-checkStart).toFixed(1),sampled:result.sampled,accepted:result.accepted}}catch(error){wallCheck={refused:error.message}}
    rows.push({ wallCheck,name, inputTriangles: document.nodes.reduce((sum,n)=>sum+(n.mesh?.indices.length??0)/3,0), triangles: mesh.triangleCount, outputBytes: mesh.positions.byteLength + mesh.indices.byteLength, firstEvaluationMs: +times[0].toFixed(1), warmMedianMs: +times.slice(1).sort((a,b)=>a-b)[1].toFixed(1), overhangMedianMs: +slopes.slice(1).sort((a,b)=>a-b)[1].toFixed(1) })
  }
  const report = { generatedAt: new Date().toISOString(), runtime: process.version, system: `${platform()} ${arch()}`, cpu: cpus()[0]?.model, limitations: 'Local Node/Vite evaluation of the same Manifold kernel; excludes worker transfer, browser rendering, mobile hardware and field web vitals. First fixture includes cold WASM initialization. Subsequent fixtures share the kernel.', rows }
  await mkdir('docs/benchmarks', { recursive: true }); await writeFile('docs/benchmarks/2026-10-04-geometry.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally { await server.close() }
