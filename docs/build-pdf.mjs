// Genera el HTML imprimible del informe: fuentes incrustadas en base64 y
// trazos de sismograma como SVG estático, para que el render sea determinista.
//
//   node build-pdf.mjs <informe-fuente.html> [salida.html]
//
// Después, para el PDF:
//   chrome --headless=new --print-to-pdf=Bitacora-SismosLatam.pdf informe.html
import { readFile, writeFile } from "node:fs/promises";

const SRC = process.argv[2];
const OUT = process.argv[3] ?? "informe.html";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

// El API v1 de Google Fonts devuelve instancias estáticas, y hay que pedir cada
// peso por separado: si se piden varios de golpe responde con la fuente variable,
// que Chrome no incrusta al exportar a PDF (la sustituye por Arial o Georgia).
const FONT_VARIANTS = [
  "Bricolage+Grotesque:500",
  "Bricolage+Grotesque:700",
  "Newsreader:400",
  "Newsreader:600",
  "Newsreader:400italic",
  "IBM+Plex+Mono:400",
  "IBM+Plex+Mono:500",
  "IBM+Plex+Mono:600",
];

/** Descarga cada variante y sustituye el woff2 por un data URI. */
async function inlineFonts() {
  const blocks = [];
  let bytes = 0;
  let files = 0;

  for (const variant of FONT_VARIANTS) {
    const url = `https://fonts.googleapis.com/css?family=${variant}&subset=latin,latin-ext&display=swap`;
    let css = await (
      await fetch(url, { headers: { "User-Agent": UA } })
    ).text();
    for (const fontUrl of [
      ...new Set(css.match(/https:[^)]+\.woff2/g) ?? []),
    ]) {
      const buf = Buffer.from(await (await fetch(fontUrl)).arrayBuffer());
      bytes += buf.length;
      files += 1;
      css = css
        .split(fontUrl)
        .join(`data:font/woff2;base64,${buf.toString("base64")}`);
    }
    blocks.push(css.trim());
  }

  console.log(
    `  fuentes: ${files} archivos woff2 estáticos, ${(bytes / 1024).toFixed(0)} KB`,
  );
  return blocks.join("\n");
}

/** Sismograma reproducible: ruido de fondo y una ráfaga que decae según Omori. */
function traceSvg(seed, w = 700, h = 26) {
  let s = seed;
  const rand = () => (
    (s = (s * 1103515245 + 12345) % 2147483648),
    s / 2147483648
  );
  const mid = h / 2;
  const onset = w * (0.22 + rand() * 0.3);
  const pts = [];
  for (let x = 0; x <= w; x += 1) {
    let amp = 0.6;
    if (x > onset) {
      const t = (x - onset) / (w * 0.16);
      amp = 0.6 + (h * 0.42) / (1 + t) ** 1.15;
    }
    pts.push(`${x},${(mid + (rand() - 0.5) * 2 * amp).toFixed(2)}`);
  }
  return (
    `<svg class="trace" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" ` +
    `xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    `<polyline points="${pts.join(" ")}" fill="none" stroke="currentColor" ` +
    `stroke-width="0.9" vector-effect="non-scaling-stroke"/></svg>`
  );
}

const src = await readFile(SRC, "utf8");
const styleStart = src.indexOf("<style>");
const styleEnd = src.indexOf("</style>") + 8;
const head = src.slice(0, styleStart);
const style = src.slice(styleStart, styleEnd);
let body = src.slice(styleEnd);

const title = /<title>([\s\S]*?)<\/title>/.exec(head)?.[1] ?? "Informe";
// El script del canvas sobra: los trazos pasan a ser SVG en el propio HTML.
body = body.replace(/<script>[\s\S]*?<\/script>/g, "");
body = body.replace(/<canvas data-seed="(\d+)"><\/canvas>/g, (_, seed) =>
  traceSvg(Number(seed)),
);

const fontCss = await inlineFonts();

const printCss = `
<style>
  /* El PDF se imprime siempre en tema claro, en A4. */
  @page { size: A4; margin: 16mm 14mm 15mm; }

  .divider svg.trace {
    flex: 1;
    height: 26px;
    display: block;
    color: var(--trace);
    opacity: 0.8;
  }

  @media print {
    html, body { background: #ffffff; }
    body { font-size: 10.4pt; line-height: 1.5; }
    .page { padding: 0; max-width: none; }

    .masthead { padding: 0 0 1.1rem; break-after: avoid; max-width: none; }
    h1 { font-size: 29pt; }
    h1 .sub { font-size: 12pt; margin-top: 0.45rem; }
    .lede { font-size: 10.8pt; }

    .figures, .phases, .wide, .divider, footer { max-width: none; }
    .col, p, h2, h3, ul.plain, .callout { max-width: none; }

    section { margin-top: 1.5rem; }
    h2 { font-size: 15.5pt; margin-top: 0.6rem; break-after: avoid; }
    h3 { font-size: 10.8pt; break-after: avoid; }
    p { orphans: 3; widows: 3; }

    .divider { break-before: page; break-after: avoid; }
    section:first-of-type .divider { break-before: auto; }
    .divider svg.trace { height: 20px; }

    .figures { break-inside: avoid; margin-top: 1.3rem; }
    .figure b { font-size: 15pt; }
    .phase, .callout, .figure { break-inside: avoid; }

    table { font-size: 8.5pt; min-width: 0; }
    thead { display: table-header-group; }
    tbody tr { break-inside: avoid; }
    td.mono, .num-cell { font-size: 7.7pt; white-space: normal; }
    .wide { overflow: visible; }

    ul.plain li { break-inside: avoid; }
    footer { break-inside: avoid; margin-top: 1.8rem; }
    a { color: #0c6c72; text-decoration: none; }
  }
</style>`;

const out = `<!doctype html>
<html lang="es" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
${fontCss}
</style>
${style}
${printCss}
</head>
<body>
${body.trim()}
</body>
</html>
`;

await writeFile(OUT, out);
console.log(`  ${OUT}: ${(out.length / 1024).toFixed(0)} KB`);
