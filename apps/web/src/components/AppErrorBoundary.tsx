import {Component,type ReactNode} from 'react'
import {recordDiagnostic} from '@/lib/diagnostics'
export class AppErrorBoundary extends Component<{children:ReactNode},{failed:boolean;message:string}>{
 state={failed:false,message:''}
 static getDerivedStateFromError(){return {failed:true,message:''}}
 componentDidCatch(){recordDiagnostic('ui-error','failure')}
 render(){if(!this.state.failed)return this.props.children
  return <main className="route-loading" role="alert"><h1>Your workspace needs to reopen</h1><p>Saved projects and recovery revisions remain on this device. Download current edits if available, then reopen the workshop.</p><button onClick={async()=>{try{const {useEditor}=await import('@/store/editor'),{downloadBlob,safeFilename}=await import('@/lib/download'),doc=useEditor.getState().document;downloadBlob(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}),`${safeFilename(doc.name)}-recovery.forge.json`);this.setState({message:'Backup download requested. Check your downloads.'})}catch{this.setState({message:'Current edits could not be retrieved. Reopen the workshop to inspect saved recovery revisions.'})}}}>Download current edits</button><button onClick={()=>{window.location.hash='projects';this.setState({failed:false,message:''})}}>Reopen workshop</button><p>{this.state.message}</p></main>
 }
}
