// @vitest-environment jsdom
import {beforeEach,expect,it} from 'vitest'
import {rememberCloudLink,readCloudLink,invalidateCloudLinks} from './saveHealth'
beforeEach(()=>localStorage.clear())
it('completing another document upload preserves the active document cloud link',()=>{
 const a={projectId:'pa',localId:'a',revision:1},b={projectId:'pb',localId:'b',revision:2}
 rememberCloudLink(b,'b');rememberCloudLink(a,'b')
 expect(readCloudLink('b')).toEqual(b);expect(readCloudLink('a')).toEqual(a)
})

it('invalidates every local copy of removed snapshots without clearing other backups',()=>{
 rememberCloudLink({projectId:'p',localId:'a',revision:1},'a');rememberCloudLink({projectId:'p',localId:'b',revision:2},'b');rememberCloudLink({projectId:'q',localId:'c',revision:1},'c')
 invalidateCloudLinks('p',[1]);expect(readCloudLink('a')).toBeNull();expect(readCloudLink('b')?.revision).toBe(2)
 invalidateCloudLinks('p');expect(readCloudLink('b')).toBeNull();expect(readCloudLink('c')?.projectId).toBe('q')
})
