/**
 * Vue AR — Mimosa
 *
 * Détecte un visuel imprimé sur un cylindre en carton et y accroche un modèle
 * 3D animé. Les cibles déposées dans public/image-targets/ sont chargées
 * automatiquement (voir le plugin dans vite.config.js).
 */

// ?debug dans l'URL : affiche la console à l'écran (utile sur mobile, où
// l'inspecteur Safari n'est pas toujours branché).
const debug = new URLSearchParams(location.search).has('debug')
if (debug) {
  document.querySelector('a-scene').setAttribute('xrextras-log-to-screen', '')
  console.log('[ar] build actif : skin-probe-4')
  document.querySelector('#target-outline').setAttribute('visible', 'true')
}

const status = document.querySelector('#status')
const setStatus = (text) => { status.textContent = text }

// --- Loader -----------------------------------------------------------------
const loader = document.querySelector('#loader')
const loaderText = document.querySelector('#loader-text')

const hideLoader = () => loader.classList.add('hidden')
const failLoader = (reason) => {
  loader.classList.add('failed')
  loaderText.textContent = reason
}

import {measureRenderedBox} from './fit.js'

// Clé partagée avec la page d'accueil, qui écrit le choix d'animation.
const ANIMATION_KEY = 'mimosa:animation'

// --- Image targets (étape 2) ------------------------------------------------
// Liste fournie par le plugin Vite : tout JSON déposé dans public/image-targets/
// est pris en compte automatiquement (voir vite.config.js).
const targetUrls = (await import('virtual:image-targets')).default
const hasImageTargets = targetUrls.length > 0

/**
 * Attend que le moteur ET xrextras soient prêts, puis que les composants
 * A-Frame correspondants soient bien enregistrés.
 *
 * On ne peut pas déclarer `xrweb` dans le HTML : xr.js est chargé en `async`
 * (voir ar.html), donc ses composants n'existent pas encore quand A-Frame
 * attache <a-scene>, et A-Frame n'applique jamais rétroactivement un composant
 * enregistré après coup — il se contente de recalculer l'ordre
 * (a-scene.js, écouteur `componentregistered`).
 */
const waitFor = event => new Promise((resolve) => {
  window.addEventListener(event, resolve, {once: true})
})

const engineReady = Promise.all([
  window.XR8 ? null : waitFor('xrloaded'),
  window.XRExtras ? null : waitFor('xrextrasloaded'),
]).then(() => new Promise((resolve) => {
  // XRExtras enregistre xrweb dans son propre écouteur `xrloaded` : selon
  // l'ordre des écouteurs, il peut passer juste après le nôtre.
  const check = () => (AFRAME.components.xrweb ? resolve() : requestAnimationFrame(check))
  check()
}))

const scene = document.querySelector('a-scene')

engineReady.then(async () => {
  // Les JSON sont chargés en HTTP plutôt qu'inlinés : leur `imagePath` est
  // relatif à /image-targets/, et le moteur ira y chercher l'image de
  // luminance au même endroit.
  const imageTargetData = await Promise.all(
    targetUrls.map(url => fetch(url).then(r => r.json()))
  )

  XR8.XrController.configure({
    disableWorldTracking: false,
    ...(hasImageTargets ? {imageTargetData} : {}),
  })

  if (!XR8.XrDevice.isDeviceBrowserCompatible()) {
    failLoader('Ce navigateur ne supporte pas la réalité augmentée. '
      + 'Ouvre la page sur un téléphone (Safari sur iOS, Chrome sur Android).')
    return
  }

  // Les composants xrextras d'abord : xrconfig lit les attributs de la scène
  // dans son init() pour câbler l'écran « appareil non supporté ».
  scene.setAttribute('xrextras-runtime-error', '')
  scene.setAttribute('xrextras-almost-there', '')
  scene.setAttribute('xrconfig', '')
  // xrweb en dernier : c'est lui qui démarre le pipeline caméra.
  scene.setAttribute('xrweb', '')
})

// --- Éclairage d'ambiance --------------------------------------------------
/**
 * Génère un environnement pour les matériaux PBR.
 *
 * Sans `scene.environment`, un matériau metallic/roughness n'a rien à
 * réfléchir : les zones métalliques virent au noir et l'ensemble paraît plat.
 * Un dégradé ciel/sol suffit à retrouver du volume, et se construit sur un
 * canvas — donc aucun fichier HDR à charger.
 */
const buildEnvironment = (renderer) => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128   // équirectangulaire : ratio 2:1

  const ctx = canvas.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
  gradient.addColorStop(0, '#ffffff')     // zénith
  gradient.addColorStop(0.48, '#d5dde8')
  gradient.addColorStop(0.52, '#9a9382')  // horizon
  gradient.addColorStop(1, '#4a4238')     // sol
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const texture = new THREE.CanvasTexture(canvas)
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.colorSpace = THREE.SRGBColorSpace

  const pmrem = new THREE.PMREMGenerator(renderer)
  const target = pmrem.fromEquirectangular(texture)
  pmrem.dispose()
  texture.dispose()
  return target.texture
}

// Le matériau du modèle a `metalness: 1` : sans environnement, ses zones
// métalliques rendent noir. C'est indispensable, pas décoratif.
const applyEnvironment = () => {
  const {renderer, object3D} = scene
  if (!renderer) return false
  object3D.environment = buildEnvironment(renderer)
  object3D.environmentIntensity = 1.1
  return true
}

// Ce module est différé : `renderstart` peut déjà être passé.
if (!applyEnvironment()) {
  scene.addEventListener('renderstart', applyEnvironment, {once: true})
}

// Garde-fou : plutôt qu'un loader qui tourne indéfiniment, on dit ce qui manque.
const watchdog = setTimeout(() => {
  failLoader('La caméra n\'a pas démarré. Vérifie que la page est servie en '
    + 'HTTPS et que l\'accès caméra est autorisé, puis recharge.')
}, 20000)

scene.addEventListener('realityready', () => {
  clearTimeout(watchdog)
  hideLoader()
  setStatus(hasImageTargets
    ? 'Vise le visuel sur le cylindre.'
    : 'Aucune cible image chargée.')
})

scene.addEventListener('camerastatuschange', ({detail}) => {
  if (detail?.status !== 'failed') return
  clearTimeout(watchdog)
  failLoader('Accès à la caméra refusé. Autorise-le dans les réglages du '
    + 'navigateur, puis recharge la page.')
})

scene.addEventListener('xrerror', ({detail}) => {
  clearTimeout(watchdog)
  failLoader(`Erreur du moteur AR : ${detail?.error ?? 'inconnue'}`)
})

const cylinderTarget = document.querySelector('#cylinder-target')
const cylinderContent = document.querySelector('#cylinder-content')
const cylinderModel = document.querySelector('#cylinder-model')

// Hauteur du modèle, en multiple de la hauteur du visuel. 1 = exactement.
const MODEL_FILL = 1

/**
 * Ajuste le modèle à la géométrie réelle de la cible.
 *
 * Le repère de la cible n'est pas en mètres : son échelle est fixée par le
 * moteur à la détection, et le modèle a ses propres unités et son propre
 * centre. Rien ne peut donc être écrit en dur — on mesure les deux au runtime.
 *
 * `xrextrasimagegeometry` livre {height, radiusTop, …} dans les unités du
 * repère de la cible ; la boîte englobante du modèle donne le reste.
 */
let targetHeight = null
let modelReady = false

const fitModel = () => {
  if (targetHeight === null || !modelReady) return

  const outer = cylinderModel.object3D
  const model = cylinderModel.getObject3D('mesh')
  if (!model) return

  // Mesure à transformation neutre, sinon la boîte inclut le calage précédent.
  outer.scale.set(1, 1, 1)
  outer.position.set(0, 0, 0)
  model.position.set(0, 0, 0)
  outer.updateMatrixWorld(true)

  const box = measureRenderedBox(model, outer)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  if (!size.y) return

  // Le recentrage va sur le modèle, l'échelle et le yaw sur l'entité parente.
  // Les mettre sur le même objet ferait tourner le modèle autour d'un point
  // décalé (three.js compose T * R * S : la rotation s'applique autour de
  // l'origine de l'objet, pas du centre du maillage).
  model.position.set(-center.x, -center.y, -center.z)
  outer.scale.setScalar((targetHeight * MODEL_FILL) / size.y)
}

cylinderTarget.addEventListener('xrextrasimagegeometry', ({detail}) => {
  if (!detail?.height) return
  targetHeight = detail.height
  fitModel()
})

cylinderModel.addEventListener('model-loaded', () => {
  modelReady = true
  fitModel()
})

/**
 * Lecture de l'animation + orientation face caméra.
 *
 * ⚠️ Ni l'un ni l'autre ne peut passer par le `tick` d'A-Frame : en session AR,
 * le moteur 8th Wall appelle `renderer.setAnimationLoop(null)` et remplace
 * `window.requestAnimationFrame` pour piloter le rendu lui-même — la boucle
 * d'A-Frame est débranchée et `tick` ne s'exécute plus. Hors session (desktop),
 * elle tourne normalement : d'où un bug invisible en test et bien réel sur
 * appareil.
 *
 * `onBeforeRender` est appelé par le WebGLRenderer à chaque rendu de l'objet,
 * quel que soit le pilote de la boucle — et il fournit la caméra active.
 */

// Diagnostic à l'écran (`?debug`) : sans lui, impossible de distinguer
// « le hook ne se déclenche pas » de « le squelette ne déforme pas ».
const BUILD = 'skin-probe-4'
const vertexProbe = new THREE.Vector3()
let renderCount = 0
let lastReport = 0
let lastSkin = ''
// Chiffre la stabilité du tracking : une perte par seconde ou plus indique un
// problème physique (taille de la cible, reflets, lumière), pas logiciel.
let lostCount = 0
let foundCount = 0
const startedAt = performance.now()
const report = (renderer, host) => {
  renderCount++
  const now = performance.now()
  if (now - lastReport < 1000) return
  lastReport = now

  const skin = [...host.skeleton.boneMatrices.slice(0, 6)].map(v => v.toFixed(3)).join(',')
  const bougeSkin = lastSkin && skin !== lastSkin
  lastSkin = skin

  // getVertexPosition applique morph + transformation par les os : c'est la
  // même mathématique que le shader. Si ce point bouge, les données sont
  // bonnes et le problème est au rendu ; sinon il est en amont.
  let vtx = 'n/a'
  if (typeof host.getVertexPosition === 'function') {
    host.getVertexPosition(0, vertexProbe)
    vtx = `${vertexProbe.x.toFixed(3)},${vertexProbe.y.toFixed(3)},${vertexProbe.z.toFixed(3)}`
  }

  console.log(`[ar ${BUILD}] mixer=${mixer ? mixer.time.toFixed(2) : 'ABSENT'}`
    + ` skinBouge=${bougeSkin ? 'OUI' : 'NON'}`
    + ` vtx=${vtx}`
    + ` skinIdx=${host.geometry.attributes.skinIndex ? 'oui' : 'NON'}`
    + ` bindMode=${host.bindMode}`
    + ` mat=${host.material.type}`
    + ` | pertes=${lostCount} reprises=${foundCount}`
    + ` (${(lostCount / ((now - startedAt) / 60000)).toFixed(1)}/min)`)
}

// Rotation supplémentaire autour de l'axe vertical, en degrés.
// Si le personnage tourne le dos à la caméra, passer à 0.
const MODEL_FACING_OFFSET = 0

const cameraWorld = new THREE.Vector3()
const cameraLocal = new THREE.Vector3()
let mixer = null
let lastRenderTime = 0

const faceCamera = (camera) => {
  camera.getWorldPosition(cameraWorld)
  cameraLocal.copy(cameraWorld)
  // Dans le repère du conteneur, dont l'axe Y est l'axe du cylindre.
  cylinderContent.object3D.worldToLocal(cameraLocal)
  cylinderModel.object3D.rotation.y =
    Math.atan2(cameraLocal.x, cameraLocal.z) + THREE.MathUtils.degToRad(MODEL_FACING_OFFSET)
}

const startClips = (model) => {
  const clips = model.animations
  if (!clips || !clips.length) return

  // Le clip choisi sur la page d'accueil (src/home.js) ; à défaut, le premier.
  const wanted = localStorage.getItem(ANIMATION_KEY)
  const clip = clips.find(c => c.name === wanted) || clips[0]

  mixer = new THREE.AnimationMixer(model)
  mixer.clipAction(clip).play()

  // onBeforeRender n'est appelé que sur un objet effectivement rendu.
  let host = null
  model.traverse((o) => { if (!host && o.isSkinnedMesh) host = o })
  if (!host) return

  host.onBeforeRender = (renderer, sceneObject, camera) => {
    // ⚠️ Ne pas se fier à `renderer.info.render.frame` : three.js ne
    // l'incrémente plus dans render() (la ligne est commentée dans le build),
    // c'est la boucle d'animation qui s'en charge — et 8th Wall la remplace.
    // En session AR le compteur reste figé : une garde basée dessus bloque
    // tout après la première frame. On se cale donc sur l'horloge, où deux
    // passes d'une même frame donnent un delta quasi nul.
    const now = performance.now()
    const delta = lastRenderTime ? (now - lastRenderTime) / 1000 : 0
    lastRenderTime = now

    if (delta > 0 && delta < 0.5) mixer.update(delta)
    faceCamera(camera)

    // ⚠️ three.js conditionne `skeleton.update()` au MEME compteur figé
    // (WebGLObjects.update) : il ne s'exécute donc qu'une fois en session AR,
    // et le maillage reste en pose de liaison pendant que les os s'animent —
    // d'où un modèle en T-pose qui se balance rigidement. On recalcule nous-
    // mêmes les matrices monde des os, puis les matrices de peau.
    cylinderModel.object3D.updateMatrixWorld(true)
    host.skeleton.update()

    if (debug) report(renderer, host)
  }
}

cylinderModel.addEventListener('model-loaded', ({detail}) => startClips(detail.model))
const alreadyLoaded = cylinderModel.getObject3D('mesh')
if (alreadyLoaded) startClips(alreadyLoaded)

/**
 * Délai de grâce sur la perte de cible.
 *
 * `xrextras-named-image-target` masque l'entité dès l'événement `xrimagelost` :
 * un décrochage de quelques images suffit à faire disparaître le personnage.
 * Sur un cylindre de 4 cm, ces micro-pertes sont fréquentes.
 *
 * On conserve donc la dernière pose connue pendant un court instant. Le
 * tracking du monde restant actif, le modèle demeure ancré dans la pièce au
 * lieu de clignoter — et la plupart des décrochages passent inaperçus.
 */
const TARGET_GRACE_MS = 800

let hideAt = 0
const holdLastPose = () => {
  const {object3D} = cylinderTarget
  if (performance.now() >= hideAt) {
    object3D.visible = false
    return
  }
  object3D.visible = true
  requestAnimationFrame(holdLastPose)
}

cylinderTarget.addEventListener('xrextrasfound', () => {
  foundCount++
  hideAt = 0                       // interrompt un maintien en cours
  setStatus('Cible détectée ✓')
})

cylinderTarget.addEventListener('xrextraslost', () => {
  // Le composant masque l'entité juste APRÈS cet événement : on repasse par
  // une frame avant de rétablir la visibilité.
  lostCount++
  hideAt = performance.now() + TARGET_GRACE_MS
  requestAnimationFrame(holdLastPose)
  setStatus('Cible perdue — vise à nouveau le cylindre.')
})
