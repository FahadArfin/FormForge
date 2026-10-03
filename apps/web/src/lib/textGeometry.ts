import { Euler, Vector3 } from 'three'
import { createNode, type ModelNode } from '@formforge/model'
import { FontLoader } from 'three/addons/loaders/FontLoader.js'
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import fontData from '@/assets/fonts/helvetiker_regular.typeface.json'
import { geometryToSculptMesh } from './polygonSculpt'
const font=new FontLoader().parse(fontData)
export function createTextNode(settings:NonNullable<ModelNode['text']>, mode:'add'|'cut'='add'):ModelNode {
  if(!settings.content.trim()||settings.content.length>80||settings.content.split('\n').length>3) throw new Error('Use 1–80 characters on at most three lines.')
  if(!Number.isFinite(settings.size)||settings.size<1||settings.size>200||!Number.isFinite(settings.depth)||settings.depth<0.1||settings.depth>30) throw new Error('Text size must be 1–200 mm and depth 0.1–30 mm.')
  for(const c of settings.content) if(c!=='\n' && !font.data.glyphs[c]) throw new Error(`The bundled font does not contain “${c}”.`)
  const raw=new TextGeometry(settings.content,{font,size:settings.size,depth:settings.depth,curveSegments:6,bevelEnabled:false})
  raw.deleteAttribute('normal');raw.deleteAttribute('uv')
  const geometry=mergeVertices(raw,1e-5);raw.dispose();geometry.center()
  if(geometry.getAttribute('position').count>60000) {geometry.dispose();throw new Error('This label is too complex. Shorten the text.')}
  const node=createNode('mesh',mode);node.mesh=geometryToSculptMesh(geometry);geometry.dispose()
  node.text={...settings};node.name=`Text · ${settings.content.replace(/\n/g,' ').slice(0,40)}`
  return node
}

export function updatedTextTransform(node:ModelNode, depth:number, mode:'add'|'cut') {
  if (!node.text) throw new Error('This shape has no editable text settings.')
  if(Object.keys(node.parameterBindings??{}).some(k=>k.startsWith('position'))) throw new Error('Clear position bindings before changing text depth or its operation.')
  const dz=((mode==='cut'?-1:1)*depth-(node.boolean==='cut'?-1:1)*node.text.depth)/2*node.transform.scale.z
  const r=node.transform.rotation
  const delta=new Vector3(0,0,dz).applyEuler(new Euler(r.x*Math.PI/180,r.y*Math.PI/180,r.z*Math.PI/180,'XYZ'))
  const p=node.transform.position
  return {...node.transform,position:{x:p.x+delta.x,y:p.y+delta.y,z:p.z+delta.z}}
}
