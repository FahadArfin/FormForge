import { useEffect, useState } from 'react'
import { Search, ArrowUpRight, Box, CircleDot, Cylinder, MousePointer2, Hand, RotateCw, Scaling, Maximize2, Save, Download, FolderOpen, Undo2, Redo2, Copy, CircleHelp, Sparkles } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { WorkspaceDialog } from './WorkspaceDialog'

export function CommandMenu({ onClose, onImport, onExport, onProjects, onHelp, onGenerate }: { onClose: () => void; onImport: () => void; onExport: () => void; onProjects: () => void; onHelp: () => void; onGenerate: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const editor = useEditor()
  const commands = [
    { name: 'Add a box', group: 'Build', icon: Box, run: () => editor.addPrimitive('box') },
    { name: 'Add a cylinder', group: 'Build', icon: Cylinder, run: () => editor.addPrimitive('cylinder') },
    { name: 'Add a sphere', group: 'Build', icon: CircleDot, run: () => editor.addPrimitive('sphere') },
    { name: 'Hole builder and fit-test coupons', group: 'CAD toolkit', icon: Cylinder, run: () => window.dispatchEvent(new CustomEvent('formforge:open-inspector', { detail: { tab: 'tools', toolkit: 'create' } })) },
    { name: 'Section inspection and measurement', group: 'CAD toolkit', icon: Box, run: () => window.dispatchEvent(new CustomEvent('formforge:open-inspector', { detail: { tab: 'tools', toolkit: 'inspect' } })) },
    { name: 'Plate placement and planar splitting', group: 'CAD toolkit', icon: Download, run: () => window.dispatchEvent(new CustomEvent('formforge:open-inspector', { detail: { tab: 'tools', toolkit: 'prepare' } })) },
    { name: 'Center and drop whole model', group: 'Print', icon: Download, disabled: !editor.document.nodes.length, run: () => void editor.placeOnPlate('document', 'center-and-drop') },
    { name: 'Select', group: 'Tools', icon: MousePointer2, key: 'V', run: () => editor.setTool('select') },
    { name: 'Move', group: 'Tools', icon: Hand, key: 'G', run: () => editor.setTool('move') },
    { name: 'Rotate', group: 'Tools', icon: RotateCw, key: 'R', run: () => editor.setTool('rotate') },
    { name: 'Scale', group: 'Tools', icon: Scaling, key: 'S', run: () => editor.setTool('scale') },
    { name: 'Select all shapes', group: 'Edit', icon: Box, key: 'Ctrl A', run: editor.selectAll },
    { name: 'Clear selection', group: 'Edit', icon: MousePointer2, key: 'Esc', run: () => editor.selectNode(null) },
    { name: 'Drop selection to build plate', group: 'Edit', icon: Download, disabled: !editor.selectedNodeId, run: editor.dropSelectionToPlate },
    { name: 'Fit selection', group: 'View', icon: Maximize2, key: 'Shift F', disabled: !editor.selectedNodeId, run: () => window.dispatchEvent(new CustomEvent('formforge:frame', { detail: { selectedOnly: true } })) },
    { name: 'Review print checks and printer size', group: 'Print', icon: Box, run: () => window.dispatchEvent(new CustomEvent('formforge:open-inspector', { detail: { tab: 'print' } })) },
    { name: 'Open project history', group: 'Project', icon: Undo2, run: () => window.dispatchEvent(new CustomEvent('formforge:open-inspector', { detail: { tab: 'history' } })) },
    { name: 'Frame all shapes', group: 'View', icon: Maximize2, key: 'F', run: () => window.dispatchEvent(new CustomEvent('formforge:frame', { detail: { selectedOnly: false } })) },
    { name: 'Save on this device', group: 'Project', icon: Save, key: 'Ctrl S', run: () => void editor.saveNow() },
    { name: 'Import model or project', group: 'Project', icon: FolderOpen, run: onImport },
    { name: 'Export or download backup', group: 'Project', icon: Download, run: onExport },
    { name: 'My projects', group: 'Navigate', icon: FolderOpen, run: onProjects },
    { name: 'Undo', group: 'Edit', icon: Undo2, key: 'Ctrl Z', disabled: !editor.undoStack.length, run: editor.undo },
    { name: 'Redo', group: 'Edit', icon: Redo2, key: 'Ctrl Shift Z', disabled: !editor.redoStack.length, run: editor.redo },
    { name: 'Duplicate selection', group: 'Edit', icon: Copy, key: 'Ctrl D', disabled: !editor.selectedNodeId, run: editor.duplicateSelected },
    { name: 'Generate a model', group: 'Build', icon: Sparkles, run: onGenerate },
    { name: 'Getting started and shortcuts', group: 'Help', icon: CircleHelp, key: '?', run: onHelp },
  ].filter((item) => !item.disabled && `${item.name} ${item.group}`.toLowerCase().includes(query.toLowerCase()))
  const selected = Math.min(active, Math.max(commands.length - 1, 0))
  useEffect(() => { document.getElementById(`command-${selected}`)?.scrollIntoView({ block: 'nearest' }) }, [selected, query])
  const run = (index: number) => { const command = commands[index]; if (command) { onClose(); command.run() } }
  return <WorkspaceDialog title="Find a command" onClose={onClose} className="command-dialog">
    <label className="command-search"><Search size={20} /><input data-initial-focus placeholder="Search tools, actions, and more…" aria-label="Search commands" role="combobox" aria-expanded="true" aria-controls="command-results" aria-autocomplete="list" aria-activedescendant={commands.length ? `command-${selected}` : undefined} value={query} onChange={(event) => { setQuery(event.target.value); setActive(0) }} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setActive((selected + 1) % Math.max(commands.length, 1)) } if (event.key === 'ArrowUp') { event.preventDefault(); setActive((selected - 1 + commands.length) % Math.max(commands.length, 1)) } if (event.key === 'Enter') { event.preventDefault(); run(selected) } }} /><kbd>esc</kbd></label>
    <div className="command-results" role="listbox" id="command-results" aria-label="Commands">{commands.map((command, index) => <div key={command.name} role="option" id={`command-${index}`} aria-selected={selected === index}><button tabIndex={-1} className={selected === index ? 'active' : ''} onMouseEnter={() => setActive(index)} onClick={() => run(index)}><command.icon size={18} /><span><strong>{command.name}</strong><small>{command.group}</small></span>{command.key ? <kbd>{command.key}</kbd> : <ArrowUpRight size={15} />}</button></div>)}{!commands.length && <p className="command-empty">No commands found. Try “box”, “export”, or “help”.</p>}</div>
    <div className="command-footer"><span><kbd>↑</kbd> <kbd>↓</kbd> to navigate</span><span><kbd>enter</kbd> to run</span></div>
  </WorkspaceDialog>
}

