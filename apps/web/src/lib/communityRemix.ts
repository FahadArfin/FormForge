import {parseModelDocument,type ModelDocument} from '@formforge/model'
import type {CommunityModel} from './community'
export function createCommunityRemix(model:CommunityModel):ModelDocument{
 if(!model.document)throw new Error('This design does not include an editable project.')
 const source=parseModelDocument(structuredClone(model.document)),now=new Date().toISOString()
 return {...source,id:crypto.randomUUID(),name:`${model.title.slice(0,110)} — Remix`,revision:0,createdAt:now,updatedAt:now,communitySource:{modelId:model.id,title:model.title,creator:model.creator,license:model.license}}
}
