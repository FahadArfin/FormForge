import { Box, MousePointer2, SlidersHorizontal, Download, ArrowUpRight } from 'lucide-react'
import { WorkspaceDialog } from './WorkspaceDialog'

const shortcuts = [['V / G / R / S', 'Select / move / rotate / scale'], ['F / Shift F', 'Frame all / frame selection'], ['Ctrl / ⌘ K', 'Find a command'], ['Ctrl / ⌘ S', 'Save on this device'], ['Ctrl / ⌘ Z', 'Undo your last change'], ['Ctrl / ⌘ Shift Z', 'Redo a change'], ['Ctrl / ⌘ D', 'Duplicate selection'], ['Arrow keys', 'Nudge selection by snap step'], ['Delete', 'Remove selection'], ['Esc', 'Cancel placement or close a dialog']]
export function WorkspaceHelp({ onClose, onExample }: { onClose: () => void; onExample: () => void }) {
  return <WorkspaceDialog title="Make your first idea real." description="A few shapes are all you need to get started." onClose={onClose} className="guide-dialog">
    <div className="guide-steps">{[
      [Box, '01', 'Start with a shape', 'In Build, choose a shape and set its dimensions in millimeters.'],
      [MousePointer2, '02', 'Place it in the world', 'Click the build plane to place it. Drag to change its footprint.'],
      [SlidersHorizontal, '03', 'Make it yours', 'Select a shape to resize, color, or turn it into a hole in the inspector.'],
      [Download, '04', 'Take it off screen', 'Check Print, then export 3MF for your slicer or an editable backup.'],
    ].map(([Icon, number, title, description]) => { const StepIcon = Icon as typeof Box; return <article key={number as string}><span><StepIcon size={21} /></span><div><small>STEP {number as string}</small><h3>{title as string}</h3><p>{description as string}</p></div></article> })}</div>
    <div className="guide-camera"><strong>Move around your model</strong><p>Drag empty space to orbit · scroll to zoom · right-drag to pan. Use the View menu for precise angles.</p></div>
    <details className="shortcut-details"><summary>Keyboard shortcuts <span>10 essentials</span></summary><dl>{shortcuts.map(([key, label]) => <div key={key}><dt>{label}</dt><dd><kbd>{key}</kbd></dd></div>)}</dl></details>
    <footer className="dialog-footer"><span>Autosaved on this device. Download backups to keep a separate copy.</span><button className="studio-primary" onClick={onExample}>Try an editable example <ArrowUpRight size={17} /></button></footer>
  </WorkspaceDialog>
}
