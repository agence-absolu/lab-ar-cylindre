/**
 * Page d'accueil : préchargement du modèle, prévisualisation 3D et choix de
 * l'animation.
 *
 * Le modèle est téléchargé une seule fois, avec une progression lisible, puis
 * servi à la prévisualisation via un blob — ce qui évite tout second
 * téléchargement et rend le préchargement indépendant des en-têtes de cache.
 *
 * Le choix d'animation est mémorisé et repris par la vue AR.
 */
import {measureRenderedBox} from './fit.js'

const MODEL_URL = `${import.meta.env.BASE_URL}models/eric.glb`
export const ANIMATION_KEY = 'mimosa:animation'

// Part de la hauteur du cadre occupée par le personnage, mesurée sur la pose
// de repos. La marge restante absorbe les poses plus hautes (bras levés) et la
// dérive des chorégraphies.
const PREVIEW_FILL = 0.7

const ANIMATIONS = [
  {clip: 'walk', label: 'Marche'},
  {clip: 'swing', label: 'Swing'},
  {clip: 'samba', label: 'Samba'},
]

const cta = document.querySelector('#cta')
const ctaLabel = document.querySelector('#cta-label')
const progress = document.querySelector('#progress')
const bar = document.querySelector('#progress-bar')
const previewModel = document.querySelector('#preview-model')
const picker = document.querySelector('#anim-picker')
const animName = document.querySelector('#anim-name')
const animDots = document.querySelector('#anim-dots')

// Tant que le modèle n'est pas prêt, le lien ne navigue pas.
cta.addEventListener('click', (event) => {
  if (cta.getAttribute('aria-disabled') === 'true') event.preventDefault()
})

// --- Préchargement ----------------------------------------------------------
const preload = async () => {
  const response = await fetch(MODEL_URL)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const total = Number(response.headers.get('content-length')) || 0
  if (!response.body || !total) return response.blob()

  const reader = response.body.getReader()
  const chunks = []
  let received = 0
  for (;;) {
    const {done, value} = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    bar.style.transform = `scaleX(${Math.min(received / total, 1)})`
    progress.setAttribute('aria-valuenow', Math.round(received / total * 100))
  }
  return new Blob(chunks)
}

// --- Lecture des clips ------------------------------------------------------
let mixer = null
let current = null
let lastRenderTime = 0

const selected = () => {
  const saved = localStorage.getItem(ANIMATION_KEY)
  const index = ANIMATIONS.findIndex(a => a.clip === saved)
  return index === -1 ? 0 : index
}

const play = (index) => {
  const {clip, label} = ANIMATIONS[index]
  localStorage.setItem(ANIMATION_KEY, clip)
  animName.textContent = label
  ;[...animDots.children].forEach((dot, i) => {
    dot.classList.toggle('active', i === index)
    dot.setAttribute('aria-selected', String(i === index))
  })

  if (!mixer) return
  const next = mixer.clipAction(mixer.getRoot().animations.find(c => c.name === clip))
  if (!next || next === current) return
  next.reset().play()
  if (current) current.crossFadeTo(next, 0.35, false)
  current = next
}

const step = (delta) => {
  const index = (selected() + delta + ANIMATIONS.length) % ANIMATIONS.length
  play(index)
}

ANIMATIONS.forEach((animation, i) => {
  const dot = document.createElement('button')
  dot.type = 'button'
  dot.setAttribute('role', 'tab')
  dot.setAttribute('aria-label', animation.label)
  dot.addEventListener('click', () => play(i))
  animDots.appendChild(dot)
})
document.querySelector('#anim-prev').addEventListener('click', () => step(-1))
document.querySelector('#anim-next').addEventListener('click', () => step(1))

// --- Mise en scène ----------------------------------------------------------
/**
 * Place la caméra : le modèle est centré sur l'origine et ramené à 1 unité de
 * haut, il ne reste qu'à reculer de quoi le cadrer.
 */
const frameCamera = () => {
  const camera = document.querySelector('a-scene').camera
  // Le champ de vision par défaut d'A-Frame (80°) oblige à coller la caméra au
  // sujet et déforme le personnage : la vue est réglée sur fov 30.
  const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2

  const cameraEl = document.querySelector('#preview-camera')
  cameraEl.object3D.position.set(0, 0, (1 / PREVIEW_FILL / 2) / Math.tan(halfFov))
  cameraEl.object3D.updateMatrixWorld(true)
}

previewModel.addEventListener('model-loaded', ({detail}) => {
  const model = detail.model
  const object = previewModel.object3D

  // Cadre le modèle. Transformations remises à neutre avant de mesurer, et
  // mesure de l'encombrement RENDU (pose skinnée) — cf. src/fit.js.
  object.scale.set(1, 1, 1)
  object.position.set(0, 0, 0)
  model.position.set(0, 0, 0)
  model.scale.set(1, 1, 1)

  const box = measureRenderedBox(model, object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  if (!size.y) return
  // Le recentrage va sur le modèle, l'échelle sur l'entité : les mettre sur le
  // même objet ferait tourner le modèle autour d'un point décalé.
  model.position.set(-center.x, -center.y, -center.z)
  object.scale.setScalar(1 / size.y)   // le modèle mesure désormais 1 en monde
  object.updateMatrixWorld(true)
  frameCamera()

  mixer = new THREE.AnimationMixer(model)
  current = null
  play(selected())
  picker.classList.add('ready')

  // Même parade que dans la vue AR : le hook de rendu plutôt que `tick`,
  // pour ne dépendre ni de la boucle d'animation ni du compteur de frames.
  let host = null
  model.traverse((node) => { if (!host && node.isSkinnedMesh) host = node })
  if (!host) return

  host.onBeforeRender = () => {
    const now = performance.now()
    const delta = lastRenderTime ? (now - lastRenderTime) / 1000 : 0
    lastRenderTime = now
    if (delta > 0 && delta < 0.5) mixer.update(delta)
    object.updateMatrixWorld(true)
    host.skeleton.update()
  }
})

const ready = () => {
  cta.removeAttribute('aria-disabled')
  ctaLabel.textContent = 'Lancer la vue AR'
  progress.classList.add('done')
}

preload()
  .then((blob) => {
    previewModel.setAttribute('gltf-model', URL.createObjectURL(blob))
    ready()
  })
  .catch((error) => {
    // Le préchargement est un confort, pas un prérequis : en cas d'échec on
    // laisse passer plutôt que de bloquer l'accès à l'expérience.
    console.warn('[mimosa] préchargement du modèle échoué :', error)
    previewModel.setAttribute('gltf-model', MODEL_URL)
    ready()
  })
