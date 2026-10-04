import {createServer} from 'node:http'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
const worker=(await import(pathToFileURL(resolve('dist/server/index.js')).href)).default
createServer(async(req,res)=>{try{const request=new Request(`http://127.0.0.1:4173${req.url}`,{method:req.method,headers:req.headers});const response=await worker.fetch(request,{});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch{res.writeHead(500);res.end('Preview server failed.')}}).listen(4173,'127.0.0.1',()=>console.log('Built FormForge preview: http://127.0.0.1:4173'))
