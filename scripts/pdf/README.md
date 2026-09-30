# Tutoriel PDF

Génère `public/how-to.pdf` — 3 pages A4 : couverture, visuel à imprimer à
l'échelle, BD de montage.

```bash
npm i --no-save sharp puppeteer-core          # dépendances de build uniquement
node scripts/pdf/build.mjs
```

Les images sources sont déjà dans `assets/`. Pour les régénérer :

| Script | Rôle |
| --- | --- |
| `cutout.mjs` | détoure Eric du JPEG de couverture |
| `render-panels.py` | rend Eric dans 4 poses depuis le `.glb` (Blender) |

`preview.html` est écrit à côté du PDF à chaque génération : il permet de
contrôler les pages une à une dans un navigateur. Il n'est pas publié.

## Icônes

`assets/icons/` — Tabler Icons, licence MIT (copie dans `assets/icons/LICENSE`),
attribution en pied de page 3. Aucune bibliothèque libre ne propose d'icône
« colle » : le flacon (`bottle`) est le substitut le plus lisible.

Les SVG sont nettoyés à l'injection (`width`, `height`, `class`,
`stroke-width` retirés) : ces attributs priment sur la feuille de style et
écrasaient la taille imposée par le CSS.

## Détourage

Le fond de la photo (luminance 231-235) est **plus sombre** que les reflets
spéculaires du crâne (236) : aucun seuil ne peut les séparer, et un simple
remplissage depuis les bords s'infiltre dans la tête par le liseré clair.

D'où trois étapes : remplissage depuis les bords, **ouverture morphologique**
(érosion puis dilatation) qui supprime les infiltrations fines sans reculer la
frontière du fond, puis conservation de la seule plus grande composante opaque
— l'image d'origine comporte une ombre portée et un picto détachés du
personnage.

## Échelle d'impression

La page 2 impose `126 × 97 mm` en dur et porte quatre repères de coupe plus une
règle de 100 mm, pour que le lecteur vérifie que son imprimante n'a pas
redimensionné. 126 mm est la circonférence d'un rouleau de Ø 4 cm : le visuel
fait exactement un tour.
