import sharp from 'sharp'

const DIR = new URL('./assets/', import.meta.url).pathname
const PAD = 8
const SEUIL = 226      // le fond est à 231-235
const RAYON = 5        // rayon de l'ouverture morphologique

const {data, info} = await sharp('/Users/bjoly/Downloads/eric_pq.jpeg')
  .resize(760)
  .extend({top: PAD, bottom: PAD, left: PAD, right: PAD, background: '#ffffff'})
  .ensureAlpha().raw().toBuffer({resolveWithObject: true})

const {width: W, height: H, channels: C} = info
const lum = (i) => data[i * C] * 0.299 + data[i * C + 1] * 0.587 + data[i * C + 2] * 0.114

// 1. Remplissage depuis les bords
let mask = new Uint8Array(W * H)
const pile = []
for (let x = 0; x < W; x++) { pile.push(x); pile.push((H - 1) * W + x) }
for (let y = 0; y < H; y++) { pile.push(y * W); pile.push(y * W + W - 1) }
while (pile.length) {
  const i = pile.pop()
  if (mask[i] || lum(i) < SEUIL) continue
  mask[i] = 1
  const x = i % W, y = (i / W) | 0
  if (x > 0) pile.push(i - 1)
  if (x < W - 1) pile.push(i + 1)
  if (y > 0) pile.push(i - W)
  if (y < H - 1) pile.push(i + W)
}

/**
 * Érosion / dilatation séparables (élément structurant carré).
 * `keep` vaut 0 pour une érosion (min) et 1 pour une dilatation (max).
 */
const morph = (src, r, keep) => {
  const pass = (input, horizontal) => {
    const out = new Uint8Array(W * H)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let v = keep ? 0 : 1
        for (let d = -r; d <= r; d++) {
          const xx = horizontal ? Math.min(W - 1, Math.max(0, x + d)) : x
          const yy = horizontal ? y : Math.min(H - 1, Math.max(0, y + d))
          const s = input[yy * W + xx]
          v = keep ? (v | s) : (v & s)
        }
        out[y * W + x] = v
      }
    }
    return out
  }
  return pass(pass(src, true), false)
}

// 2. Ouverture : les infiltrations plus fines que 2·RAYON disparaissent,
//    la frontière principale du fond est restituée par la dilatation.
const avant = mask.reduce((n, v) => n + v, 0)
mask = morph(morph(mask, RAYON, 0), RAYON, 1)
const apres = mask.reduce((n, v) => n + v, 0)
console.log(`fond : ${(avant / (W * H) * 100).toFixed(1)} % → ${(apres / (W * H) * 100).toFixed(1)} % après ouverture`)

for (let i = 0; i < W * H; i++) if (mask[i]) data[i * C + 3] = 0

// 3. On ne garde que la plus grande composante opaque : l'image d'origine
//    contient une ombre portée et un picto décoratifs, trop peu contrastés
//    pour le seuil, mais détachés du personnage.
{
  const compo = new Int32Array(W * H).fill(-1)
  let meilleure = -1
  let tailleMax = 0
  let courante = 0
  for (let depart = 0; depart < W * H; depart++) {
    if (compo[depart] !== -1 || data[depart * C + 3] === 0) continue
    const file = [depart]
    compo[depart] = courante
    let taille = 0
    while (file.length) {
      const i = file.pop()
      taille++
      const x = i % W, y = (i / W) | 0
      const voisins = []
      if (x > 0) voisins.push(i - 1)
      if (x < W - 1) voisins.push(i + 1)
      if (y > 0) voisins.push(i - W)
      if (y < H - 1) voisins.push(i + W)
      for (const v of voisins) {
        if (compo[v] !== -1 || data[v * C + 3] === 0) continue
        compo[v] = courante
        file.push(v)
      }
    }
    if (taille > tailleMax) { tailleMax = taille; meilleure = courante }
    courante++
  }
  let retires = 0
  for (let i = 0; i < W * H; i++) {
    if (data[i * C + 3] !== 0 && compo[i] !== meilleure) { data[i * C + 3] = 0; retires++ }
  }
  console.log(`composantes : ${courante}, résidus retirés : ${retires} px`)
}

// 4. Recadrage sur la silhouette : l'image d'origine comporte un halo et un
//    picto décoratifs à droite, trop peu contrastés pour être détourés
//    proprement. On ne garde que le personnage.
//    On ignore les résidus isolés en exigeant une colonne/ligne assez remplie.
const colonnes = new Uint32Array(W)
const lignes = new Uint32Array(H)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * C + 3] === 0) continue
    colonnes[x]++
    lignes[y]++
  }
}
const SEUIL_COL = Math.max(6, Math.round(H * 0.012))
const SEUIL_LIG = Math.max(6, Math.round(W * 0.012))
const premier = (arr, seuil) => arr.findIndex(v => v >= seuil)
const dernier = (arr, seuil) => arr.length - 1 - [...arr].reverse().findIndex(v => v >= seuil)

const x0 = Math.max(0, premier(colonnes, SEUIL_COL) - 4)
const x1 = Math.min(W - 1, dernier(colonnes, SEUIL_COL) + 4)
const y0 = Math.max(0, premier(lignes, SEUIL_LIG) - 4)
const y1 = Math.min(H - 1, dernier(lignes, SEUIL_LIG) + 4)
console.log(`recadrage : ${x1 - x0 + 1} x ${y1 - y0 + 1} (source ${W} x ${H})`)

await sharp(data, {raw: {width: W, height: H, channels: C}})
  .extract({left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1})
  .png({compressionLevel: 9}).toFile(`${DIR}/cover_eric.png`)

const decoupe = await sharp(`${DIR}/cover_eric.png`).metadata()
await sharp({create: {width: decoupe.width, height: decoupe.height, channels: 4, background: '#0d0f14'}})
  .composite([{input: `${DIR}/cover_eric.png`}]).png().toFile(`${DIR}/controle_detourage.png`)
console.log('détourage écrit')
