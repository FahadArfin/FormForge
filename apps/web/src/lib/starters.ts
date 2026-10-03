import { createDocument } from '@formforge/model'
import { functionalRecipe, type FunctionalRecipe } from './functionalRecipes'
export const starters: {id:FunctionalRecipe;name:string;description:string;learn:string}[]=[
 {id:'enclosure',name:'Electronics enclosure',description:'80 × 50 × 25 mm body, separate lid and mounting bosses.',learn:'Edit shell dimensions, holes and lid clearance.'},
 {id:'bracket',name:'Mounting bracket',description:'An L bracket with mounting holes on both faces.',learn:'Explore grouped solids and subtractive holes.'},
 {id:'adapter',name:'Hollow adapter',description:'A tapered transition from 80 mm to 50 mm diameter.',learn:'Adjust the taper and the two nested shapes.'},
 {id:'snapfit',name:'Snap-fit test pair',description:'A cantilever and matching catch for small fit experiments.',learn:'Print a coupon to assess your material and tolerances.'},
]
export function createStarter(id:FunctionalRecipe){const item=starters.find(s=>s.id===id);if(!item)throw new Error('Unknown starter.');return {...createDocument(),name:item.name,nodes:functionalRecipe(id,{width:80,depth:50,height:25,wall:2,clearance:.2})}}
