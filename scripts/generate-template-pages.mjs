import {createServer} from 'vite'
import {createElement} from 'react'
import {renderToString} from 'react-dom/server'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const origin='https://formforge.fwad101.chatgpt.site'
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
const server=await createServer({root:resolve('apps/web'),configFile:resolve('apps/web/vite.config.ts'),server:{middlewareMode:true,watch:null},appType:'custom'})
try{
 const {templateCatalog}=await server.ssrLoadModule('/src/lib/templateCatalog.ts'),{TemplatePage}=await server.ssrLoadModule('/src/components/TemplatePage.tsx'),index=await readFile('dist/index.html','utf8')
 for(const t of templateCatalog){
  const url=`${origin}/templates/${t.id}`,title=`${t.name} · Editable 3D printing template · FormForge`,description=`${t.description} Customize linked dimensions in your browser and export 3MF. ${t.printNote}`
  const metadata=`<link rel="canonical" href="${url}"/><meta property="og:type" content="website"/><meta property="og:title" content="${escape(title)}"/><meta property="og:description" content="${escape(description)}"/><meta property="og:url" content="${url}"/><meta property="og:image" content="${origin}/templates/${t.id}.svg"/>`
  const html=index.replace(/<title>.*?<\/title>/,`<title>${escape(title)}</title>`).replace(/<meta name="description"[^>]*>/,`<meta name="description" content="${escape(description)}"/>`).replace('</head>',metadata+'</head>').replace('<div id="root"></div>',`<div id="root">${renderToString(createElement(TemplatePage,{template:t}))}</div>`)
  await mkdir(`dist/templates/${t.id}`,{recursive:true});await writeFile(`dist/templates/${t.id}/index.html`,html)
 }
 await writeFile('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url>${templateCatalog.map(t=>`<url><loc>${origin}/templates/${t.id}</loc></url>`).join('')}</urlset>`)
 await writeFile('dist/robots.txt',`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`)
 console.log(`Prerendered ${templateCatalog.length} template pages with canonical metadata.`)
}finally{await server.close()}
