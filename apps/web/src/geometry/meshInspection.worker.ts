/// <reference lib="webworker" />
import { inspectMeshProperties, validateInspectionMesh, type InspectionMesh, type MeshProperties } from '../lib/meshInspection'
import { repairMesh, type MeshData } from '../lib/meshTools'

export type MeshDoctorResult = ReturnType<typeof repairMesh>
export type MeshInspectionJob = { kind: 'doctor'; mesh: MeshData } | { kind: 'properties'; mesh: InspectionMesh }
export type MeshInspectionResponse = { ok: true; result: MeshDoctorResult | MeshProperties } | { ok: false; error: string }

export function runMeshInspection(job: MeshInspectionJob): MeshDoctorResult | MeshProperties {
  validateInspectionMesh(job.mesh, job.kind === 'doctor')
  return job.kind === 'doctor' ? repairMesh(job.mesh) : inspectMeshProperties(job.mesh)
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) self.onmessage = (event: MessageEvent<MeshInspectionJob>) => {
  try { self.postMessage({ ok: true, result: runMeshInspection(event.data) } satisfies MeshInspectionResponse) }
  catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Mesh inspection failed.' } satisfies MeshInspectionResponse) }
}
