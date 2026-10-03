/** A cancelled or replaced project must never receive a late generation result. */
export function createGenerationSession(projectId: string) {
  const controller = new AbortController()
  return {
    signal: controller.signal,
    cancel: () => controller.abort(),
    isCurrent(currentProjectId: string) {
      if (currentProjectId !== projectId) controller.abort()
      return !controller.signal.aborted
    },
  }
}

export type GenerationSession = ReturnType<typeof createGenerationSession>
