import type {ModelDocument} from '@formforge/model'
import {communitySeed,applyLocalCommunityNotes,type CommunityModel} from './community'
export interface PublicCommunityModel {id:string;title:string;description:string;category:string;tags:string[];license:string;creator:string;createdAt:string;remixOf?:string;owned:boolean;commentCount:number;image?:string}
export interface PublicCommunityComment {id:string;parent:string|null;author:string;body:string;createdAt:string;owned:boolean;canDelete:boolean;deleted:boolean}
export function publicCommunityModel(model:PublicCommunityModel,document?:ModelDocument):CommunityModel {
 return applyLocalCommunityNotes({...communitySeed[0]!,...model,public:true,creatorHandle:'@community',creatorAvatar:model.creator.slice(0,2).toUpperCase(),image:model.image??'',gallery:[],document,comments:[],reviewCount:0,rating:0})
}
