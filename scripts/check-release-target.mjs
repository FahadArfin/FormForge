import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {readReleaseTarget, validateReleaseTarget} from './release-config.mjs'
const release = readReleaseTarget()
const branch = execFileSync('git', ['branch', '--show-current'], {encoding:'utf8'}).trim()
validateReleaseTarget(release, JSON.parse(readFileSync('.openai/hosting.json','utf8')), branch)
console.log(`Beta release target verified: ${release.origin}. Production is excluded.`)
