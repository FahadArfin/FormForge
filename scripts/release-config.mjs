import {readFileSync} from 'node:fs'

export function validateReleaseTarget(release, hosting, branch = '') {
  if (release.channel !== 'beta' || release.promotionRequiresUserApproval !== true) throw new Error('Beta-only release policy must remain active until the user authorizes promotion.')
  if (!release.projectId || hosting.project_id !== release.projectId || release.projectId === release.productionProjectId) throw new Error('Release blocked: hosting must point to the isolated beta Site, never production.')
  const origin = new URL(release.origin)
  if (origin.protocol !== 'https:' || origin.origin !== release.origin || origin.username || origin.password || release.origin === release.productionOrigin) throw new Error('Release blocked: beta needs its separate HTTPS origin.')
  if (branch === 'main' || branch === 'master') throw new Error('Release blocked: use the beta branch; promotion to main needs explicit user authorization.')
  return release
}
export function readReleaseTarget() {
  return validateReleaseTarget(JSON.parse(readFileSync(new URL('../.openai/release.json', import.meta.url), 'utf8')), JSON.parse(readFileSync(new URL('../.openai/hosting.json', import.meta.url), 'utf8')))
}
