import { afterEach, expect,it,vi } from 'vitest'
import {rememberOpenedProject,readLastOpenedProject} from './projectResume'
afterEach(()=>vi.unstubAllGlobals())
it('tracks the opened project independently of edit time and handles blocked storage',()=>{const data=new Map<string,string>();vi.stubGlobal('localStorage',{setItem:(k:string,v:string)=>data.set(k,v),getItem:(k:string)=>data.get(k)});rememberOpenedProject('newer');rememberOpenedProject('older');expect(readLastOpenedProject()).toBe('older');vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('blocked')},setItem:()=>{throw new Error('blocked')}});expect(()=>rememberOpenedProject('id')).not.toThrow();expect(readLastOpenedProject()).toBeNull()})
