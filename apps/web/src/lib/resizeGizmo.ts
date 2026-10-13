import { Color, CylinderGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three'
import { TransformControlsGizmo, type TransformControls } from 'three/addons/controls/TransformControls.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const colors: Record<string, string> = {
  X: '#ed8b9c', Y: '#58c9b0', Z: '#9da6ff',
  XY: '#9da6ff', YZ: '#ed8b9c', XZ: '#58c9b0', XYZ: '#e7e5f5',
}

/** Style only the visible scale handles; Three's picking geometry and drag math stay intact. */
export function styleResizeGizmo(controls: TransformControls) {
  const gizmo = controls.getHelper().children.find((child): child is TransformControlsGizmo => child instanceof TransformControlsGizmo)
  if (!gizmo) return

  for (const handle of gizmo.gizmo.scale.children) {
    if (!(handle instanceof Mesh) || !(handle.material instanceof MeshBasicMaterial)) continue
    const original = handle.geometry
    original.computeBoundingBox()
    const center = original.boundingBox!.getCenter(new Vector3())
    const axis = handle.name
    const plane = axis.length === 2
    const stem = original.type === 'CylinderGeometry'
    let geometry

    if (stem) {
      geometry = new CylinderGeometry(.0035, .0035, .5, 8)
      if (axis === 'X') geometry.rotateZ(-Math.PI / 2)
      if (axis === 'Z') geometry.rotateX(Math.PI / 2)
    } else if (plane) {
      // Soft corners in the same plane and position as the original two-axis handles.
      geometry = new RoundedBoxGeometry(.15, .15, .012, 3, .006)
      if (axis === 'YZ') geometry.rotateY(Math.PI / 2)
      if (axis === 'XZ') geometry.rotateX(-Math.PI / 2)
    } else {
      geometry = axis === 'XYZ'
        ? new RoundedBoxGeometry(.065, .065, .065, 3, .018)
        : new SphereGeometry(.032, 20, 12)
      // Gentle, baked shading keeps these small UI handles legible without scene lighting.
      const normal = geometry.getAttribute('normal'), shades = new Float32Array(normal.count * 3)
      const light = new Vector3(-.4, -.5, 1).normalize(), n = new Vector3()
      for (let i = 0; i < normal.count; i++) {
        const shade = .78 + .22 * Math.max(0, n.fromBufferAttribute(normal, i).dot(light))
        shades.set([shade, shade, shade], i * 3)
      }
      geometry.setAttribute('color', new Float32BufferAttribute(shades, 3))
    }
    geometry.translate(center.x, center.y, center.z)
    handle.geometry = geometry
    // setupGizmo clones each geometry; materials, however, are shared across modes.
    original.dispose()
    const material = handle.material.clone()
    handle.material = material
    material.vertexColors = !stem && !plane
    const resting = new Color(colors[axis] ?? '#e7e5f5')
    const highlighted = resting.clone().lerp(new Color('#ffffff'), .48)
    const opacity = plane ? .16 : stem ? .62 : 1
    material.color.copy(resting)
    material.opacity = opacity
    // TransformControls restores its own highlight every matrix update. Style after that
    // update, immediately before drawing, without patching its lifecycle or event handlers.
    handle.onBeforeRender = () => {
      const active = controls.enabled && controls.axis !== null &&
        (controls.axis === axis || (axis.length === 1 && controls.axis.includes(axis)))
      material.color.copy(active ? highlighted : resting)
      material.opacity = active ? (plane ? .42 : 1) : opacity
    }
  }
}
