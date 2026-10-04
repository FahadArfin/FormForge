import {createServer} from 'vite'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const server=await createServer({root:resolve('apps/web'),configFile:resolve('apps/web/vite.config.ts'),server:{middlewareMode:true,watch:null},appType:'custom'})
try{
 const {starters,createStarter}=await server.ssrLoadModule('/src/lib/starters.ts')
 const {evaluate}=await server.ssrLoadModule('/src/geometry/geometry.worker.ts')
 await mkdir('apps/web/public/templates',{recursive:true})
 for(const item of starters){
  const mesh=await evaluate(createStarter(item.id)),p=mesh.positions,project=v=>[.7071*(v[0]-v[1]),.35355*(v[0]+v[1])-.866*v[2],.6124*(v[0]+v[1])+.5*v[2]],vertices=[]
  for(let n=0;n<p.length;n+=3)vertices.push(project([p[n],p[n+1],p[n+2]]))
  const xs=vertices.map(v=>v[0]),ys=vertices.map(v=>v[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),scale=Math.min(520/(maxX-minX),290/(maxY-minY)),faces=[]
  for(let n=0;n<mesh.indices.length;n+=3){const ids=Array.from(mesh.indices.slice(n,n+3)),v=ids.map(i=>vertices[i]),a=ids[0]*3,b=ids[1]*3,c=ids[2]*3,u=[p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2]],w=[p[c]-p[a],p[c+1]-p[a+1],p[c+2]-p[a+2]],normal=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],length=Math.hypot(...normal)
   if(!length||normal[0]*.6124+normal[1]*.6124+normal[2]*.5<=0)continue
   const light=Math.max(.35,(normal[0]*.3+normal[1]*.2+normal[2]*.85)/length),color=`rgb(${Math.round(70+light*38)},${Math.round(75+light*48)},${Math.round(156+light*70)})`
   faces.push({depth:v.reduce((sum,a)=>sum+a[2],0),svg:`<polygon points="${v.map(a=>`${(300+(a[0]-(minX+maxX)/2)*scale).toFixed(2)},${(200+(a[1]-(minY+maxY)/2)*scale).toFixed(2)}`).join(' ')}" fill="${color}" stroke="${color}" stroke-width=".9" stroke-linejoin="round"/>`})
  }
  faces.sort((a,b)=>a.depth-b.depth)
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" role="img"><title>${item.name.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</title><desc>Isometric rendering generated from the evaluated editable template, not a photo of a printed part.</desc>${faces.map(f=>f.svg).join('')}</svg>`
  await writeFile(`apps/web/public/templates/${item.id}.svg`,svg)
 }
 console.log(`Rendered ${starters.length} previews from evaluated template geometry.`)
}finally{await server.close()}
