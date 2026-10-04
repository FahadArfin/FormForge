import type {Vec3Value} from '@formforge/model'
import type {FitCalibration} from '@/lib/fitCalibration'
import { create } from 'zustand'
import type { SectionSettings } from '@/lib/sectionView'
import { useEditor } from './editor'

const defaultSection: SectionSettings = { enabled: false, axis: 'z', offset: 10, inverted: false }

export const useInspection = create<{
  projection:'perspective'|'orthographic'
  pendingFit:FitCalibration|null
  overhangs:boolean
  snapLabel:string
  setSnapLabel:(label:string)=>void
  focus: {documentId:string;ids:string[];wasResult:boolean}|null
  setFocus:(focus:{documentId:string;ids:string[];wasResult:boolean}|null)=>void
  pickOverlaps:boolean
  setPickOverlaps:(enabled:boolean)=>void
  anglePoints:Vec3Value[]
  setAnglePoints:(points:Vec3Value[])=>void
  circlePoints:Vec3Value[]
  setCirclePoints:(points:Vec3Value[])=>void
  measurementMode: 'surface' | 'vertex'
  setMeasurementMode: (mode: 'surface' | 'vertex') => void
  section: SectionSettings
  setSection: (patch: Partial<SectionSettings>) => void
  resetSection: () => void
}>((set) => ({
  projection:'perspective',
  snapLabel:'',setSnapLabel:snapLabel=>set({snapLabel}),
  pendingFit:null,overhangs:false,
  focus:null,setFocus:focus=>{
    const editor=useEditor.getState()
    if(focus?.documentId===editor.document.id){
      const ids=editor.selectedNodeIds.filter(id=>focus.ids.includes(id)&&editor.document.nodes.some(n=>n.id===id&&!n.suppressed&&n.visible))
      useEditor.setState({selectedNodeIds:ids,selectedNodeId:ids.includes(editor.selectedNodeId??'')?editor.selectedNodeId:ids.at(-1)??null,selectedMeshVertices:[],selectedMeshEdges:[],selectedMeshFaces:[]})
    }
    set({focus})
  },pickOverlaps:false,setPickOverlaps:pickOverlaps=>set({pickOverlaps}),
  anglePoints:[],setAnglePoints:anglePoints=>set({anglePoints}),
  circlePoints:[],setCirclePoints:circlePoints=>set({circlePoints}),
  measurementMode: 'vertex', setMeasurementMode: measurementMode => set(state => ({ measurementMode, circlePoints: state.measurementMode === measurementMode ? state.circlePoints : [] })),
  section: { ...defaultSection },
  setSection: patch => set(state => ({ section: { ...state.section, ...patch, offset: patch.offset !== undefined && Number.isFinite(patch.offset) ? Math.max(-100000, Math.min(100000, patch.offset)) : state.section.offset } })),
  resetSection: () => set({ section: { ...defaultSection } }),
}))
