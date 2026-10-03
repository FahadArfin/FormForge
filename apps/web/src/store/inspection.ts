import { create } from 'zustand'
import type { SectionSettings } from '@/lib/sectionView'

const defaultSection: SectionSettings = { enabled: false, axis: 'z', offset: 10, inverted: false }

export const useInspection = create<{
  measurementMode: 'surface' | 'vertex'
  setMeasurementMode: (mode: 'surface' | 'vertex') => void
  section: SectionSettings
  setSection: (patch: Partial<SectionSettings>) => void
  resetSection: () => void
}>((set) => ({
  measurementMode: 'vertex', setMeasurementMode: measurementMode => set({ measurementMode }),
  section: { ...defaultSection },
  setSection: patch => set(state => ({ section: { ...state.section, ...patch, offset: patch.offset !== undefined && Number.isFinite(patch.offset) ? Math.max(-100000, Math.min(100000, patch.offset)) : state.section.offset } })),
  resetSection: () => set({ section: { ...defaultSection } }),
}))
