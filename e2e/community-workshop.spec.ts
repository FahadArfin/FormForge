import {test,expect,type Page} from '@playwright/test'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,readdirSync} from 'node:fs'
import {cloudApi,type Env,type Statement} from '../apps/cloud/src/api'

// Real Worker API and SQLite schema; only dispatcher identity is supplied by the local test harness.
async function communityServer(page:Page){
 const sqlite=new DatabaseSync(':memory:')
 for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(`drizzle/${name}`,'utf8'))
 class Query implements Statement{
  values:unknown[]=[];constructor(public sql:string){}bind(...values:unknown[]){this.values=values;return this}
  async first<T>(){return sqlite.prepare(this.sql).get(...this.values as any[]) as T??null}
  async all<T>(){return {results:sqlite.prepare(this.sql).all(...this.values as any[]) as T[]}}
  async run(){return {meta:{changes:Number(sqlite.prepare(this.sql).run(...this.values as any[]).changes)}}}
 }
 const env:Env={DB:{prepare:sql=>new Query(sql),async batch(queries){sqlite.exec('BEGIN');try{const results=[];for(const q of queries)results.push(await q.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}},BUCKET:{async put(){},async get(){return null},async delete(){}}}
 let user:string|null='test-maker'
 await page.route('**/api/cloud/**',async route=>{
  const incoming=route.request(),headers={...incoming.headers()}
  if(user){headers['oai-authenticated-user-id']=user;headers['oai-authenticated-user-email']='test@example.invalid'}
  const response=await cloudApi(new Request(incoming.url(),{method:incoming.method(),headers,body:incoming.postData()??undefined}),env)
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()})
 })
 return {signOut(){user=null},seedComments(){for(let i=0;i<55;i++)sqlite.prepare('INSERT INTO community_comments(id,model,owner,author,body,parent,created,deleted) VALUES (?,?,?,?,?,NULL,?,0)').run(`comment-${crypto.randomUUID()}`,'starter-tray','another-maker','Other Maker',`Earlier comment ${i}`,Date.now()-100000+i)},close:()=>sqlite.close()}
}
const noOverflow=async(page:Page)=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
test('tags combine, links retain filters, saved cards and concept discussions work',async({page})=>{
 const server=await communityServer(page)
 try{
  await page.goto('/#community')
  await page.getByRole('checkbox',{name:'#parametric 9',exact:true}).check()
  await page.getByRole('checkbox',{name:'#beginner 5',exact:true}).check()
  await expect(page.locator('.cw-card')).toHaveCount(5)
  await page.getByRole('radio',{name:'Ready to remix',exact:true}).check()
  await page.getByRole('button',{name:'View Mounting bracket',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Mounting bracket',exact:true})).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button',{name:'Remix in Studio',exact:true})).toBeEnabled()
  await page.getByRole('button',{name:'Back to browsing',exact:true}).click()
  await expect(page.locator('.cw-card')).toHaveCount(5)
  await page.getByRole('button',{name:'Save Mounting bracket',exact:true}).click()
  await page.getByRole('button',{name:'Saved',exact:true}).click()
  await expect(page.locator('.cw-card')).toHaveCount(1)
  await noOverflow(page)
  await page.goto('/#community?model=hex-wall&category=Tools&tab=comments')
  await expect(page.getByRole('heading',{name:'Conversation starts here'})).toBeVisible()
  await page.getByRole('button',{name:'My private notes (0)'}).click()
  await page.getByRole('textbox',{name:'Private note',exact:true}).fill('Measure the wall before building.')
  await page.getByRole('button',{name:'Save private note',exact:true}).click()
  await expect(page.locator('.cw-comment').getByText('Measure the wall before building.',{exact:true})).toBeVisible()
  await page.reload()
  await page.getByRole('button',{name:'My private notes (1)'}).click()
  await expect(page.locator('.cw-comment').getByText('Measure the wall before building.',{exact:true})).toBeVisible()
  await noOverflow(page)
 }finally{server.close()}
})

test('editable starter remix publishes a public source, comments and replies persist, author can remove',async({page})=>{
 const server=await communityServer(page)
 try{
  await page.goto('/#community?model=starter-washer')
  await page.getByRole('button',{name:'Remix in Studio',exact:true}).click()
  await expect(page.locator('.statusbar')).toContainText('triangles')
  // Leave through a normal navigation after automatic local save, then share the current project.
  await page.goto('/#community')
  await page.getByRole('button',{name:'Share a project',exact:true}).click()
  await expect(page.getByRole('dialog')).toContainText('Washer / spacer')
  await page.getByRole('textbox',{name:'Description',exact:true}).fill('A community integration test washer.')
  await page.getByRole('textbox',{name:'Model title',exact:true}).fill('Workshop test washer')
  await page.getByRole('radio',{name:/Public community/}).check()
  await page.getByRole('textbox',{name:'Public display name',exact:true}).fill('Test Maker')
  await page.getByRole('checkbox',{name:/I have permission/}).check()
  await page.getByRole('button',{name:'Publish publicly',exact:true}).click()
  await expect(page).toHaveURL(/model=shared-/)
  await expect(page.getByRole('heading',{name:'Workshop test washer',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Remix in Studio',exact:true})).toBeEnabled()
  const downloadPromise=page.waitForEvent('download')
  await page.getByRole('button',{name:'Download editable project',exact:true}).click()
  const download=await downloadPromise,downloaded=JSON.parse(readFileSync((await download.path())!,'utf8'))
  expect(downloaded.communitySource.modelId).toBe('starter-washer')
  expect(downloaded.nodes.length).toBe(2)
  await page.getByRole('button',{name:'Comments & questions',exact:true}).click()
  await page.getByRole('textbox',{name:'Your comment',exact:true}).fill('Can this be made thicker?')
  await page.getByRole('button',{name:'Post comment',exact:true}).click()
  await expect(page.locator('.cw-comment').getByText('Can this be made thicker?',{exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Remix in Studio',exact:true})).toBeEnabled()
  await page.getByRole('button',{name:'Reply',exact:true}).click()
  await page.getByRole('textbox',{name:'Your comment',exact:true}).fill('Yes, use the thickness parameter.')
  await page.getByRole('button',{name:'Post comment',exact:true}).click()
  await expect(page.locator('.cw-reply')).toContainText('Yes, use the thickness parameter.')
  await page.reload()
  await expect(page.locator('.cw-reply')).toContainText('Yes, use the thickness parameter.')
  await page.locator('.cw-comment').filter({has:page.getByText('Can this be made thicker?',{exact:true})}).first().getByRole('button',{name:'Remove',exact:true}).first().click()
  await page.getByRole('button',{name:'Remove comment',exact:true}).click()
  await expect(page.locator('.cw-comment').getByText('Deleted comment',{exact:true})).toBeVisible()
  await expect(page.locator('.cw-reply')).toContainText('Yes, use the thickness parameter.')
  await noOverflow(page)
 }finally{server.close()}
})

test('starter private notes reload and signed-out drafts stay separate from private notes',async({page})=>{
 const server=await communityServer(page);server.signOut()
 try{
  await page.goto('/#community?model=starter-tray&tab=comments')
  await page.getByRole('textbox',{name:'Your comment',exact:true}).fill('A public question draft')
  await expect(page.getByRole('link',{name:'Sign in with ChatGPT to post',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'My private notes (0)'}).click()
  await expect(page.getByRole('textbox',{name:'Private note',exact:true})).toHaveValue('')
  await page.getByRole('textbox',{name:'Private note',exact:true}).fill('Private measurements')
  await page.getByRole('button',{name:'Save private note',exact:true}).click()
  await expect(page.locator('.cw-comment')).toContainText('Private measurements')
  await page.reload()
  await expect(page.getByRole('textbox',{name:'Your comment',exact:true})).toHaveValue('A public question draft')
  await page.getByRole('button',{name:'My private notes (1)'}).click()
  await expect(page.locator('.cw-comment')).toContainText('Private measurements')
  await noOverflow(page)
 }finally{server.close()}
})


test('new posts remain visible beyond page one and pending requests protect drafts',async({page})=>{
 const server=await communityServer(page);server.seedComments()
 try{
  await page.goto('/#community?model=starter-tray&tab=comments')
  await expect(page.locator('.cw-comment')).toHaveCount(50)
  await page.getByRole('button',{name:'Load more comments',exact:true}).click()
  await expect(page.locator('.cw-comment')).toHaveCount(55)
  await page.getByRole('textbox',{name:'Public display name',exact:true}).fill('Test Maker')
  await page.getByRole('textbox',{name:'Your comment',exact:true}).fill('My latest idea belongs at the end.')
  let releaseRead:()=>void=()=>{}
  const readGate=new Promise<void>(resolve=>{releaseRead=resolve})
  await page.route('**/api/cloud/community/starter-tray/comments',async route=>{if(route.request().method()==='GET')await readGate;await route.fallback()})
  await page.getByRole('button',{name:'Refresh comments',exact:true}).click()
  await expect(page.getByRole('button',{name:'Post comment',exact:true})).toBeDisabled()
  releaseRead()
  await expect(page.getByRole('button',{name:'Post comment',exact:true})).toBeEnabled()
  await page.getByRole('button',{name:'Load more comments',exact:true}).click()
  await expect(page.locator('.cw-comment')).toHaveCount(55)
  // Delay only transport; the real Worker handles the resumed request.
  let release:()=>void=()=>{}
  const gate=new Promise<void>(resolve=>{release=resolve})
  await page.route('**/api/cloud/community/starter-tray/comments',async route=>{if(route.request().method()==='POST')await gate;await route.fallback()})
  await page.getByRole('button',{name:'Post comment',exact:true}).click()
  await expect(page.getByRole('textbox',{name:'Your comment',exact:true})).toBeDisabled()
  await expect(page.getByRole('button',{name:'My private notes (0)'})).toBeDisabled()
  release()
  await expect(page.locator('.cw-comment')).toHaveCount(56)
  await expect(page.locator('.cw-comment').getByText('My latest idea belongs at the end.',{exact:true})).toBeVisible()
  await page.locator('.cw-comment').filter({has:page.getByText('Earlier comment 54',{exact:true})}).getByRole('button',{name:'Reply',exact:true}).click()
  await page.getByRole('textbox',{name:'Your comment',exact:true}).fill('Reply on the second page stays visible.')
  await page.getByRole('button',{name:'Post comment',exact:true}).click()
  await expect(page.locator('.cw-reply').getByText('Reply on the second page stays visible.',{exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Studio',exact:true})).toBeVisible()
 }finally{server.close()}
})
