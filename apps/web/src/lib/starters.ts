import {createDocument,createNode,vec3,type ModelNode} from '@formforge/model'
import {functionalRecipe,type FunctionalRecipe} from './functionalRecipes'
import {createFitCoupon} from './cadRecipes'
import {templateCatalog,type StarterId} from './templateCatalog'
export const starters=templateCatalog
export function createStarter(id:StarterId){
 const item=starters.find(s=>s.id===id);if(!item)throw new Error('Unknown starter.')
 let nodes:ModelNode[]
 if(['enclosure','bracket','adapter','snapfit'].includes(id))nodes=functionalRecipe(id as FunctionalRecipe,{width:80,depth:50,height:25,wall:2,clearance:.2})
 else if(id==='coupon')nodes=createFitCoupon({diameter:4,clearanceStart:.1,clearanceStep:.1,sampleCount:5,plateThickness:3,pinHeight:8,x:-22.25,y:-17,bottomZ:0}).nodes
 else {
  const groupId=crypto.randomUUID()
  const add=(kind:'box'|'cylinder',name:string,cut:boolean,x:number,y:number,z:number,p:Partial<ModelNode['parameters']>)=>{const n=createNode(kind,cut?'cut':'add',vec3(x,y,z));n.name=name;n.parameters={...n.parameters,...p};n.combined=true;n.groupId=groupId;return n}
  if(id==='washer')nodes=[add('cylinder','Spacer outer',false,0,0,2.5,{radius:15,height:5,segments:64}),add('cylinder','Spacer bore',true,0,0,2.5,{radius:4,height:7,segments:64})]
  else if(id==='tray')nodes=[add('box','Tray outer',false,0,0,7.5,{width:80,depth:60,height:15}),add('box','Tray cavity',true,0,0,9,{width:76,depth:56,height:14})]
  else nodes=[add('box','Cable plate',false,0,0,2,{width:60,depth:20,height:4}),...[-20,0,20].map((x,i)=>add('cylinder',`Cable opening ${i+1}`,true,x,0,2,{radius:3,height:6,segments:48}))]
 }
 return {...createDocument(),name:item.name,nodes}
}
