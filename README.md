# Mimosa AR

WebAR avec le moteur **8th Wall** (open source, sans clé d'application) + A-Frame, servi par Vite.

## Démarrer

Node **20.19+ ou 22.12+** (contrainte de Rolldown, le bundler de Vite 8) — la
version est fixée dans `.nvmrc` :

```bash
nvm use        # lit .nvmrc
```

```bash
npm install
npm run dev     # https://<ip-locale>:5173 — ouvrir sur le téléphone
```

Vite sert en **HTTPS auto-signé** (`@vitejs/plugin-basic-ssl`) : `getUserMedia`
est bloqué en `http://` sur mobile. Le certificat étant auto-signé, il faut
accepter l'avertissement du navigateur au premier lancement.

```bash
npm run build && npm run preview
```

## Tester et debugger sur iPhone

Le câble USB **ne donne pas** d'accès réseau au Mac (il sert uniquement à
l'inspecteur Safari). Deux étapes distinctes :

### 1. Atteindre le serveur

**Même réseau local** — iPhone et Mac sur le même Wi-Fi/LAN, puis ouvrir
l'URL « Network » affichée par `npm run dev` et accepter l'avertissement de
certificat auto-signé.

**Tunnel** (plus fiable : vrai certificat, et iOS est capricieux avec les certs
auto-signés pour `getUserMedia`) :

```bash
npm run dev:tunnel      # Vite en http, sans SSL auto-signé
ngrok http 5173         # ouvrir l'URL https://… sur l'iPhone
```

### 2. Voir la console

- **Inspecteur Safari par USB** : sur l'iPhone, Réglages → Apps → Safari →
  Avancé → activer « Inspecteur web ». Sur le Mac, Safari → Réglages → Avancé →
  « Afficher les fonctionnalités pour développeurs web », puis menu
  Développement → *(nom de l'iPhone)* → la page.
- **Console à l'écran** : ajouter `?debug` à l'URL
  (`…/ar.html?debug`) — active `xrextras-log-to-screen`, pratique sans câble.

## Déploiement

`.github/workflows/deploy.yml` publie `dist/` sur le lab à chaque push sur
`main` (rsync sur SSH). Quatre secrets à créer dans *Settings › Secrets and
variables › Actions* : `LAB_SSH_HOST`, `LAB_SSH_USER`, `LAB_SSH_PASSWORD`, et
`LAB_SSH_KNOWN_HOSTS` (facultatif mais recommandé — sans lui, le premier
contact avec le serveur est cru sur parole).

La démo est servie sous `/<nom npm>/`, pas à la racine du domaine. `vite.config.js`
lit donc `BASE_PATH` :

```bash
BASE_PATH="/mimosa-ar/" npm run build   # ce que fait le workflow
```

> ⚠️ **Vite ne réécrit que les attributs qu'il reconnaît** (`<link href>`,
> `<script type="module" src>`). Tout le reste — les balises `<script>` du
> moteur 8th Wall, `<a-asset-item src>`, les liens vers `ar.html` et le PDF —
> doit être écrit en **relatif** pour survivre à un sous-chemin. Côté
> JavaScript, utiliser `import.meta.env.BASE_URL`.
>
> Les cibles image sont elles aussi référencées en relatif : le champ
> `imagePath` des JSON générés l'est déjà, et se résout au même endroit.

Le déploiement suppose du **HTTPS** : `getUserMedia` est refusé en clair, et la
caméra échouerait sans message explicite.

## Structure

| Fichier | Rôle |
| --- | --- |
| `index.html` | page d'accueil, bouton « Lancer la vue AR » |
| `ar.html` | la scène A-Frame + les balises `<script>` des libs AR |
| `src/ar.js` | configuration du moteur, composant tap-to-place, statuts UI |
| `src/image-targets/` | les cibles image générées (étape 2) |
| `scripts/sync-vendor.js` | recopie les libs de `node_modules` vers `public/external/` |

Les trois libs (`AFRAME`, `XRExtras`, `XR8`) s'exposent en globales et sont
chargées par balise `<script>`, dans cet ordre — le moteur est un binaire, il ne
s'importe pas comme un module ES.

> **Piège à ne pas réintroduire.** `xr.js` doit rester en **`async`**, et les
> composants 8th Wall (`xrweb`, `xrconfig`, `xrextras-*` de scène) doivent être
> posés depuis `src/ar.js`, pas écrits dans le HTML.
>
> `xr.js` enregistre les composants A-Frame dès son exécution mais n'assigne
> `window.XR8` qu'après l'init du wasm. En chargement synchrone, A-Frame attache
> `xrconfig` avant que `XR8` existe → `ReferenceError` dans son `init()` → toute
> l'initialisation de la scène s'interrompt, `xrweb` n'est jamais attaché et le
> **loader tourne dans le vide**. En `async`, l'inverse se produit : les
> composants sont enregistrés après l'attachement de `<a-scene>`, et A-Frame
> n'applique jamais rétroactivement un composant enregistré après coup (il se
> contente de recalculer l'ordre). D'où l'attachement explicite au runtime.
>
> Même raison pour les composants définis dans `src/ar.js` : le module est
> différé, tout composant qu'il enregistrerait arriverait trop tard pour les
> entités du HTML.
>
> Corollaire : **`xrextras-loading` est inutilisable** dans ce montage. Son
> `init()` s'abonne à l'événement `loaded` de la scène pour savoir quand se
> masquer ; attaché après coup, il rate l'événement et son écran tourne
> indéfiniment. D'où le loader maison (`#loader`), masqué sur `realityready`,
> avec un watchdog de 20 s qui affiche la cause plutôt que de mouliner. `public/external/` est
généré, donc gitignoré ; `npm run sync` le régénère (appelé automatiquement en
`postinstall`, `predev` et `prebuild`).

## Stabilité du tracking

Sur un cylindre de 4 cm, les micro-décrochages sont fréquents. Deux raisons
s'additionnent : la caméra n'en voit qu'une petite bande à la fois, et
`xrextras-named-image-target` masque l'entité **dès** l'événement
`xrimagelost` — quelques images perdues suffisent à faire disparaître le modèle.

`src/ar.js` conserve donc la dernière pose connue pendant `TARGET_GRACE_MS`
(800 ms). Le tracking du monde restant actif, le modèle demeure ancré dans la
pièce plutôt que de clignoter.

`?debug` affiche `pertes`, `reprises` et un taux par minute : de quoi mesurer
l'effet d'un changement au lieu de l'estimer. Au-delà d'une perte par minute,
chercher du côté physique (taille, reflets, lumière) plutôt que logiciel.

Leviers, par ordre d'impact décroissant :

| Levier | Pourquoi |
| --- | --- |
| Diamètre du cylindre | 4 cm est petit ; la caméra ne voit qu'une bande de ~40 mm utile. Un tube plus large donne bien plus de pixels de features. |
| Papier mat, pas brillant | les reflets spéculaires effacent localement les features |
| Collage bord à bord | un chevauchement ou un jour rompt la continuité du modèle cylindrique déclaré |
| Lumière diffuse et suffisante | le contre-jour crée des reflets, la pénombre allonge le temps de pose et donc le flou de bougé |
| Mesures exactes | l'épaisseur du papier ajoute au diamètre : remesurer la circonférence sur le rouleau **fini**, pas sur le tube nu |

## Le visuel sur le cylindre

Le câblage est déjà en place dans `ar.html` et `src/ar.js` : il ne manque que la
cible.

### 1. Le visuel

Prends le visuel **à plat**, tel qu'il est avant d'être collé sur le cylindre —
pas une photo du cylindre. Il lui faut beaucoup de détails contrastés et non
répétitifs : un motif régulier ou un aplat ne se tracke pas.

### 2. Générer la cible

```bash
npx @8thwall/image-target-cli@latest
```

| Question | Réponse |
| --- | --- |
| `path to the image file` | le visuel à plat |
| `Select the image type` | `2` (cylinder) |
| `Select the unit` | `1` (mm) |
| `circumference of the cylinder` | circonférence du cylindre |
| `width of the image` | largeur du visuel, ≤ circonférence |
| `Use default crop?` | `Y` si le visuel remplit déjà l'image |
| `output folder` | `public/image-targets` |
| `name for the image target` | `cylindre` |

Seul le **rapport** largeur/circonférence compte (il donne l'angle d'arc), pas
l'unité choisie.

### 3. C'est tout

Le plugin `mimosa:image-targets` détecte le nouveau `.json` et recharge la page.
L'entité `#cylinder-target` se positionne sur le cylindre détecté et
`#cylinder-content` reste accroché dessus.

Garde le dossier généré **entier** dans `public/image-targets/` : le JSON
contient un `imagePath` relatif que le moteur va chercher en HTTP à côté de lui.

Si tu nommes la cible autrement que `cylindre`, mets à jour l'attribut
`xrextras-named-image-target="name: …"` dans `ar.html`.

### Modèle 3D

`public/models/eric.glb` — optimisé avec `@gltf-transform/cli` :

```bash
npx @gltf-transform/cli optimize source.glb public/models/eric.glb \
  --texture-compress webp --texture-size 1024 --compress false --simplify false
```

**8,9 Mo → 1,1 Mo**, VRAM ~134 Mo → ~17 Mo. Les textures faisaient 96 % du
poids (basecolor 4096, metallicRoughness en PNG 2048 à 5,2 Mo) ; le maillage ne
pesait que 756 Ko — d'où `--compress false` : compresser la géométrie
imposerait un décodeur Draco/Meshopt au runtime pour un gain marginal.

WebP est lu nativement par le three.js d'A-Frame (`EXT_texture_webp`) et
supporté par Safari iOS 14+.

#### Animation

Le modèle est animé (marche, boucle). Il est construit par
`scripts/build-model.py` à partir d'un **FBX Mixamo téléchargé « with skin »**
sur le personnage uploadé : maillage, squelette et animation viennent d'une
seule source, donc **aucun retargeting**.

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/build-model.py
npx @gltf-transform/cli optimize /tmp/eric-final.glb public/models/eric.glb \
  --texture-compress webp --texture-size 1024 --compress false --simplify false
```

Deux points que le script gère :

- **Les textures.** Mixamo ne les réexporte pas ; elles sont reprises du dossier
  OBJ d'origine. Le glTF attend UNE texture metallicRoughness (G = rugosité,
  B = métallicité) alors que Tripo en fournit deux séparées : elles sont
  recombinées, et le montage « Separate Color » du matériau est celui que
  l'exportateur glTF de Blender sait relire.
- **L'échelle.** Le FBX est en centimètres et le modèle sort à ~0,0001 unité.
  Le calage au runtime le rattraperait, mais un facteur de plusieurs milliers
  sur un maillage skinné invite les artefacts de précision : le script
  normalise la hauteur à 1 unité.

> ⚠️ **Le retargeting entre deux rigs différents ne marche pas par simple
> transfert d'action.** Mesuré entre le rig d'origine (glTF) et un rig Mixamo
> (FBX) : ~180° d'écart de roulis sur les membres, et des proportions d'os
> divergentes de 130 à 176 %. Trois approches ont échoué — réassignation
> directe (T-pose animée), contraintes Copy Rotation et delta-par-rapport-au-
> repos (membres projetés à 68× la hauteur du corps). Passer par Mixamo
> « with skin » évite tout le problème.
>
> Mixamo n'accepte pas le `.glb` : exporter le modèle en `.obj` pour
> l'auto-rig. Et télécharger depuis la page d'une animation **sans sélectionner
> son personnage** donne le mannequin par défaut (`Beta_Surface`).

### Vérifier une animation

`scripts/check-animation.py` mesure le déplacement des extrémités rapporté à la
distance hanches→tête :

| Résultat | Interprétation |
| --- | --- |
| main ~80-100 %, pied ~100-150 % | marche correcte |
| < 10 % | animation inerte — T-pose animée |
| > 500 % | membres qui explosent |

**À lancer sur tout résultat de retargeting avant intégration.** Constater que
« des valeurs changent » ne prouve rien : une T-pose animée et un maillage qui
explose font tous les deux bouger les matrices d'os. C'est l'erreur qui a coûté
plusieurs allers-retours sur ce projet.

A-Frame ne sait pas jouer les animations d'un glTF — `animation-mixer` vient
d'aframe-extras. `src/ar.js` utilise directement `THREE.AnimationMixer`.

> ⚠️ **Le `tick` d'A-Frame ne s'exécute pas en session AR.** Le moteur 8th Wall
> appelle `renderer.setAnimationLoop(null)` et remplace
> `window.requestAnimationFrame` pour piloter le rendu lui-même : la boucle
> d'A-Frame est débranchée. Tout ce qui dépend de `tick` (mixer d'animation,
> orientation face caméra, etc.) est donc **muet sur appareil alors qu'il
> fonctionne parfaitement sur desktop** — un bug invisible en test.
>
> La parade est `onBeforeRender`, appelé par le WebGLRenderer à chaque rendu de
> l'objet quel que soit le pilote de la boucle, et qui fournit en prime la
> caméra active. Garder un garde sur `renderer.info.render.frame` : plusieurs
> passes de rendu peuvent avoir lieu dans une même frame.
>
> `onBeforeRender` n'est appelé que sur un objet **effectivement rendu** : le
> hook est posé sur le `SkinnedMesh`, pas sur le groupe racine.
>
> Et **ne pas dédoublonner les passes avec `renderer.info.render.frame`** : la
> ligne qui l'incrémente est commentée dans le build three.js embarqué, c'est la
> boucle d'animation qui s'en charge — celle que 8th Wall remplace. En session
> AR le compteur reste figé et une garde basée dessus bloque tout après la
> première frame. Se caler sur `performance.now()` : deux passes d'une même
> frame donnent un delta quasi nul.
>
> **Corollaire, plus vicieux : three.js lui-même dépend de ce compteur.**
> `WebGLObjects.update()` conditionne `skeleton.update()` à `info.render.frame` :
>
> ```js
> if (object.isSkinnedMesh) {
>   const skeleton = object.skeleton
>   if (updateMap.get(skeleton) !== frame) { skeleton.update() }
> }
> ```
>
> Avec un compteur figé, les matrices de peau sont calculées **une seule fois**.
> Les os continuent de s'animer mais le maillage reste en pose de liaison : un
> personnage en T-pose qui se balance rigidement au rythme de la marche. Il faut
> donc appeler `updateMatrixWorld(true)` puis `skeleton.update()` soi-même dans
> le hook.

### Mesurer un modèle skinné

⚠️ **`geometry.attributes.position` n'est pas ce qui est affiché.** Sur un
maillage skinné, c'est la pose de liaison ; le GPU applique ensuite les matrices
d'os. Sur ce modèle : géométrie brute `y ∈ [-0.49, 0.49]`, pose rendue
`y ∈ [0, 1.87]` — presque le double, et entièrement au-dessus de l'origine. Un
calage fondé sur la géométrie brute donne donc un modèle deux fois trop grand
et décalé.

`SkinnedMesh.getVertexPosition()` applique la même transformation que le
shader : c'est la seule mesure qui corresponde à l'image. C'est ce que fait
`src/fit.js`, partagé par la vue AR et la prévisualisation.

**`Box3.setFromObject` ne convient pas non plus** : sur un `SkinnedMesh` il
calcule la boîte de la pose courante puis la met en cache, donc le résultat
dépend de l'instant de l'appel.

### Piège de transformation

**Recentrage et rotation ne vont pas sur le même objet.** three.js compose
`T * R * S` : la rotation s'applique autour de l'origine de l'objet, pas du
centre du maillage. Si l'on pose `position = -centre` et le yaw sur la même
entité, le modèle orbite autour d'un point décalé. Le recentrage va donc sur le
modèle, l'échelle et le yaw sur l'entité parente.

Corollaire : la boîte doit être mesurée dans l'espace **local** du modèle, pas
en monde — la chaîne parente contient le flip 180° de `#cylinder-content`, qui
inverse le signe sur Y.

### Tutoriel PDF

`public/how-to.pdf` — 3 pages A4 générées par `scripts/pdf/` (voir son README) :
couverture, **visuel à imprimer à l'échelle exacte** (126 × 97 mm, avec repères
de coupe et règle de contrôle de 100 mm), et une BD de montage en quatre étapes
avec Eric rendu depuis le `.glb`.

Le lien de téléchargement est sur l'accueil, entre le CTA et la
prévisualisation.

### Prévisualisation sur l'accueil

`index.html` embarque une scène A-Frame (sans 8th Wall) sous le CTA, avec un
sélecteur de trois animations. Le choix est mémorisé (`localStorage`, clé
`mimosa:animation`) et repris par la vue AR.

Le modèle est téléchargé **une seule fois** : `src/home.js` le récupère avec
une progression lisible puis le sert à la scène via un blob, ce qui évite tout
second téléchargement et rend le préchargement indépendant des en-têtes de
cache.

Deux réglages de cadrage : le champ de vision par défaut d'A-Frame est de 80°,
ce qui oblige à coller la caméra au sujet et déforme le personnage — la
prévisualisation est en `fov="30"`. Et A-Frame pose des styles en ligne sur la
scène et son canvas : les faire remplir le conteneur demande `!important`.

### Orientation face caméra

Le modèle pivote autour de l'axe du cylindre pour faire face à la caméra, depuis
le même `onBeforeRender`. La constante `MODEL_FACING_OFFSET` (`src/ar.js`)
ajoute une rotation en degrés — la passer à `0` si le personnage tourne le dos.

La page d'accueil précharge le modèle avant d'activer le CTA (`src/home.js`),
avec une barre de progression. Le fichier passe par le cache HTTP du
navigateur, où A-Frame le retrouve sur `/ar.html`.

### Éclairage

⚠️ **A-Frame 1.8 est en éclairage physiquement correct** : l'intensité par
défaut d'une lumière est `3.14`, pas `1`. Des valeurs autour de 1 donnent un
rendu très sombre — c'est le piège classique.

Le modèle a `metalness: 1` : sans `scene.environment`, ses zones métalliques
rendent **noir**. `src/ar.js` génère donc un environnement (dégradé ciel/sol sur
un canvas → `PMREMGenerator`), sans fichier HDR à charger. Ce n'est pas
décoratif, c'est nécessaire au rendu du matériau.

L'application doit être tentée immédiatement puis, à défaut, sur `renderstart` :
ce module est différé, l'événement peut déjà être passé.

### Orientation de la cible

L'axe Y du repère de la cible pointe **vers le bas** : le modèle sort tête en
bas alors qu'il est à l'endroit dans son propre repère. D'où le
`rotation="180 0 0"` sur `#cylinder-content` (`ar.html`). Le deuxième angle
oriente le personnage autour de l'axe vertical.

Ce point ne se vérifie que sur appareil — hors session AR, aucune pose de cible
n'est appliquée.

### Accrocher ton propre objet 3D

Dans `ar.html`, remplace le cube de `#cylinder-content` :

```html
<a-assets>
  <a-asset-item id="model" src="/models/objet.glb"></a-asset-item>
</a-assets>

<a-entity id="cylinder-content" position="0 0.15 0">
  <a-gltf-model src="#model" scale="0.2 0.2 0.2"></a-gltf-model>
</a-entity>
```

Repère de l'entité cible : **Y = axe du cylindre**, origine au centre du visuel.

⚠️ **Ne mets pas de `scale` en dur** : le repère de la cible n'est pas en mètres,
son échelle est fixée par le moteur à la détection. Une valeur écrite dans le
HTML serait arbitraire.

`src/ar.js` mesure les deux côtés au runtime et les accorde : la hauteur de la
cible vient de l'événement `xrextrasimagegeometry`, celle du modèle de sa boîte
englobante trois.js. Le modèle est ensuite recentré sur l'origine de la cible.

Pour changer de modèle, remplace le fichier dans `public/models/` et l'`src` de
l'`<a-asset-item>` : le calage s'adapte tout seul. La constante `MODEL_FILL`
(`src/ar.js`) règle la hauteur en multiple de celle du visuel — `1` = exactement.

`detail.radiusTop` est disponible pour plaquer quelque chose contre la paroi
plutôt que de centrer.

`xrextras-target-mesh` dessine un repère jaune qui épouse la courbure réelle de
la cible : pratique pour caler l'objet, à retirer ensuite.
