import {z} from 'zod'
const number=z.number().finite().min(-10000).max(10000)
const positive=z.number().finite().positive().max(2000)
const id=z.string().min(1).max(100)
const text=z.string().max(2000)
const vector=z.object({x:number,y:number,z:number}).strict()
const parameters=z.object({width:positive.optional(),depth:positive.optional(),height:positive.optional(),radius:positive.optional(),radiusTop:z.number().min(0).max(2000).optional(),fillet:z.number().min(0).max(1000).optional(),wall:z.number().min(0).max(1000).optional(),segments:z.number().int().min(8).max(128).optional()}).strict()
const bindings=z.partialRecord(z.enum(['width','depth','height','radius','radiusTop','fillet','wall','positionX','positionY','positionZ','rotationX','rotationY','rotationZ']),z.string().min(1).max(256)).refine(v=>Object.keys(v).length<=14)
export const rackDimensionsSchema=z.object({
 width:positive,depth:positive,deviceWidth:positive,deviceDepth:positive,deviceHeight:positive,thickness:z.number().min(.6).max(20),earHeight:positive,
 holeDiameter:positive,holeSpacing:positive,holeHeight:positive,cableClearance:z.number().min(0).max(200),
 slotCount:z.number().int().min(0).max(32),slotWidth:positive,cornerRadius:z.number().min(0).max(10)
}).strict()
export type RackDimensions=z.infer<typeof rackDimensionsSchema>
export const engineeringOperationSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('rack-shelf'),dimensions:rackDimensionsSchema}).strict(),
 z.object({type:z.literal('shelf-slots'),count:z.number().int().min(0).max(32)}).strict(),
 z.object({type:z.literal('set-parameter'),name:id,expression:z.string().min(1).max(256),unit:z.enum(['mm','cm','m','in','deg','rad'])}).strict(),
 z.object({type:z.literal('create-feature'),id,kind:z.enum(['box','roundedBox','cylinder','sphere','cone','tube','gear','loft','spring']),name:id,boolean:z.enum(['add','cut','intersect']).default('add'),parameters,position:vector,rotation:vector.optional(),bindings:bindings.optional(),groupId:id.optional()}).strict(),
 z.object({type:z.literal('edit-feature'),nodeId:id,parameters:parameters.optional(),bindings:bindings.optional(),position:vector.optional(),rotation:vector.optional()}).strict(),
 z.object({type:z.literal('hole'),id,targetNodeId:id,face:z.enum(['x+','x-','y+','y-','z+','z-']),diameter:positive,u:number,v:number,depthMode:z.enum(['through','blind']),depth:positive}).strict(),
 z.object({type:z.literal('pattern'),nodeIds:z.array(id).min(1).max(64),mode:z.enum(['linear','polar']),axis:z.enum(['x','y','z']),count:z.number().int().min(2).max(32),spacing:number,degrees:z.number().min(-360).max(360),origin:vector}).strict(),
 z.object({type:z.literal('round'),nodeId:id,radius:z.number().min(.01).max(100)}).strict(),
 z.object({type:z.literal('place-on-bed')}).strict(),
 z.object({type:z.literal('orient'),rotation:vector}).strict(),
 z.object({type:z.literal('split'),axis:z.enum(['x','y','z']),offset:number,keep:z.enum(['both','positive','negative'])}).strict()
])
export type EngineeringOperation=z.infer<typeof engineeringOperationSchema>
export const designPlanSchema=z.object({
 version:z.literal(1),title:z.string().min(1).max(120),
 requirements:z.array(text).max(32),questions:z.array(text).max(16),assumptions:z.array(text).max(32),
 expectedChecks:z.array(text).max(32),operations:z.array(engineeringOperationSchema).max(64)
}).strict()
export type DesignPlan=z.infer<typeof designPlanSchema>
export const engineeringMetadataSchema=z.object({
 version:z.literal(1),
 shelf:z.object({nodeIds:z.array(id).max(100),dimensions:rackDimensionsSchema}).optional(),
 history:z.array(z.object({title:z.string().max(120),appliedAt:z.string().max(40),operations:z.array(engineeringOperationSchema).max(64),assumptions:z.array(text).max(32)})).max(20)
})
export type EngineeringMetadata=z.infer<typeof engineeringMetadataSchema>
export const slicerResultSchema=z.object({
 version:z.literal(1),association:z.literal('user-confirmed'),fileName:z.string().max(256),importedAt:z.string().max(40),
 slicer:z.enum(['BambuStudio','OrcaSlicer','PrusaSlicer','unknown']),slicerVersion:z.string().max(80).optional(),
 durationSeconds:z.number().nonnegative().max(31536000).optional(),filamentGrams:z.number().nonnegative().max(100000).optional(),
 durationSource:z.string().max(512).optional(),massSource:z.string().max(512).optional(),jobFingerprint:z.string().max(256),plate:z.string().max(256).optional()
})
export type SlicerResult=z.infer<typeof slicerResultSchema>

export const designPlanJsonSchema=z.toJSONSchema(designPlanSchema)
