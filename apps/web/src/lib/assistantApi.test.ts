import {afterEach,expect,it,vi} from 'vitest'
import {createDocument,createNode} from '@formforge/model'
import {assistantApi,assistantDocument,isLocalAssistantHost,validatedAuthorizationUrl} from './assistantApi'
afterEach(()=>vi.unstubAllGlobals())
it('never offers direct local connections on a public or lookalike host',()=>{
 expect(isLocalAssistantHost('localhost')).toBe(true);expect(isLocalAssistantHost('127.0.0.1')).toBe(true)
 for(const host of ['formforge.fwad101.chatgpt.site','localhost.attacker.test','192.168.1.1'])expect(isLocalAssistantHost(host)).toBe(false)
})
it('only permits the official sign-in destination without retained token hints',()=>{
 expect(validatedAuthorizationUrl('https://auth.openai.com/api/accounts/authorize?state=abc')).toContain('state=abc')
 for(const url of ['javascript:alert(1)','https://evil.test/api/accounts/authorize','https://auth.openai.com.evil.test/api/accounts/authorize','https://auth.openai.com/api/accounts/authorize?id_token_hint=secret','https://user:secret@auth.openai.com/api/accounts/authorize','https://auth.openai.com/unexpected'])expect(()=>validatedAuthorizationUrl(url)).toThrow()
})
it('sends current features without old instruction history and refuses oversized context',()=>{
 const doc=createDocument();doc.engineering={version:1,history:[{title:'Private previous instruction',appliedAt:'now',operations:[],assumptions:[]}]}
 const result=assistantDocument(doc);expect(result.engineering?.history).toEqual([]);expect(doc.engineering.history).toHaveLength(1)
 doc.nodes=Array.from({length:129},()=>createNode('box'));expect(()=>assistantDocument(doc)).toThrow(/128/)
})
it('uses same-origin CSRF-protected requests and surfaces provider errors',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'Reconnect your account'}),{status:401,headers:{'content-type':'application/json'}}));vi.stubGlobal('fetch',fetcher)
 await expect(assistantApi('/chat',{body:{prompt:'hello'},csrfToken:'test-csrf'})).rejects.toThrow('Reconnect your account')
 expect(fetcher).toHaveBeenCalledWith('/api/assistant/chat',expect.objectContaining({credentials:'same-origin',method:'POST',headers:{'Content-Type':'application/json','X-PrintLab-CSRF':'test-csrf'}}))
})
it('explains unavailable local runtime when a static host returns HTML',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html/>',{headers:{'content-type':'text/html'}})))
 await expect(assistantApi('/status')).rejects.toThrow(/local PrintLab API/)
})

it('sends evaluated named values and refuses unresolved parameter errors',()=>{
 const doc=createDocument();doc.namedParameters=[{id:'thickness',name:'Thickness',expression:'4',value:3,unit:'mm'}]
 doc.nodes[0]!.parameterBindings={height:'Thickness'}
 const context=assistantDocument(doc)
 expect(context.namedParameters[0]?.value).toBe(4)
 expect(context.nodes[0]?.parameters.height).toBe(4)
 expect(doc.namedParameters[0]?.value).toBe(3)
 doc.namedParameters[0]!.expression='UnknownThickness'
 expect(()=>assistantDocument(doc)).toThrow(/parameter errors/)
})
