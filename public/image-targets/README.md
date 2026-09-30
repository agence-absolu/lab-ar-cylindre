# Cibles image (étape 2)

Dépose ici **tout le dossier** produit par `@8thwall/image-target-cli` :
le `.json` **et** ses images. Le JSON contient un `imagePath` relatif
(`image-targets/xxx_luminance.jpg`) que le moteur va chercher en HTTP au
runtime — les fichiers doivent donc rester côte à côte, servis à cette URL.

Le plugin `mimosa:image-targets` (voir `vite.config.js`) détecte les `.json`
automatiquement : aucune liste à maintenir. Ajouter ou retirer une cible
recharge la page en dev.

## Générer une cible cylindrique

```bash
npx @8thwall/image-target-cli@latest
```

Réponses, dans l'ordre :

| Question | Réponse |
| --- | --- |
| `path to the image file` | le visuel à plat (avant collage sur le cylindre) |
| `Select the image type` | `2` (cylinder) |
| `Select the unit` | `1` (mm) |
| `circumference of the cylinder` | circonférence du cylindre |
| `width of the image` | largeur du visuel (≤ circonférence) |
| `Use default crop?` | `Y` si le visuel remplit déjà l'image |
| `output folder` | `public/image-targets` |
| `name for the image target` | `cylindre` |

Le `name` doit correspondre à l'attribut
`xrextras-named-image-target="name: …"` dans `ar.html`.
