import type {ReferenceImage,Workplane} from '@formforge/model'
export function calibratedScale(a:{x:number;y:number},b:{x:number;y:number},mm:number){
 const pixels=Math.hypot(b.x-a.x,b.y-a.y)
 if(![a.x,a.y,b.x,b.y,mm,pixels].every(Number.isFinite)||pixels<1||mm<=0||mm>100000)throw new Error('Pick two different points at least one pixel apart and enter a distance from 0 to 100,000 mm.')
 const scale=mm/pixels;if(scale<0.0001||scale>1000)throw new Error('Calibration scale is outside the supported range.')
 return scale
}
export async function loadReferenceImage(file:File,plane:Workplane):Promise<ReferenceImage>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Choose a PNG, JPEG, or WebP under 5 MB.')
 const bitmap=await createImageBitmap(file)
 try{
 if(bitmap.width*bitmap.height>16000000)throw new Error('Image must contain no more than 16 million pixels.')
 const factor=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*factor));canvas.height=Math.max(1,Math.round(bitmap.height*factor));canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height)
 const dataUrl=canvas.toDataURL('image/webp',0.9);if(dataUrl.length>3000000)throw new Error('Compressed image is too large. Use a smaller image.')
 return {id:crypto.randomUUID(),name:file.name.slice(0,120),dataUrl,width:canvas.width,height:canvas.height,mmPerPixel:100/canvas.width,opacity:0.5,visible:true,plane:structuredClone(plane)}
 }finally{bitmap.close()}
}
