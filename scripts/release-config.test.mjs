import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readReleaseTarget, validateReleaseTarget} from './release-config.mjs'
const release = readReleaseTarget()
test('active hosting is isolated from production', () => { assert.notEqual(release.projectId, release.productionProjectId); assert.notEqual(release.origin, release.productionOrigin) })
test('production hosting cannot be packaged as beta', () => assert.throws(() => validateReleaseTarget(release, {project_id:release.productionProjectId}, 'codex/beta'), /hosting/))
test('production branch cannot pass beta release guard', () => assert.throws(() => validateReleaseTarget(release, {project_id:release.projectId}, 'main'), /branch/))
test('production origin and unapproved promotion are blocked', () => {
  assert.throws(() => validateReleaseTarget({...release, origin:release.productionOrigin}, {project_id:release.projectId}), /origin/)
  assert.throws(() => validateReleaseTarget({...release, channel:'production'}, {project_id:release.projectId}), /policy/)
})
test('detached CI source can validate the beta artifact', () => assert.equal(validateReleaseTarget(release, {project_id:release.projectId}, '').channel, 'beta'))
