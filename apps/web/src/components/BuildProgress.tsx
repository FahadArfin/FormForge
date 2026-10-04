import { useEffect, useState } from 'react'
import { useEditor } from '@/store/editor'

export function BuildProgress() {
  const started = useEditor(s => s.geometryStartedAt)
  const cancel = useEditor(s => s.cancelBuild)
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const update = () => setSeconds(started ? Math.floor((Date.now() - started) / 1000) : 0)
    update(); const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [started])
  return <div className="rebuild-chip"><span aria-hidden="true" /><span role="status">Building final shape{seconds > 0 ? ` · ${seconds}s` : '…'}</span><button onClick={cancel}>Stop build</button></div>
}
