/**
 * relatorioGestao.ts — a cara do Gestão nos arquivos baixados (HTML e Excel).
 *
 * Pedido de 19/09/2026: os arquivos do Fechamento (a tabela e Premiações e
 * Comissões) saíam com outra cara — índigo, que não é cor do Gestão, e o HTML
 * abria ESCURO sempre que o sistema operacional estava no modo escuro. Agora os
 * dois formatos usam a paleta do tema claro do app, e o HTML é sempre claro.
 *
 * ## A paleta
 *
 * São os tokens de `:root` em `index.css` (o tema claro da BookPlay), passados
 * de OKLCH para hex: o Excel não lê OKLCH, e um HTML aberto de anexo pode cair
 * num navegador antigo. Se o tema do app mudar, é aqui que o arquivo acompanha.
 *
 * ## Sempre claro
 *
 * Nada de `prefers-color-scheme`: o arquivo circula e é impresso, e a gerência
 * quer a mesma folha branca em qualquer máquina. `color-scheme: light` impede o
 * navegador de escurecer os controles por conta própria.
 *
 * ## Autocontido
 *
 * CSS embutido, ícones em SVG inline, nenhuma fonte, imagem ou script de fora —
 * o arquivo abre de anexo e de pen drive, sem internet. Inter e JetBrains Mono
 * entram só se estiverem instaladas; senão, as fontes do sistema.
 *
 * Funções puras: nada de `document`.
 */
import { esc } from '@/services/fechamento/formato';

/** Tema claro do Gestão, em hex sem `#` (o Excel quer assim; o HTML prefixa). */
export const COR_GESTAO = {
  fundo: 'FCFCFC',         // --background
  cartao: 'F5F9FB',        // --card
  texto: '070C0E',         // --foreground
  fraco: '526065',         // --muted-foreground
  tenue: '9AA6AB',
  borda: 'D1D9DC',         // --border
  bordaSuave: 'E4EAEC',
  suave: 'E9F0F2',         // --muted
  realce: 'E3EDF1',        // --accent
  primario: '00648E',      // --primary
  primarioEscuro: '004665',
  primarioClaro: 'BFD9E6',
  sucesso: '008B1D',       // --success
  sucessoFundo: 'E6F4E9',
  alerta: 'C37000',        // --warning
  alertaFundo: 'FDF3E3',
} as const;

/** Os selos de cidade da aba Premiações: violeta (premiação) e céu (comissão). */
export const COR_TIPO_REMUNERACAO = {
  premiacao: { texto: '6D28D9', fundo: 'EDE9FE' },
  comissao: { texto: '0369A1', fundo: 'E0F2FE' },
} as const;

/**
 * Os quartis em tinta forte (texto) e fundo claro (selo). O matiz é o de
 * `COR_QUARTIL` — verde, azul, âmbar, vermelho —, escurecido para ler sobre branco.
 */
export const COR_QUARTIL_ARQUIVO: Record<number, { texto: string; fundo: string; faixa: string }> = {
  1: { texto: '15803D', fundo: 'DCFCE7', faixa: '22C55E' },
  2: { texto: '4338CA', fundo: 'E0E7FF', faixa: '6366F1' },
  3: { texto: 'B45309', fundo: 'FEF3C7', faixa: 'F59E0B' },
  4: { texto: 'B91C1C', fundo: 'FEE2E2', faixa: 'EF4444' },
};

/** Fonte das planilhas: a do Office, que toda máquina da operação tem. */
export const FONTE_PLANILHA = 'Calibri';

/** «17/09/2026, 08:39», no fuso da operação. */
export function rotuloGeradoEm(d: Date): string {
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ── Ícones (lucide, os mesmos da tela) ──────────────────────────────────────

const ICONES = {
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  calendario: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
  pessoas: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  prancheta: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  medalha: '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
  cifrao: '<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/>',
  trofeu: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  selo: '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
} as const;

export type IconeGestao = keyof typeof ICONES;

/** SVG inline, sem `xmlns`: dentro de HTML o navegador não precisa dele. */
function icone(nome: IconeGestao): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome]}</svg>`;
}

// ── CSS ─────────────────────────────────────────────────────────────────────

const c = (k: keyof typeof COR_GESTAO) => `#${COR_GESTAO[k]}`;

/** As regras do app (tabela, card de número, selo) escritas como CSS comum. */
export const CSS_GESTAO = `
:root{
  color-scheme:light;
  --fundo:${c('fundo')};--cartao:${c('cartao')};--texto:${c('texto')};--fraco:${c('fraco')};--tenue:${c('tenue')};
  --borda:${c('borda')};--borda-suave:${c('bordaSuave')};--suave:${c('suave')};--realce:${c('realce')};
  --primario:${c('primario')};--primario-escuro:${c('primarioEscuro')};
  --sucesso:${c('sucesso')};--sucesso-fundo:${c('sucessoFundo')};--alerta:${c('alerta')};--alerta-fundo:${c('alertaFundo')};
  --sans:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
  --mono:"JetBrains Mono",Consolas,"Cascadia Mono","Courier New",monospace;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:var(--fundo);color:var(--texto);font:13px/1.5 var(--sans);-webkit-font-smoothing:antialiased}

.topo{background:#fff;border-bottom:1px solid var(--borda)}
.topo-in{max-width:1280px;margin:0 auto;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;color:var(--fraco)}
.marca{display:flex;align-items:center;gap:8px;font-weight:700;color:var(--texto);font-size:13px}
.marca b{width:24px;height:24px;border-radius:7px;background:var(--primario);color:#fff;display:grid;place-items:center;font-size:12px}

.folha{max-width:1280px;margin:0 auto;padding:24px 20px 48px}
.cab{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.cab>svg{width:26px;height:26px;color:var(--primario);flex-shrink:0}
h1{margin:0;font-size:24px;line-height:1.2;font-weight:700;letter-spacing:-.01em}
.cab p{margin:2px 0 0;color:var(--fraco);font-size:14px}

.aviso{display:flex;gap:8px;align-items:flex-start;border:1px solid rgba(195,112,0,.4);background:rgba(195,112,0,.05);border-radius:12px;padding:8px 12px;font-size:12px;margin-bottom:10px}
.aviso.info{border-color:var(--borda);background:rgba(233,240,242,.5);color:var(--fraco)}

.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:14px 0 18px}
.kpi{--tinta:var(--texto);--tinta-icone:var(--fraco);--tinta-fundo:rgba(233,240,242,.45);--tinta-caixa:var(--suave);--tinta-borda:var(--borda);
  display:flex;justify-content:space-between;gap:8px;border:1px solid var(--tinta-borda);border-radius:12px;padding:16px;
  background:linear-gradient(135deg,var(--tinta-fundo),rgba(255,255,255,0) 70%),#fff}
.kpi.primario{--tinta:var(--primario);--tinta-icone:var(--primario);--tinta-fundo:rgba(0,100,142,.06);--tinta-caixa:rgba(0,100,142,.12);--tinta-borda:rgba(0,100,142,.22)}
.kpi.sucesso{--tinta:var(--sucesso);--tinta-icone:var(--sucesso);--tinta-fundo:rgba(0,139,29,.06);--tinta-caixa:rgba(0,139,29,.12);--tinta-borda:rgba(0,139,29,.22)}
.kpi.alerta{--tinta:var(--alerta);--tinta-icone:var(--alerta);--tinta-fundo:rgba(195,112,0,.07);--tinta-caixa:rgba(195,112,0,.15);--tinta-borda:rgba(195,112,0,.28)}
.kpi .rot{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.05em;color:var(--fraco)}
.kpi .val{font:700 18px/1.25 var(--mono);color:var(--tinta);margin-top:4px;white-space:nowrap}
.kpi .det{font-size:10.5px;color:var(--fraco);margin-top:2px}
.kpi .ico{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:var(--tinta-caixa);color:var(--tinta-icone);flex-shrink:0}
.kpi .ico svg{width:16px;height:16px}

.tabela{border:1px solid var(--borda);border-radius:12px;background:var(--cartao);overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:12px}
thead th{background:var(--suave);color:var(--fraco);font-size:11px;font-weight:600;text-align:left;padding:9px 10px;white-space:nowrap;border-bottom:1px solid var(--borda)}
tbody td{padding:7px 10px;border-top:1px solid var(--borda-suave);vertical-align:middle;background:#fff}
tbody tr:nth-child(even) td{background:var(--cartao)}
tbody tr:first-child td{border-top:0}
tfoot td{padding:10px;background:var(--realce);border-top:2px solid rgba(0,100,142,.35);font-weight:600}
.n{text-align:right;font-family:var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap}
th.n{font-family:var(--sans)}
.c{text-align:center}
.fraco{color:var(--fraco)}
.tenue{color:var(--tenue)}
.nome{font-weight:600;white-space:nowrap}
.nome small{display:block;font-size:10.5px;font-weight:400;color:var(--fraco)}
.pill{display:inline-block;border-radius:999px;padding:2px 8px;font-size:10.5px;font-weight:700;white-space:nowrap;font-family:var(--sans)}
.valor-ok{display:inline-block;border-radius:6px;padding:2px 8px;font:600 13px/1.4 var(--mono);color:var(--sucesso);background:var(--sucesso-fundo);box-shadow:inset 0 0 0 1px rgba(0,139,29,.22);white-space:nowrap}
.total{font:700 13px/1.4 var(--mono);color:var(--primario)}

.grade2{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:12px;margin-top:18px}
.cartao{border:1px solid var(--borda);border-radius:12px;background:#fff;padding:16px}
.cartao h2{margin:0;font-size:14px;font-weight:600}
.cartao .leg{margin:2px 0 12px;font-size:11px;color:var(--fraco)}
.barra{display:grid;grid-template-columns:140px 1fr 118px;gap:10px;align-items:center;padding:4px 0;font-size:12px}
.barra .trilho{height:10px;border-radius:999px;background:var(--suave);overflow:hidden}
.barra .trilho i{display:block;height:100%;border-radius:999px}
.barra .q{text-align:right;font-family:var(--mono);font-variant-numeric:tabular-nums;color:var(--fraco);white-space:nowrap}
.barra .q b{color:var(--texto)}

.nota{margin:8px 2px 0;font-size:11px;color:var(--fraco)}
footer{margin-top:28px;text-align:center;color:var(--fraco);font-size:11px}

@media (max-width:640px){.folha{padding:16px 12px 32px}h1{font-size:20px}.barra{grid-template-columns:96px 1fr 92px}}
@media print{
  body{background:#fff;font-size:11px}
  .topo{display:none}
  .folha{max-width:none;padding:0}
  .kpi,.cartao,.aviso{break-inside:avoid}
  .tabela{overflow:visible;border-radius:0}
  thead{display:table-header-group}
  tr{break-inside:avoid}
}
`;

// ── Peças ───────────────────────────────────────────────────────────────────

export type TomKpiArquivo = 'primario' | 'neutro' | 'sucesso' | 'alerta';

/** O card de número do app (`KpiTile`): rótulo, valor, detalhe e ícone tingido. */
export function kpiHtml(p: { rotulo: string; valor: string; detalhe?: string; tom: TomKpiArquivo; icone: IconeGestao }): string {
  return `<div class="kpi ${p.tom}">
  <div><div class="rot">${esc(p.rotulo)}</div><div class="val">${esc(p.valor)}</div>${p.detalhe ? `<div class="det">${esc(p.detalhe)}</div>` : ''}</div>
  <div class="ico">${icone(p.icone)}</div>
</div>`;
}

export interface AvisoArquivo { tom: 'alerta' | 'info'; texto: string }

/**
 * A página inteira: faixa do Gestão no topo, cabeçalho como o da tela, avisos e
 * o corpo (HTML já montado por quem chama — e já escapado por ele).
 */
export function paginaGestaoHtml(p: {
  tituloAba: string;
  icone: IconeGestao;
  titulo: string;
  subtitulo: string;
  empresaNome: string;
  geradoEm: Date;
  avisos?: readonly AvisoArquivo[];
  corpo: string;
}): string {
  const gerado = rotuloGeradoEm(p.geradoEm);
  const avisos = (p.avisos ?? [])
    .map(a => `<div class="aviso${a.tom === 'info' ? ' info' : ''}">${esc(a.texto)}</div>`)
    .join('\n');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(p.tituloAba)}</title>
<style>${CSS_GESTAO}</style>
</head>
<body>
<div class="topo"><div class="topo-in">
  <span class="marca"><b>G</b>Gestão de Acordos · ${esc(p.empresaNome)}</span>
  <span>Baixado em ${esc(gerado)}</span>
</div></div>
<main class="folha">
<div class="cab">${icone(p.icone)}<div><h1>${esc(p.titulo)}</h1><p>${esc(p.subtitulo)}</p></div></div>
${avisos}
${p.corpo}
<footer>Gestão de Acordos · ${esc(p.empresaNome)} · baixado em ${esc(gerado)}</footer>
</main>
</body>
</html>`;
}
