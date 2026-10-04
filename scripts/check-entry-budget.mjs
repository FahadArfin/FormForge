import { readFile } from 'node:fs/promises'
import { resolve, dirname, basename } from 'node:path'
import { gzipSync } from 'node:zlib'
const directory = resolve(process.argv[2] ?? 'dist')
const html = await readFile(resolve(directory, 'index.html'), 'utf8')
const roots = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.js)"/g)].map(match => resolve(directory, '.' + match[1]))
const visited = new Set(); let raw = 0, gzip = 0
async function visit(file) {
  if (visited.has(file)) return
  visited.add(file)
  const source = await readFile(file, 'utf8'); raw += Buffer.byteLength(source); gzip += gzipSync(source).byteLength
  // Static imports only. Dynamic CAD/demo chunks must not count as public-entry work.
  for (const match of source.matchAll(/(?:^|;|\n)import\s*(?:[^'";]*?from\s*)?["'](\.[^"']+)["']/g)) await visit(resolve(dirname(file), match[1]))
}
for (const root of roots) await visit(root)
console.log(JSON.stringify({ assets: [...visited].map(file => basename(file)), rawBytes: raw, gzipBytes: gzip, rawBudgetBytes: 307200, gzipBudgetBytes: 102400 }, null, 2))
if (!roots.length || raw > 307200 || gzip > 102400) throw new Error('Public entry exceeds its 300 KiB raw / 100 KiB gzip JavaScript budget.')
