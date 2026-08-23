import type { ModelCommand, ModelDocument } from './types.js'

const touch = (document: ModelDocument): ModelDocument => ({
  ...document,
  revision: document.revision + 1,
  updatedAt: new Date().toISOString(),
})

export function executeCommand(document: ModelDocument, command: ModelCommand): ModelDocument {
  if (command.type === 'replace-document') return command.document

  switch (command.type) {
    case 'add-node':
      return touch({ ...document, nodes: [...document.nodes, command.node] })
    case 'add-nodes':
      return touch({ ...document, nodes: [...document.nodes, ...command.nodes] })
    case 'update-node':
      return touch({
        ...document,
        nodes: document.nodes.map((node) => node.id === command.nodeId ? { ...node, ...command.patch } : node),
      })
    case 'update-nodes':
      return touch({
        ...document,
        nodes: document.nodes.map((node) => command.nodeIds.includes(node.id) ? { ...node, ...command.patch } : node),
      })
    case 'replace-nodes':
      return touch({ ...document, nodes: command.nodes })
    case 'remove-node':
      return touch({
        ...document,
        nodes: document.nodes.filter((node) => node.id !== command.nodeId),
        sculptStrokes: document.sculptStrokes.filter((stroke) => stroke.nodeId !== command.nodeId),
      })
    case 'remove-nodes':
      return touch({
        ...document,
        nodes: document.nodes.filter((node) => !command.nodeIds.includes(node.id)),
        sculptStrokes: document.sculptStrokes.filter((stroke) => !command.nodeIds.includes(stroke.nodeId)),
      })
    case 'duplicate-node':
      return touch({ ...document, nodes: [...document.nodes, command.newNode] })
    case 'add-sculpt-stroke':
      return touch({ ...document, sculptStrokes: [...document.sculptStrokes, command.stroke] })
    case 'rename-document':
      return touch({ ...document, name: command.name.trim() || 'Untitled model' })
    case 'set-workspace-mode':
      return touch({ ...document, workspaceMode: command.mode })
  }
}
