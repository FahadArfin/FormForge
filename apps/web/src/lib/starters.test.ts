import { expect, it } from 'vitest'
import { parseModelDocument } from '@formforge/model'
import { starters, createStarter } from './starters'
it('creates distinct editable projects for every advertised starter',()=>{for(const item of starters){const a=createStarter(item.id),b=createStarter(item.id);expect(parseModelDocument(a).nodes.length).toBeGreaterThan(1);expect(a.nodes.some(n=>n.boolean==='cut')).toBe(true);expect(a.id).not.toBe(b.id);expect(a.nodes[0]!.id).not.toBe(b.nodes[0]!.id)}})
