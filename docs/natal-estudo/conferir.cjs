/**
 * Confere a página do estudo sem abrir janela: monta `pagina.html` dentro de um
 * esqueleto, abre no Edge sem janela (ou no Chromium do Playwright) e salva duas
 * imagens na pasta temporária do sistema:
 *
 *   natal-estudo-grade.png   — os 6 personagens × os 8 estilos, de uma vez
 *   natal-estudo-estilos.png — a seção «Estilos» como a pessoa vê
 *
 * Também imprime erros de console e se a página estoura a largura (desktop e
 * celular). Nada é gravado dentro do repositório.
 *
 * Uso, da raiz do projeto:  node docs/natal-estudo/conferir.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(raiz, 'node_modules', 'playwright'));
const saida = os.tmpdir();

(async () => {
  const corpo = fs.readFileSync(path.join(__dirname, 'pagina.html'), 'utf8');
  // O mesmo esqueleto que o Artifact põe em volta do arquivo ao publicar.
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${corpo}</body></html>`;
  const previa = path.join(saida, 'natal-estudo-previa.html');
  fs.writeFileSync(previa, html);

  let nav;
  try { nav = await chromium.launch({ channel: 'msedge', headless: true }); }
  catch { nav = await chromium.launch({ headless: true }); }
  const pg = await nav.newPage({ viewport: { width: 1280, height: 900 } });
  const erros = [];
  pg.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  pg.on('pageerror', e => erros.push(String(e)));
  await pg.goto('file:///' + previa.replace(/\\/g, '/'));
  await pg.waitForTimeout(1500);

  // A grade inteira só existe aqui, para conferir: a página mostra um estilo por vez.
  await pg.evaluate(() => {
    const g = document.createElement('div');
    g.id = 'tudo';
    g.style.cssText = 'display:grid;grid-template-columns:repeat(8,150px);gap:4px;padding:8px;background:#fff;width:max-content';
    for (const p of Object.keys(PERS)) for (const [k, v] of Object.entries(ESTILOS)) {
      const d = document.createElement('div');
      d.className = 'palco ' + (v.palco || '');
      d.style.padding = '8px';
      d.append(arte(p, k));
      g.append(d);
    }
    document.body.append(g);
  });
  await pg.waitForTimeout(400);
  await pg.locator('#tudo').screenshot({ path: path.join(saida, 'natal-estudo-grade.png') });
  await pg.evaluate(() => document.getElementById('tudo').remove());
  await pg.locator('#estilos').screenshot({ path: path.join(saida, 'natal-estudo-estilos.png') });

  const estouro = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await pg.setViewportSize({ width: 400, height: 800 });
  const estouroCelular = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(JSON.stringify({ erros, estouro, estouroCelular, imagens: saida }, null, 2));
  await nav.close();
})();
