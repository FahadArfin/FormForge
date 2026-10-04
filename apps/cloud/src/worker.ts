import assets from 'virtual:formforge-assets'
import { cloudApi, type Env } from './api'
export default {
  async fetch(request:Request,env:Env){
    const url=new URL(request.url)
    if(url.pathname.startsWith('/api/cloud/'))return cloudApi(request,env)
    if(url.pathname.startsWith('/api/'))return Response.json({error:'This optional legacy service is unavailable on this hosted site.'},{status:503,headers:{'Cache-Control':'no-store'}})
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405})
    const asset=assets[url.pathname==='/'?'/index.html':url.pathname]??(/^\/templates\/[a-z-]+\/?$/.test(url.pathname)?assets[url.pathname.replace(/\/$/,'')+'/index.html']:undefined)
    if(!asset)return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}})
    const headers={'Content-Type':asset.type,'Cache-Control':url.pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'public, max-age=0, must-revalidate','ETag':asset.etag,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}
    if(request.headers.get('If-None-Match')===asset.etag)return new Response(null,{status:304,headers})
    return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(asset.base64),c=>c.charCodeAt(0)),{headers})
  },
}
