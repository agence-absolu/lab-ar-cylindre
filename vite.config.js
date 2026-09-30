import {defineConfig} from 'vite'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {existsSync, readdirSync} from 'node:fs'
import basicSsl from '@vitejs/plugin-basic-ssl'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Les trois libs AR s'exposent en globales (AFRAME / XRExtras / XR8) et sont
// chargées par balise <script>, pas importées comme modules ES. `npm run sync`
// les recopie depuis node_modules vers public/external/ (servi en dev, inclus
// dans dist au build) — voir scripts/sync-vendor.js.
/**
 * Expose la liste des cibles image déposées dans public/image-targets/.
 *
 * Elles vivent dans public/ et non dans src/ parce que le JSON généré par
 * @8thwall/image-target-cli contient un `imagePath` relatif
 * ("image-targets/xxx_luminance.jpg") que le moteur va chercher en HTTP au
 * runtime : le JSON et ses images doivent donc être servis côte à côte, à cette
 * URL exacte. Ce plugin évite d'avoir à maintenir une liste à la main.
 */
const imageTargetsPlugin = () => {
  const virtualId = 'virtual:image-targets'
  const resolvedId = '\0' + virtualId
  const dir = resolve(__dirname, 'public/image-targets')

  const list = () => (existsSync(dir) ? readdirSync(dir) : [])
    .filter(f => f.endsWith('.json'))
    // Chemins RELATIFS : les pages sont à la racine du déploiement, ce qui
    // fonctionne aussi bien à la racine que sous un sous-chemin. Le champ
    // `imagePath` des JSON est lui aussi relatif, et se résout au même endroit.
    .map(f => `image-targets/${f}`)

  return {
    name: 'mimosa:image-targets',
    resolveId: id => (id === virtualId ? resolvedId : null),
    load: id => (id === resolvedId ? `export default ${JSON.stringify(list())}` : null),
    configureServer(server) {
      // Ajouter/retirer une cible recharge la page sans redémarrer Vite.
      server.watcher.add(dir)
      const invalidate = (file) => {
        if (!file.startsWith(dir)) return
        const mod = server.moduleGraph.getModuleById(resolvedId)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({type: 'full-reload'})
      }
      server.watcher.on('add', invalidate)
      server.watcher.on('unlink', invalidate)
    },
  }
}

// Déployée sous un sous-chemin sur le lab (/<nom npm>/), la démo doit produire
// des URL préfixées. BASE_PATH est posé par le workflow de déploiement ; en
// local la base reste la racine.
const base = process.env.BASE_PATH || '/'

export default defineConfig({
  base,
  // HTTPS auto-signé : getUserMedia est bloqué en http:// sur mobile.
  // VITE_HTTPS=0 le désactive — utile derrière un tunnel (ngrok) qui fournit
  // déjà un vrai certificat.
  plugins: [
    imageTargetsPlugin(),
    ...(process.env.VITE_HTTPS === '0' ? [] : [basicSsl()]),
  ],
  server: {
    host: true,
    port: 5173,
    // Le domaine ngrok change à chaque session : un point en préfixe autorise
    // tous les sous-domaines. Sans ça Vite renvoie « Blocked request ».
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.io'],
  },
  preview: {host: true, port: 4173},
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ar: resolve(__dirname, 'ar.html'),
      },
    },
  },
})
