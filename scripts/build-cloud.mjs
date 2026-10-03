import { pathToFileURL } from 'node:url'
import { readdir,readFile,mkdir,writeFile } from 'node:fs/promises'
import { resolve,relative,extname } from 'node:path'
import { createHash } from 'node:crypto'
import { build } from 'rolldown'
const root=resolve('dist'),assets={}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.wasm':'application/wasm','.json':'application/json','.webmanifest':'application/manifest+json','.ico':'image/x-icon'}
async function collect(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(e.name==='server'||e.name.startsWith('.'))continue;const path=resolve(dir,e.name);if(e.isDirectory())await collect(path);else{const data=await readFile(path);assets['/'+relative(root,path).replaceAll('\\','/')]={base64:data.toString('base64'),type:types[extname(path)]??'application/octet-stream',etag:'"'+createHash('sha256').update(data).digest('hex')+'"'}}}}
await collect(root)
await mkdir(resolve(root,'server'),{recursive:true})
await build({input:'apps/cloud/src/worker.ts',platform:'browser',plugins:[{name:'formforge-static-assets',resolveId(id){if(id==='virtual:formforge-assets')return '\0formforge-assets'},load(id){if(id==='\0formforge-assets')return `export default ${JSON.stringify(assets)}`}}],output:{file:'dist/server/index.js',format:'esm',minify:true}})
await writeFile('dist/server/asset-manifest.json',JSON.stringify(Object.fromEntries(Object.entries(assets).map(([p,a])=>[p,a.etag])),null,2))
console.log(`Cloud Worker built with ${Object.keys(assets).length} public assets.`)

const worker=(await import(pathToFileURL(resolve('dist/server/index.js')).href)).default
if(typeof worker?.fetch!=='function')throw new Error('Worker fetch handler missing')
for(const [path,asset] of Object.entries(assets)){
 const response=await worker.fetch(new Request('https://preview.test'+path),{})
 const bytes=Buffer.from(await response.arrayBuffer())
 if(response.status!==200||'"'+createHash('sha256').update(bytes).digest('hex')+'"'!==asset.etag)throw new Error('Packaged asset mismatch: '+path)
}
const session=await worker.fetch(new Request('https://preview.test/api/cloud/session'),{DB:{},BUCKET:{}})
if(session.status!==200||(await session.json()).user!==null)throw new Error('Anonymous cloud session check failed')
if((await worker.fetch(new Request('https://preview.test/assets/missing.js'),{})).status!==404)throw new Error('Missing assets must return 404')
console.log('Verified every packaged asset and anonymous cloud routing.')
