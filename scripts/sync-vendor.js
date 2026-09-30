// Recopie les artefacts 8th Wall / A-Frame dans public/external/.
// Lancé automatiquement avant `dev`, `build` et après `npm install`.
import {cp, mkdir, rm} from 'node:fs/promises'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dep = p => resolve(root, 'node_modules', p)
const out = p => resolve(root, 'public/external', p)

const targets = [
  ['@8thwall/engine-binary/dist', 'xr'],
  ['@8thwall/xrextras/dist', 'xrextras'],
  ['aframe/dist/aframe-master.min.js', 'aframe/aframe-master.min.js'],
]

await rm(resolve(root, 'public/external'), {recursive: true, force: true})
for (const [from, to] of targets) {
  await mkdir(dirname(out(to)), {recursive: true})
  await cp(dep(from), out(to), {recursive: true})
}
console.log('vendor synced → public/external/')
