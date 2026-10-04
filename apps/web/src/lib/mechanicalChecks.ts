import type {MechanicalJob,MechanicalResult} from '@/geometry/mechanicalChecks.worker'
export function mechanicalCheck(job:MechanicalJob,signal:AbortSignal):Promise<MechanicalResult>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Cancelled','AbortError'));return}
  const worker=new Worker(new URL('../geometry/mechanicalChecks.worker.ts',import.meta.url),{type:'module'})
  const finish=(error?:Error,result?:MechanicalResult)=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);worker.terminate();if(error)reject(error);else resolve(result!)}
  const cancel=()=>finish(new DOMException('Cancelled','AbortError')),timer=setTimeout(()=>finish(new Error('Check reached its 20-second limit. Try a smaller part.')),20_000)
  signal.addEventListener('abort',cancel,{once:true});worker.onerror=()=>finish(new Error('The check worker failed. Retry or simplify a copy.'));worker.onmessage=e=>e.data.ok?finish(undefined,e.data.result):finish(new Error(e.data.error));worker.postMessage(job)
 })
}
