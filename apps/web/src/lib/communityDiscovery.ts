import {communitySeed, type CommunityModel, type CommunityRoute} from './community'
import {templateCatalog} from './templateCatalog'
import {createTemplateDocument} from './templateRecipes'

export const editableCommunitySeed:CommunityModel[]=templateCatalog.map((template,index)=>{
 const document=createTemplateDocument(template.id)
 document.id=`community-starter-${template.id}`
 document.createdAt=document.updatedAt='2026-10-12T00:00:00.000Z'
 document.nodes.forEach(node=>{node.color=['#a78bfa','#4ebdaf','#f1ad69','#eb8db0'][index%4]!})
 return {...communitySeed[0]!,id:`starter-${template.id}`,title:template.name,creator:'PrintLab',creatorHandle:'@printlab',creatorAvatar:'PL',image:'',gallery:[],document,description:`${template.description} ${template.learn}`,category:template.category==='Organization'?'Organization':template.category==='Enclosures'?'Electronics':'Tools',tags:[...new Set(['editable','parametric',template.level.toLowerCase(),...template.tags.split(' ')])].slice(0,10),license:'CC0',createdAt:document.createdAt,comments:[]}
})
export function isEditable(model:CommunityModel){return Boolean(model.document || model.public)}
export function filterCommunityModels(models:CommunityModel[],route:CommunityRoute,priority=new Set<string>()){
 const words=route.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
 return models.filter(model=>{
  const text=`${model.title} ${model.description} ${model.creator} ${model.category} ${model.tags.join(' ')}`.toLowerCase()
  return words.every(word=>text.includes(word)) && (!route.tags?.length||route.tags.every(tag=>model.tags.map(t=>t.toLowerCase()).includes(tag))) &&
   (!['Trending','New & Notable'].includes(route.category)?model.category===route.category:true) &&
   (route.kind==='editable'?isEditable(model):route.kind==='concept'?!isEditable(model):true)
 }).sort((a,b)=>route.sort==='Newest'?b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id):route.sort==='Most downloaded'?a.title.localeCompare(b.title):route.sort==='Most discussed'?(b.commentCount??0)-(a.commentCount??0)||a.title.localeCompare(b.title):route.page==='history'?0:Number(priority.has(b.id))-Number(priority.has(a.id))||Number(isEditable(b))-Number(isEditable(a))||a.title.localeCompare(b.title))
}
export function communityTags(models:CommunityModel[]){
 const counts=new Map<string,number>()
 for(const model of models)for(const tag of new Set(model.tags.map(t=>t.toLowerCase())))counts.set(tag,(counts.get(tag)??0)+1)
 return [...counts].map(([tag,count])=>({tag,count})).sort((a,b)=>b.count-a.count||a.tag.localeCompare(b.tag))
}
export {createCommunityRemix} from './communityRemix'
export function normalizeCommunityTags(text:string){return [...new Set(text.split(',').map(t=>t.trim().toLowerCase().replace(/\s+/g,'-')).filter(t=>/^[\p{L}\p{N}-]{1,32}$/u.test(t)))].slice(0,10)}
