import {test,expect,type Page} from '@playwright/test'
const plan={version:1,title:'Cable organizer plate',requirements:['40 × 30 × 4 mm plate'],questions:[],assumptions:[],expectedChecks:['Check geometry'],operations:[{type:'create-feature',id:'chat-plate',kind:'box',name:'Cable plate',boolean:'add',position:{x:40,y:0,z:2},parameters:{width:40,depth:30,height:4}}]}
async function openChat(page:Page){await page.getByRole('button',{name:'Ask AI',exact:true}).click();await expect(page.getByRole('textbox',{name:'Describe your design',exact:true})).toBeVisible()}
async function mockRegistry(page:Page){await page.addInitScript(()=>{
 const tools=new Map();(window as any).__printlabTestTools=tools
 Object.defineProperty(document,'modelContext',{value:{registerTool(tool:any,options?:{signal:AbortSignal}){tools.set(tool.name,tool);options?.signal.addEventListener('abort',()=>{if(tools.get(tool.name)===tool)tools.delete(tool.name)})}},configurable:true})
})}
async function tool(page:Page,name:string,input:unknown={}){return page.evaluate(async({name,input})=>(window as any).__printlabTestTools.get(name).execute(input),{name,input})}

test('typed requests persist, receive WebMCP replies, preview and apply editable geometry',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await mockRegistry(page);await page.goto('/#studio');await openChat(page)
 await page.getByRole('textbox',{name:'Describe your design'}).fill('Make a 40 by 30 mm cable plate, 4 mm thick.')
 await page.getByRole('button',{name:'Queue design request'}).click();await expect(page.getByText('Waiting for ChatGPT.',{exact:false})).toBeVisible()
 await expect(page.getByRole('button',{name:'Queue design request'})).toBeDisabled()
 await expect.poll(async()=>{return page.evaluate(async()=>{const request=indexedDB.open('formforge');return new Promise(resolve=>{request.onsuccess=()=>{const db=request.result;const tx=db.transaction('assistantConversations');const q=tx.objectStore('assistantConversations').getAll();q.onsuccess=()=>{resolve(q.result.some((r:any)=>r.pending?.prompt.includes('cable plate')));db.close()}}})})}).toBe(true)
 await page.reload();await openChat(page);await expect(page.getByText('Make a 40 by 30 mm cable plate, 4 mm thick.',{exact:true})).toBeVisible()
 const context=await tool(page,'printlab_read_conversation');expect(context.pending.prompt).toContain('cable plate')
 const invalid=await tool(page,'printlab_reply_to_request',{requestId:context.pending.id,projectId:context.projectId,revision:context.revision,message:'Invalid',plan:{...plan,operations:[{type:'run-code',code:'alert(1)'}]}});expect(invalid.error).toBeTruthy()
 const reply=await tool(page,'printlab_reply_to_request',{requestId:context.pending.id,projectId:context.projectId,revision:context.revision,message:'I prepared an editable plate using your measurements. Preview it before applying.',plan});expect(reply.status).toBe('answered')
 await expect(page.getByText('I prepared an editable plate using your measurements. Preview it before applying.',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Preview proposal',exact:true})).toBeEnabled();const before=(await tool(page,'printlab_read_design')).nodes.length
 await page.getByRole('button',{name:'Preview proposal',exact:true}).click()
 if((page.viewportSize()?.width??1440)<981)await page.getByRole('button',{name:'Close assistant panel'}).click()
 await expect(page.getByRole('button',{name:'Apply proposal'})).toBeVisible();expect((await tool(page,'printlab_read_design')).nodes.length).toBe(before)
 await page.getByRole('button',{name:'Apply proposal'}).click();expect((await tool(page,'printlab_read_design')).nodes.length).toBe(before+1)
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await tool(page,'printlab_read_design')).nodes.length).toBe(before)
 await page.getByRole('button',{name:'Redo',exact:true}).click();await openChat(page)
 await page.getByRole('heading',{name:'Let’s build something.',exact:true}).scrollIntoViewIfNeeded()
 await page.screenshot({path:(page.viewportSize()?.width??1440)<981?'.audit/printlab-chat-phone.png':'.audit/printlab-chat-desktop.png'})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([])
})

test('cancelled chat requests reject late replies without changing the model',async({page})=>{
 await mockRegistry(page);await page.goto('/#studio');await openChat(page)
 await page.getByRole('textbox',{name:'Describe your design'}).fill('Review the selected part.');await page.getByRole('button',{name:'Queue design request'}).click()
 await expect(page.getByText('Waiting for ChatGPT.',{exact:false})).toBeVisible()
 const context=await tool(page,'printlab_read_conversation'),before=await tool(page,'printlab_read_design')
 await page.getByRole('button',{name:'Cancel request',exact:true}).click()
 const reply=await tool(page,'printlab_reply_to_request',{requestId:context.pending.id,projectId:context.projectId,revision:context.revision,message:'Late',plan})
 expect(reply.error).toMatch(/cancelled/);expect((await tool(page,'printlab_read_design')).nodes).toEqual(before.nodes)
 await expect(page.getByRole('log',{name:'Design conversation'})).toContainText('cancelled')
})

test('direct chat uses account model choices and retains explicit geometry Apply',async({page})=>{
 let payload:any
 await page.route('**/api/assistant/status',r=>r.fulfill({json:{available:true,csrfToken:'fixture-csrf',providers:{chatgpt:{enabled:true,connected:true,account:{id:'fixture-account',label:'Test account'},accounts:[{id:'fixture-account',label:'Test account',connected:true}],models:[{id:'fixture-fast',label:'Fast test model'},{id:'fixture-careful',label:'Careful test model'}],credentialStorage:'session-only'},local:{enabled:false,models:[]}}}}))
 await page.route('**/api/assistant/chat',async r=>{payload=r.request().postDataJSON();expect(r.request().headers()['x-printlab-csrf']).toBe('fixture-csrf');await r.fulfill({json:{message:'Here is your editable cable plate.',plan}})})
 await page.goto('/#studio');await openChat(page);await page.getByLabel('Assistant connection',{exact:true}).selectOption('chatgpt');await expect(page.getByLabel('Assistant model')).toBeEnabled()
 await page.getByLabel('Assistant model').selectOption('fixture-careful');await page.getByRole('textbox',{name:'Describe your design'}).fill('Create a cable plate with my measurements.');await page.getByRole('button',{name:'Send to assistant'}).click()
 await expect(page.getByText('Here is your editable cable plate.',{exact:true})).toBeVisible();expect(payload.model).toBe('fixture-careful');expect(payload.provider).toBe('chatgpt');expect(payload.document.nodes.length).toBeGreaterThan(0)
 await expect(page.getByRole('button',{name:'Preview proposal',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Apply proposal'})).toHaveCount(0)
})
