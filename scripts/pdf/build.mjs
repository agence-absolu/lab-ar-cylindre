import {readFileSync, writeFileSync} from 'node:fs'
import puppeteer from 'puppeteer-core'

const DIR = new URL('./assets/', import.meta.url).pathname
const b64 = (f, type) => `data:${type};base64,${readFileSync(`${DIR}/${f}`).toString('base64')}`

const font = b64('montserrat.ttf', 'font/ttf')
const cover = b64('cover_eric.png', 'image/png')
const target = b64('cible_print.png', 'image/png')
const eric = [0, 1, 2, 3].map(i => b64(`eric_${i}_s.png`, 'image/png'))

// Icônes Tabler (MIT) — téléchargées dans assets/icons/, voir le README.
// On retire l'entête de commentaire et on force la couleur d'encre.
const icone = (nom) => readFileSync(`${DIR}/icons/${nom}.svg`, 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  // Les attributs d'origine (width/height/class/stroke-width) priment sur la
  // feuille de style : on les retire pour piloter la taille depuis le CSS.
  .replace(/\s(width|height|class|stroke-width)="[^"]*"/g, '')
  .replace(/currentColor/g, '#14110d')
  .replace(/<svg/, '<svg class="art" stroke-width="1.6"')
  .trim()

const STEPS = [
  {
    title: 'Imprimez la page 2',
    text: 'Imprimez la page suivante à <b>100 %</b> — sans « ajuster à la page », sans mise à l\u2019échelle. Vérifiez avec la règle imprimée sous le visuel.',
    icon: 'printer',
  },
  {
    title: 'Découpez',
    text: 'Découpez en suivant les quatre repères d\u2019angle. Vous devez obtenir un rectangle de <b>126 × 97 mm</b>.',
    icon: 'scissors',
  },
  {
    title: 'Enroulez',
    text: 'Enroulez le visuel autour d\u2019un <b>rouleau de papier toilette vide</b> (Ø 4 cm). Le côté de 126 mm fait exactement un tour.',
    icon: 'toilet-paper',
  },
  {
    title: 'Collez, puis scannez',
    text: 'Collez la jonction <b>bord à bord</b>, sans recouvrement. Ouvrez ensuite l\u2019application, touchez « Lancer la vue AR » et visez le rouleau.',
    icon: 'bottle',
  },
]

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Montserrat';
    src: url('${font}') format('truetype');
    font-weight: 100 900;
  }
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Montserrat', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; }
  .page:last-child { page-break-after: auto; }

  /* --- Couverture --- */
  .cover { background: #f7f5f0; color: #14110d; }
  .cover img {
    position: absolute; right: 8mm; bottom: 0; width: 98mm;
    /* Fond la zone de contact au sol (résidu de détourage) dans le papier. */
    -webkit-mask-image: linear-gradient(to bottom, #000 86%, transparent 99%);
  }
  .cover .stack { position: absolute; top: 24mm; left: 20mm; width: 120mm; }
  .cover .kicker {
    font-weight: 300; font-size: 8.5pt; letter-spacing: .34em;
    text-transform: uppercase; color: #a8873a;
  }
  .cover h1 {
    margin-top: 7mm;
    font-weight: 900; font-size: 94pt; line-height: .84; letter-spacing: -.04em;
  }
  .cover .rule { margin-top: 9mm; width: 26mm; height: 2.4mm; background: #f0bd21; }
  .cover .sub {
    margin-top: 7mm; width: 92mm;
    font-weight: 300; font-size: 14pt; line-height: 1.42; color: #3d3a34;
  }
  .cover .foot {
    position: absolute; left: 20mm; bottom: 15mm;
    font-weight: 300; font-size: 8.5pt; letter-spacing: .2em;
    text-transform: uppercase; color: #8b857a;
  }

  /* --- Page d'impression --- */
  .print {
    background: #fff; color: #14110d;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 20mm 0;
  }
  .print h2 { font-weight: 900; font-size: 22pt; letter-spacing: -.02em; }
  .print .note { margin-top: 4mm; width: 150mm; text-align: center; font-weight: 300; font-size: 10pt; line-height: 1.5; }
  .print .note b { font-weight: 700; }

  .frame { position: relative; margin-top: 20mm; width: 126mm; height: 97mm; }
  .frame img { width: 126mm; height: 97mm; display: block; }
  .mark { position: absolute; width: 8mm; height: 8mm; }
  .mark::before, .mark::after { content: ''; position: absolute; background: #14110d; }
  .mark::before { width: 8mm; height: .3mm; }
  .mark::after  { height: 8mm; width: .3mm; }
  .tl { top: -10mm; left: -10mm; } .tl::before { bottom: 0; right: 0; } .tl::after { bottom: 0; right: 0; }
  .tr { top: -10mm; right: -10mm; } .tr::before { bottom: 0; left: 0; } .tr::after { bottom: 0; left: 0; }
  .bl { bottom: -10mm; left: -10mm; } .bl::before { top: 0; right: 0; } .bl::after { top: 0; right: 0; }
  .br { bottom: -10mm; right: -10mm; } .br::before { top: 0; left: 0; } .br::after { top: 0; left: 0; }

  .ruler { margin-top: 26mm; width: 100mm; }
  .ruler .bar { position: relative; height: 6mm; border-left: .3mm solid #14110d; border-right: .3mm solid #14110d; border-bottom: .3mm solid #14110d; }
  .ruler .tick { position: absolute; bottom: 0; width: .3mm; height: 3mm; background: #14110d; }
  .ruler .label { margin-top: 2mm; text-align: center; font-weight: 300; font-size: 8.5pt; letter-spacing: .1em; }

  /* --- BD --- */
  .comic { background: #f4f1ea; color: #14110d; padding: 16mm 14mm; }
  .comic h2 { font-weight: 900; font-size: 26pt; letter-spacing: -.025em; }
  .comic .lead { margin-top: 3mm; font-weight: 300; font-size: 10.5pt; max-width: 140mm; line-height: 1.5; }
  .grid { margin-top: 10mm; display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
  .panel { position: relative; background: #fff; border: .6mm solid #14110d; border-radius: 3mm; height: 92mm; overflow: hidden; }
  .panel .num {
    position: absolute; top: 5mm; left: 5mm; width: 10mm; height: 10mm; border-radius: 50%;
    background: #ffd34d; display: grid; place-items: center; font-weight: 900; font-size: 12pt;
  }
  .panel .art { position: absolute; top: 12mm; right: 5mm; width: 28mm; }
  .panel .hero { position: absolute; left: 4mm; bottom: 23mm; height: 46mm; width: auto; }
  .panel .title { position: absolute; top: 7mm; left: 18mm; font-weight: 900; font-size: 13pt; letter-spacing: -.01em; }
  .panel .text {
    position: absolute; left: 5mm; right: 5mm; bottom: 5mm;
    font-weight: 300; font-size: 9.5pt; line-height: 1.45;
  }
  .panel .text b { font-weight: 700; }
  .comic .foot { margin-top: 9mm; font-weight: 300; font-size: 8.5pt; color: #6b6558; }
</style></head><body>

<section class="page cover">
  <img src="${cover}" alt="">
  <div class="stack">
    <p class="kicker">Mimosa AR · Guide de montage</p>
    <h1>Mode<br>d’emploi</h1>
    <div class="rule"></div>
    <p class="sub">prototypez votre rouleau de papier toilette vide et animé</p>
  </div>
  <p class="foot">3 pages · imprimez la page 2 à 100 %</p>
</section>

<section class="page print">
  <h2>Imprimez-moi à 100 %</h2>
  <p class="note">
    Désactivez <b>« ajuster à la page »</b> et toute mise à l’échelle dans la boîte
    d’impression. Le visuel ci-dessous doit mesurer exactement <b>126 × 97 mm</b> —
    126 mm est la circonférence d’un rouleau de Ø 4 cm, il fait donc pile un tour.
  </p>

  <div class="frame">
    <img src="${target}" alt="">
    <span class="mark tl"></span><span class="mark tr"></span>
    <span class="mark bl"></span><span class="mark br"></span>
  </div>

  <div class="ruler">
    <div class="bar">
      ${Array.from({length: 11}, (_, i) => `<span class="tick" style="left:${i * 10}mm"></span>`).join('')}
    </div>
    <p class="label">VÉRIFICATION : CETTE BARRE FAIT 100 MM</p>
  </div>
</section>

<section class="page comic">
  <h2>Quatre étapes, un rouleau</h2>
  <p class="lead">
    Eric vous guide. Comptez cinq minutes, dont l’essentiel à attendre que la colle prenne.
  </p>
  <div class="grid">
    ${STEPS.map((s, i) => `
      <article class="panel">
        <span class="num">${i + 1}</span>
        <h3 class="title">${s.title}</h3>
        ${icone(s.icon)}
        <img class="hero" src="${eric[i]}" alt="">
        <p class="text">${s.text}</p>
      </article>`).join('')}
  </div>
  <p class="foot">Astuce — une impression mate se suit mieux qu’un papier brillant : moins de reflets pour la caméra.<br>Icônes : Tabler Icons (MIT).</p>
</section>

</body></html>`

// Conservé pour contrôle visuel page par page (hors public/, non publié).
writeFileSync(new URL('./preview.html', import.meta.url).pathname, html)

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
})
const page = await browser.newPage()
await page.setContent(html, {waitUntil: 'load'})
await page.evaluateHandle('document.fonts.ready')
await page.pdf({
  path: new URL('../../public/how-to.pdf', import.meta.url).pathname,
  format: 'A4', printBackground: true,
  margin: {top: 0, right: 0, bottom: 0, left: 0},
})
await browser.close()
console.log('PDF généré')
