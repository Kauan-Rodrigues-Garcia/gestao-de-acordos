import original from './original.html?raw';
import capturaUrl from 'html2canvas/dist/html2canvas.min.js?url';
import { ponte } from './ponte';

/** O original permanece intacto para comparação. Só a integração é adaptada.
 * O iframe impede que CSS e temas do sistema alterem a composição das imagens.
 */
export function documentoRelatorio() {
  let html = original
    .replace(/<script src="https:\/\/cdnjs[^"]+xlsx[^"]+"><\/script>/, '')
    .replace('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', capturaUrl)
    .replace("const fmt=v=>Number(v).toLocaleString", "const fmt=v=>(Number(v)/100).toLocaleString")
    .replace('const r2=v=>Math.round(v*100)/100;', 'const r2=v=>Math.round(v);')
    .replace("localStorage.setItem(THEME_KEY,key);", '')
    .replace("localStorage.setItem('pp_mode_v6',mode);", '')
    .replace(/document.addEventListener\('DOMContentLoaded',[\s\S]*?<\/script>/, '</script>')
    .replace(/\.total>0/g, '.total!==0')
    .replace('.filter(r=>r.total!==0)', '.filter(r=>r.months.some(v=>v!==0))')
    .replace(/v>0\?/g, 'v!==0?');
  // Os valores vêm em centavos; percentuais são apenas participação efetiva.
  html = html.replace('<span class="cc-row-pct">56,28%</span>', '<span class="cc-row-pct">${percentual(data.coren,data.total)}</span>')
    .replace('<span class="cc-row-pct">18,76%</span>', '<span class="cc-row-pct">${percentual(data.cofen,data.total)}</span>')
    .replace('<span class="cc-row-pct">24,96%</span>', '<span class="cc-row-pct">${percentual(data.pp,data.total)}</span>')
    .replace("'Pague Play (24,96%):'", "'Pague Play ('+percentual(f.pp,f.total)+'):'")
    .replace("'Coren (56,28%):'", "'Coren ('+percentual(f.coren,f.total)+'):'")
    .replace("'Cofen (18,76%):'", "'Cofen ('+percentual(f.cofen,f.total)+'):'");
  return html.replace('</head>', `<style>#lockOverlay,.hdr-actions,#themePicker,#saveFilterBtn{display:none!important}</style></head>`)
    .replace('</body>', `<script>${ponte}</script></body>`);
}
