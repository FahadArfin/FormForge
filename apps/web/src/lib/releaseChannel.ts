import release from '../../../../.openai/release.json'
export const isBetaRelease = release.channel === 'beta'
export const appDisplayName = isBetaRelease ? 'PrintLab Beta' : 'PrintLab'
