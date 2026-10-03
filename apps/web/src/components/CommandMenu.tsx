import { useEffect, useState } from 'react'
import { Search, ArrowUpRight, Box, CircleDot, Cylinder, MousePointer2, Hand, RotateCw, Scaling, Maximize2, Save, Download, FolderOpen, Undo2, Redo2, Copy, CircleHelp, Sparkles } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { cadTools, searchCommands } from '@/lib/cadToolCatalog'
import { WorkspaceDialog } from './WorkspaceDialog'

export function CommandMenu({ onClose, onImport, onExport, onProjects, onHelp, onGenerate }: { onClose: () => void; onImport: () => void; onExport: () => void; onProjects: () => void; onHelp: () => void; onGenerate: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const editor = useEditor()
  const selectedNode=editor.document.nodes.find(n=>n.id===editor.selectedNodeId)
  const commands = searchCommands([
    ...(['extrude','revolve'] as const).map(operation=>({name:`Draw a profile and ${operation}`,group:'Build',keywords:'sketch polygon outline',icon:Box,run:()=>editor.beginProfileDrawing(operation)})),
    ...(['draw','clay','smooth','inflate','pinch','flatten','crease','grab','snake','relax','mask'] as const).map(brush=>({name:`Sculpt ${brush}`,group:'Sculpt',icon:Sparkles,disabled:!selectedNode?.mesh||selectedNode.locked,reason:'Select an unlocked sculpt mesh first.',run:()=>editor.setTool(`sculpt-${brush}`)})),
    ...(['add','carve'] as const).map(brush=>({name:`Volume ${brush}`,group:'Sculpt',icon:Sparkles,disabled:!editor.document.nodes.length||editor.document.nodes.some(n=>n.locked&&!n.suppressed),reason:'Add a solid and unlock all enabled shapes first.',run:()=>editor.setTool(`sculpt-${brush}`)})),
    ...[{id:'pattern',name:'Mirror and repeat a shape',keywords:'pattern linear circular array'},{id:'surface',name:'Smooth, simplify or hollow a shape',keywords:'refine mesh surface modifier'},{id:'deform',name:'Bend, taper or twist a shape',keywords:'deform'}].map(tool=>({...tool,group:'Shape properties',icon:Box,disabled:editor.selectedNodeIds.length!==1||selectedNode?.locked,reason:'Select one unlocked shape first.',run:()=>window.dispatchEvent(new CustomEvent('formforge:open-inspector',{detail:{tab:'model',tool:tool.id,pro:true}}))})),
    { name: 'Add a box', group: 'Build', icon: Box, run: () => editor.addPrimitive('box') },
    { name: 'Add a cylinder', group: 'Build', icon: Cylinder, run: () => editor.addPrimitive('cylinder') },
    { name: 'Add a sphere', group: 'Build', icon: CircleDot, run: () => editor.addPrimitive('sphere') },
    ...cadTools.map(tool => ({ ...tool, icon: Sparkles, run: () => window.dispatchEvent(new CustomEvent('formforge:open-inspector', { detail: { tab: tool.tab, toolkit: 'toolkit' in tool ? tool.toolkit : undefined, tool: tool.id } })) })),
    ...(['roundedBox','cone','torus','capsule','tube','wedge','star','gear','loft','spring'] as const).map(kind=>({name:`Add ${kind==='roundedBox'?'a soft rounded box':`a ${kind}`}`,group:'Build',icon:Box,run:()=>editor.addPrimitive(kind)})),
    {name:'Saved camera views',group:'View',icon:Maximize2,run:()=>window.dispatchEvent(new Event('formforge:saved-views'))},
    {name:'Choose an editable starter part',group:'Project',icon:Box,run:()=>window.dispatchEvent(new Event('formforge:starters'))},
    {name:'Arrange parts on a build plate',group:'Export',icon:Download,run:onExport},
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
  ], query)
  const selected = Math.min(active, Math.max(commands.length - 1, 0))
  useEffect(() => { document.getElementById(`command-${selected}`)?.scrollIntoView({ block: 'nearest' }) }, [selected, query])
  const run = (index: number) => { const command = commands[index]; if (command && !('disabled' in command && command.disabled)) { onClose(); command.run() } }
  return <WorkspaceDialog title="Find a command" onClose={onClose} className="command-dialog">
    <label className="command-search"><Search size={20} /><input data-initial-focus placeholder="Search tools, actions, and more…" aria-label="Search commands" role="combobox" aria-expanded="true" aria-controls="command-results" aria-autocomplete="list" aria-activedescendant={commands.length ? `command-${selected}` : undefined} value={query} onChange={(event) => { setQuery(event.target.value); setActive(0) }} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setActive((selected + 1) % Math.max(commands.length, 1)) } if (event.key === 'ArrowUp') { event.preventDefault(); setActive((selected - 1 + commands.length) % Math.max(commands.length, 1)) } if (event.key === 'Enter') { event.preventDefault(); run(selected) } }} /><kbd>esc</kbd></label>
    <div className="command-results" role="listbox" id="command-results" aria-label="Commands">{commands.map((command, index) => <div key={command.name} role="option" id={`command-${index}`} aria-selected={selected === index}><button tabIndex={-1} aria-disabled={'disabled' in command && command.disabled} className={selected === index ? 'active' : ''} onMouseEnter={() => setActive(index)} onClick={() => run(index)}><command.icon size={18} /><span><strong>{command.name}</strong><small>{'disabled' in command && command.disabled ? ('reason' in command ? command.reason : 'Unavailable · select a shape or create history first') : command.group}</small></span>{'key' in command && command.key ? <kbd>{command.key}</kbd> : <ArrowUpRight size={15} />}</button></div>)}{!commands.length && <p className="command-empty">No commands found. Try “box”, “export”, or “help”.</p>}</div>
    <div className="command-footer"><span><kbd>↑</kbd> <kbd>↓</kbd> to navigate</span><span><kbd>enter</kbd> to run</span></div>
  </WorkspaceDialog>
}

