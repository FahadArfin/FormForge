// @vitest-environment jsdom
import {expect,it} from 'vitest'
import {parseModelDocument} from '@formforge/model'
import {communitySeed,readCommunityRoute,communityRouteHash,loadCommunityModels,saveShowcaseModel} from './community'
import {filterCommunityModels,communityTags,createCommunityRemix,editableCommunitySeed} from './communityDiscovery'
it('round trips combined tags, kind and discussion URLs and normalizes hostile inputs',()=>{
 const route=readCommunityRoute('#community?tag=Storage&tag=storage&tag=desk&kind=editable&tab=comments')
 expect(route.tags).toEqual(['storage','desk']);expect(route.kind).toBe('editable');expect(route.tab).toBe('comments')
 expect(readCommunityRoute(communityRouteHash(route))).toEqual(route)
 expect(readCommunityRoute('#community?kind=bad&tag=&tab=bad').kind).toBe('all')
})
it('uses all selected tags and search words and keeps category/type independent',()=>{
 const route=readCommunityRoute('#community?tag=workshop&tag=wall&q=hex+organizer&category=Tools&kind=concept')
 expect(filterCommunityModels(communitySeed,route).map(m=>m.id)).toEqual(['hex-wall'])
 expect(filterCommunityModels(communitySeed,{...route,kind:'editable'})).toEqual([])
 expect(filterCommunityModels(communitySeed,{...route,tags:['wall','missing']})).toEqual([])
 expect(communityTags(communitySeed).find(t=>t.tag==='wall')?.count).toBe(1)
})
it('offers valid editable recipe geometry and preserves provenance through save/reload without touching source',()=>{
 localStorage.clear()
 expect(editableCommunitySeed).toHaveLength(8)
 for(const model of editableCommunitySeed){expect(parseModelDocument(model.document).nodes.length).toBeGreaterThan(0)}
 const original=editableCommunitySeed[0]!,before=JSON.stringify(original),copy=createCommunityRemix(original)
 expect(copy.id).not.toBe(original.document!.id)
 expect(copy.communitySource).toMatchObject({modelId:original.id,title:original.title,license:original.license})
 expect(parseModelDocument(copy).communitySource).toEqual(copy.communitySource)
 saveShowcaseModel({...original,id:'my-remix',creatorHandle:'@you',document:copy})
 expect(loadCommunityModels().find(m=>m.id==='my-remix')?.remixOf).toBe(original.id)
 expect(JSON.stringify(original)).toBe(before)
 expect(()=>createCommunityRemix(communitySeed[0]!)).toThrow(/editable/i)
})
