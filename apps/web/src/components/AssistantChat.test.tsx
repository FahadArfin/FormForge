// @vitest-environment jsdom
import {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {createDocument} from '@formforge/model'
import {AssistantChat} from './AssistantChat'
const data=vi.hoisted(()=>({doc:null as any,conversation:{projectId:'',messages:[] as any[],pending:undefined,loading:false,error:null},queue:vi.fn()}))
vi.mock('../store/editor',()=>({useEditor:(select:any)=>select({document:data.doc,selectedNodeIds:[]})}))
vi.mock('../lib/engineeringStudio',()=>({engineeringSession:{state:{}}}))
vi.mock('../lib/assistantConversation',()=>({useAssistantConversation:()=>data.conversation,loadConversation:vi.fn(),queueAssistantRequest:data.queue,cancelAssistantRequest:vi.fn(),receiveAssistantReply:vi.fn(),failAssistantRequest:vi.fn(),assistantHandoff:vi.fn()}))
vi.mock('../lib/assistantApi',()=>({isLocalAssistantHost:()=>false,assistantApi:vi.fn(),assistantDocument:vi.fn(),validatedAuthorizationUrl:vi.fn()}))
let host:HTMLDivElement,root:Root
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});Element.prototype.scrollIntoView=vi.fn();data.doc=createDocument();data.conversation.projectId=data.doc.id;data.conversation.messages=[];host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(async()=>{await act(async()=>root.unmount());host.remove()})
it('explains the manual ChatGPT handoff before a request is queued',async()=>{
 await act(async()=>root.render(<AssistantChat/>))
 expect(host.querySelector('[aria-label="ChatGPT handoff"]')?.textContent).toContain('adjacent ChatGPT')
 expect(host.querySelector('button[type="submit"]')?.textContent).toContain('Queue for ChatGPT')
 expect(data.queue).not.toHaveBeenCalled()
})
it('presents completed replies in human language without raw internal status',async()=>{
 data.conversation.messages=[{id:'reply',role:'assistant',source:'webmcp',status:'answered',text:'Ready to review.'}]
 await act(async()=>root.render(<AssistantChat/>))
 expect(host.querySelector('h2')?.textContent).toBe('Refine your design')
 expect(host.querySelector('.assistant-message header')?.textContent).toContain('Replied')
})
