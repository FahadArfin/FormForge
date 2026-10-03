import type {ModelNode} from '@formforge/model'
import { completeSelection } from './assemblies'
export const focusSelection=(nodes:ModelNode[],ids:string[])=>completeSelection(nodes,ids).filter(n=>!n.suppressed).map(n=>n.id)
export const overlapChoices=(nodes:ModelNode[],hits:string[])=>[...new Set(hits)].filter(id=>nodes.some(n=>n.id===id&&n.visible&&!n.locked&&!n.suppressed))
