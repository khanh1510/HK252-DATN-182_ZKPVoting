/**
 * Sao chép vote.wasm và vote_final.zkey từ code/build → web/public/zk/
 * Chạy sau: cd code && npm run pipeline (hoặc compile + setup + …)
 */
import fs from 'fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.join(__dirname, '..')
const codeBuild = path.join(webRoot, '..', 'code', 'build')
const destDir = path.join(webRoot, 'public', 'zk')

const pairs = [
  ['vote_js/vote.wasm', 'vote.wasm'],
  ['vote_final.zkey', 'vote_final.zkey'],
]

fs.mkdirSync(destDir, { recursive: true })
let ok = 0
for (const [relSrc, name] of pairs) {
  const from = path.join(codeBuild, relSrc)
  const to = path.join(destDir, name)
  if (!fs.existsSync(from)) {
    console.warn('[copy-zk] Không có file:', from)
    continue
  }
  fs.copyFileSync(from, to)
  console.log('[copy-zk] Đã copy', name)
  ok++
}
if (ok === 0) {
  console.warn(
    '[copy-zk] Chưa có artifact. Trong thư mục code: npm run compile && npm run setup && … (xem code/package.json).',
  )
  process.exitCode = 1
}
