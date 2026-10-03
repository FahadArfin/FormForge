/** Prevent an asynchronous save from replacing newer in-memory work. */
export async function saveBeforeReplace<T>(getDocument: () => T, save: () => Promise<boolean>, replace: () => void, isCurrent: () => boolean = () => true): Promise<'failed' | 'changed' | 'continued'> {
  if (!isCurrent()) return 'changed'
  const before = getDocument()
  let saved = false
  try { saved = await save() } catch { /* The caller keeps the document and offers recovery. */ }
  if (getDocument() !== before || !isCurrent()) return 'changed'
  if (!saved) return 'failed'
  replace()
  return 'continued'
}
