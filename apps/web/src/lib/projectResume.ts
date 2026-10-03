const key='formforge.last-opened-project.v1'
export function rememberOpenedProject(id:string){try{localStorage.setItem(key,id)}catch{/* Storage preferences must not prevent modeling. */}}
export function readLastOpenedProject(){try{return localStorage.getItem(key)||null}catch{return null}}

export function forgetOpenedProject(id:string){try{if(readLastOpenedProject()===id)localStorage.removeItem(key)}catch{}}
