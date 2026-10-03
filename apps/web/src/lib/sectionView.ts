import { Plane, Vector3 } from 'three'
export type SectionSettings = { enabled: boolean; axis: 'x' | 'y' | 'z'; offset: number; inverted: boolean }
export function sectionPlane(section: SectionSettings) {
  const normal = new Vector3(section.axis === 'x' ? 1 : 0, section.axis === 'y' ? 1 : 0, section.axis === 'z' ? 1 : 0)
  if (section.inverted) normal.negate()
  return new Plane(normal, section.offset * (section.inverted ? 1 : -1))
}
export function sectionPointVisible(point: { x: number; y: number; z: number }, section: SectionSettings) {
  return !section.enabled || (point[section.axis] - section.offset) * (section.inverted ? -1 : 1) >= -0.00001
}
