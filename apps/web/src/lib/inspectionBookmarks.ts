import type {InspectionBookmark} from '@formforge/model'
import {useEditor} from '@/store/editor'
import {useInspection} from '@/store/inspection'
import {focusSelection} from './selectionFocus'
export function captureInspection():InspectionBookmark{
 const e=useEditor.getState(),i=useInspection.getState()
 return {section:{...i.section},displayMode:e.displayMode,showGrid:e.showGrid,showReferencePlanes:e.showReferencePlanes,xrayEnabled:e.xrayEnabled,showResult:e.showResult,focusIds:i.focus?.documentId===e.document.id?[...i.focus.ids]:[]}
}
export function restoreInspection(view:InspectionBookmark){
 const e=useEditor.getState(),ids=focusSelection(e.document.nodes,view.focusIds)
 useEditor.setState({displayMode:view.displayMode,showGrid:view.showGrid,showReferencePlanes:view.showReferencePlanes,xrayEnabled:view.xrayEnabled,showResult:ids.length?false:view.showResult})
 useInspection.setState({section:{...view.section},pickOverlaps:false,overhangs:false})
 useInspection.getState().setFocus(ids.length?{documentId:e.document.id,ids,wasResult:view.showResult}:null)
 if(view.focusIds.some(id=>!ids.includes(id)))e.setNotice('Some bookmarked shapes are missing or suppressed. Available shapes were restored.')
}
