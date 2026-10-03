import { parseModelDocument, type ModelDocument } from '@formforge/model'
import type { ProjectVersion } from './db'

export async function restoreCheckpointSafely(
  version: ProjectVersion,
  getCurrentDocument: () => ModelDocument,
  saveRecovery: (document: ModelDocument, label: string) => Promise<unknown>,
  applyDocument: (document: ModelDocument) => void,
): Promise<void> {
  const current = getCurrentDocument()
  if (version.projectId !== current.id || version.document.id !== current.id) throw new Error('This checkpoint belongs to a different project. Open that project before restoring it.')
  const restored = parseModelDocument(structuredClone(version.document))
  await saveRecovery(current, `Before restore · ${new Date().toLocaleString()}`)
  // The user may continue editing or switch projects while IndexedDB is writing.
  if (getCurrentDocument() !== current) throw new Error('Your model changed while the recovery checkpoint was saving. Nothing was replaced. Restore again when you are ready.')
  applyDocument({ ...restored, revision: current.revision + 1, updatedAt: new Date().toISOString() })
}
