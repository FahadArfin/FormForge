import { expect, it } from 'vitest'
import { parseModelDocument } from '@formforge/model'
import { starters, createStarter } from './starters'
import {findTemplates} from './templateCatalog'
import {evaluate} from '@/geometry/geometry.worker'
import {analyzeMesh} from './meshTools'
it('creates distinct editable projects for every advertised starter',()=>{for(const item of starters){const a=createStarter(item.id),b=createStarter(item.id);expect(parseModelDocument(a).nodes.length).toBeGreaterThan(1);expect(a.nodes.some(n=>n.boolean==='cut')).toBe(true);expect(a.id).not.toBe(b.id);expect(a.nodes[0]!.id).not.toBe(b.nodes[0]!.id)}})
it('finds practical templates by task and category',()=>{expect(findTemplates('hole gauge').map(t=>t.id)).toContain('coupon');expect(findTemplates('','Organization')).toHaveLength(2);expect(findTemplates('unlikely search')).toHaveLength(0)})
it.each(['coupon','washer','tray','cable-guide'] as const)('builds the %s template as closed printable geometry',async id=>{
 const document=parseModelDocument(createStarter(id)),mesh=await evaluate(document)
 expect(mesh.volume).toBeGreaterThan(0)
 expect(analyzeMesh({positions:Array.from(mesh.positions),indices:Array.from(mesh.indices)}).watertight).toBe(true)
 let minZ=Infinity;for(let i=2;i<mesh.positions.length;i+=3)minZ=Math.min(minZ,mesh.positions[i]!);expect(minZ).toBeCloseTo(0,4)
})
