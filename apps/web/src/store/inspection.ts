import type {Vec3Value} from '@formforge/model'
import type {FitCalibration} from '@/lib/fitCalibration'
import { create } from 'zustand'
import type { SectionSettings } from '@/lib/sectionView'

const defaultSection: SectionSettings = { enabled: false, axis: 'z', offset: 10, inverted: false }

export const useInspection = create<{
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
  measurementMode: 'surface' | 'vertex'
  setMeasurementMode: (mode: 'surface' | 'vertex') => void
  section: SectionSettings
  setSection: (patch: Partial<SectionSettings>) => void
  resetSection: () => void
}>((set) => ({
  snapLabel:'',setSnapLabel:snapLabel=>set({snapLabel}),
  pendingFit:null,overhangs:false,
  focus:null,setFocus:focus=>set({focus}),pickOverlaps:false,setPickOverlaps:pickOverlaps=>set({pickOverlaps}),
  anglePoints:[],setAnglePoints:anglePoints=>set({anglePoints}),
  measurementMode: 'vertex', setMeasurementMode: measurementMode => set({ measurementMode }),
  section: { ...defaultSection },
  setSection: patch => set(state => ({ section: { ...state.section, ...patch, offset: patch.offset !== undefined && Number.isFinite(patch.offset) ? Math.max(-100000, Math.min(100000, patch.offset)) : state.section.offset } })),
  resetSection: () => set({ section: { ...defaultSection } }),
}))
