import {zip,strToU8} from 'fflate'
import {cloudRequest,type CloudComment} from './cloud'
export async function cloudArchive(projectId:string,revisions:number[],signal?:AbortSignal):Promise<Blob>{
 if(!revisions.length||revisions.length>20)throw new Error('Choose up to 20 retained snapshots.')
 const files:Record<string,Uint8Array>={};let total=0
 for(const revision of revisions){const result=await cloudRequest<{document:unknown;snapshotRevision:number}>(`/projects/${projectId}/document?revision=${revision}`,{signal});if(result.snapshotRevision!==revision)throw new Error('The snapshot changed. Reload and try again.');const data=strToU8(JSON.stringify(result.document,null,2));total+=data.length;if(total>100_000_000)throw new Error('Archive exceeds 100 MB. Download snapshots individually.');files[`snapshots/v${revision}.forge.json`]=data}
 const {comments}=await cloudRequest<{comments:CloudComment[]}>(`/projects/${projectId}/comments`,{signal});files['reviews.json']=strToU8(JSON.stringify(comments,null,2));files['README.txt']=strToU8(`FormForge cloud archive\nSnapshots: ${revisions.join(', ')}\nImport any snapshots/vN.forge.json to restore an editable local project.\nReview comments are reference material; they are not imported into a new cloud project.\n`)
 return new Promise((resolve,reject)=>zip(files,{level:6},(error,data)=>error?reject(error):resolve(new Blob([data as Uint8Array<ArrayBuffer>],{type:'application/zip'}))))
}
