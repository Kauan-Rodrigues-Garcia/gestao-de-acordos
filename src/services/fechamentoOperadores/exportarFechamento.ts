/**
 * exportarFechamento.ts — o Fechamento da gerência como arquivo: Excel e HTML.
 *
 * Pedido de 14/09/2026: «permitir baixar o fechamento, tanto por Excel e pela
 * página HTML». A aba substituiu a planilha da gerência, e a planilha circulava;
 * sem arquivo, alguém voltaria a copiar a tela para um Excel à mão.
 *
 * ## O arquivo é a tela, não outra conta
 *
 * Recebe as MESMAS `linhas` e o MESMO `resumo` que a tela desenha — já calculados
 * por `calculoFechamento` e já na ordem de `ordenarLinhasFechamento`. Nada é
 * recalculado aqui: um arquivo que refizesse a conta seria o primeiro lugar onde
 * o fechamento baixado e o fechamento na tela discordariam.
 *
 * ## Funções puras
 *
 * Nenhuma delas toca `document`: o teste lê a planilha de volta e confere o HTML
 * sem navegador. Entregar o arquivo e registrar o log é de `baixarFechamentoOperadores`.
 */
import { esc, brl } from '@/services/fechamento/formato';
import { COR_QUARTIL } from '@/lib/diasUteis';
import { SITUACOES_FECHAMENTO } from './situacoes';
import type { LinhaFechamento, ResumoFechamento } from './calculoFechamento';

export interface DadosExportacaoFechamento {
  empresaNome: string;
  /** `null` = todos os setores do alcance. */
  setorNome: string | null;
  /** `yyyy-MM`. */
  mes: string;
  /** «setembro/2026». */
  mesRotulo: string;
  /** Mês ainda aberto: fechamento parcial, quartil pelo ritmo até hoje. */
  parcial: boolean;
  geradoEm: Date;
  linhas: readonly LinhaFechamento[];
  resumo: ResumoFechamento;
}

const COLUNAS = [
  'Operador', 'Equipe', 'Fechamento', 'Meta', 'Meta atingida', 'D.U. trabalhado',
  'Situação', 'Alcance meta', 'Quartil', 'Média fat. D.U.',
] as const;

const FORMATO_BRL = '"R$" #,##0.00';
const FORMATO_PCT = '0.00%';

function rotuloSituacao(codigo: string | null): string {
  return SITUACOES_FECHAMENTO.find(s => s.codigo === codigo)?.rotulo ?? '';
}

function rotuloMetaAtingida(l: LinhaFechamento): string {
  if (l.metaAtingida === null) return '';
  return l.metaAtingida === 0 ? 'nenhuma' : `${l.metaAtingida}ª meta`;
}

function rotuloQuartil(q: number | null): string {
  return q === null ? '' : `${q}º quartil`;
}

function rotuloAlcance(fracao: number): string {
  return `${(fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function slug(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function nomeArquivoFechamentoOperadores(
  d: Pick<DadosExportacaoFechamento, 'mes' | 'setorNome'>,
  extensao: 'xlsx' | 'html',
): string {
  return `fechamento-operadores-${d.mes}-${slug(d.setorNome ?? 'todos os setores')}.${extensao}`;
}

// ── Excel ───────────────────────────────────────────────────────────────────

/**
 * A planilha, em duas abas: `Fechamento` (a tabela) e `Resumo` (os cards e as
 * contagens dos gráficos).
 *
 * Valor e alcance entram como NÚMERO com formato de célula, e não como texto
 * «R$ 1.234,56»: a gerência soma, filtra e ordena no Excel, e texto não soma.
 *
 * `@e965/xlsx` por import dinâmico — é pesado e só quem clica em baixar paga.
 */
export async function montarPlanilhaFechamento(d: DadosExportacaoFechamento): Promise<ArrayBuffer> {
  const { utils, write } = await import('@e965/xlsx');

  const corpo = d.linhas.map(l => [
    l.nome,
    l.equipeNome ?? '',
    l.fechamento,
    l.meta,
    rotuloMetaAtingida(l),
    l.duTrabalhado,
    rotuloSituacao(l.situacao),
    l.alcance,
    rotuloQuartil(l.quartil),
    l.mediaPorDu,
  ]);
  const aba = utils.aoa_to_sheet([[...COLUNAS], ...corpo]);
  aba['!cols'] = [
    { wch: 30 }, { wch: 22 }, { wch: 15 }, { wch: 15 }, { wch: 13 },
    { wch: 14 }, { wch: 18 }, { wch: 13 }, { wch: 11 }, { wch: 15 },
  ];
  // Formato por coluna: C, D, J em reais; H em percentual.
  for (let i = 0; i < corpo.length; i++) {
    const r = i + 2;
    for (const col of ['C', 'D', 'J']) {
      const celula = aba[`${col}${r}`];
      if (celula && celula.t === 'n') celula.z = FORMATO_BRL;
    }
    const alcance = aba[`H${r}`];
    if (alcance && alcance.t === 'n') alcance.z = FORMATO_PCT;
  }

  const r = d.resumo;
  const resumo = utils.aoa_to_sheet([
    ['Fechamento', `${d.setorNome ?? 'Todos os setores'} · ${d.mesRotulo}${d.parcial ? ' (parcial)' : ''}`],
    ['Empresa', d.empresaNome],
    [],
    ['Faturamento total', r.faturamentoTotal],
    ['Média por dia útil', r.mediaPorDiaUtil],
    ['Média por funcionário', r.mediaPorFuncionario],
    ['Operadores', d.linhas.length],
    ['Com situação', r.comSituacao],
    [],
    ['Quartil', 'Operadores', 'Representatividade'],
    ...r.porQuartil.map(q => [rotuloQuartil(q.quartil), q.qtd, q.pct]),
    [],
    ['Situação', 'Operadores', 'Representatividade', 'Fechamento'],
    ...r.porSituacao.map(s => [rotuloSituacao(s.codigo), s.qtd, s.pct, s.fechamento]),
  ]);
  resumo['!cols'] = [{ wch: 24 }, { wch: 34 }, { wch: 18 }, { wch: 15 }];
  for (const endereco of ['B4', 'B5', 'B6']) {
    const celula = resumo[endereco];
    if (celula && celula.t === 'n') celula.z = FORMATO_BRL;
  }
  const inicioQuartis = 11;
  r.porQuartil.forEach((_, i) => { const c = resumo[`C${inicioQuartis + i}`]; if (c) c.z = FORMATO_PCT; });
  const inicioSituacoes = inicioQuartis + r.porQuartil.length + 2;
  r.porSituacao.forEach((_, i) => {
    const pct = resumo[`C${inicioSituacoes + i}`];
    if (pct) pct.z = FORMATO_PCT;
    const valor = resumo[`D${inicioSituacoes + i}`];
    if (valor) valor.z = FORMATO_BRL;
  });

  const wb = utils.book_new();
  utils.book_append_sheet(wb, aba, 'Fechamento');
  utils.book_append_sheet(wb, resumo, 'Resumo');
  return write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

// ── HTML ────────────────────────────────────────────────────────────────────

const CSS = `
:root{--fundo:#f1f5f9;--papel:#fff;--texto:#0f172a;--fraco:#64748b;--borda:#e2e8f0;--acento:#6366f1}
@media (prefers-color-scheme:dark){:root{--fundo:#0b1120;--papel:#111827;--texto:#e5e7eb;--fraco:#94a3b8;--borda:#1f2937;--acento:#818cf8}}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:var(--texto);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
.folha{max-width:1180px;margin:0 auto;padding:24px 16px 56px}
header{background:var(--papel);border:1px solid var(--borda);border-radius:16px;padding:20px 24px;margin-bottom:16px}
h1{margin:0;font-size:22px}
.sub{color:var(--fraco);margin:4px 0 0}
.aviso{margin-top:10px;padding:8px 12px;border-radius:10px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.4);font-size:13px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px}
.card{background:var(--papel);border:1px solid var(--borda);border-radius:14px;padding:14px 16px}
.card .rot{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--fraco)}
.card .val{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;margin-top:2px}
section{background:var(--papel);border:1px solid var(--borda);border-radius:14px;padding:16px;margin-bottom:16px}
h2{font-size:15px;margin:0 0 10px}
.rolagem{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:12px}
th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--fraco);text-align:left;padding:8px;border-bottom:1px solid var(--borda);white-space:nowrap}
td{padding:7px 8px;border-bottom:1px solid var(--borda);white-space:nowrap}
tr:last-child td{border-bottom:0}
.n{text-align:right;font-variant-numeric:tabular-nums}
.c{text-align:center}
.fraco{color:var(--fraco)}
.selo{display:inline-block;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:700}
.duas{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.duas section{margin-bottom:0}
footer{color:var(--fraco);font-size:12px;margin-top:16px;text-align:center}
@media print{body{background:#fff}.folha{padding:0}header,section,.card{break-inside:avoid;border-color:#cbd5e1}}
`;

function celulaValor(v: number | null): string {
  return v === null ? '<span class="fraco">—</span>' : esc(brl(v));
}

function seloQuartil(q: number | null): string {
  if (q === null) return '<span class="fraco">—</span>';
  const cor = COR_QUARTIL[q] ?? '#6366f1';
  return `<span class="selo" style="background:${cor}26;color:${cor}">${esc(rotuloQuartil(q))}</span>`;
}

function pctInteiro(fracao: number): string {
  return `${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

/**
 * A página: capa, cards, a tabela na ordem da tela e as duas contagens.
 *
 * Autocontida — CSS embutido, sem script, sem imagem, sem fonte de fora: o
 * arquivo abre de anexo e de pen drive, sem internet. Todo texto que veio do
 * banco passa por `esc`.
 */
export function montarHtmlFechamentoOperadores(d: DadosExportacaoFechamento): string {
  const r = d.resumo;
  const alvo = d.setorNome ?? 'Todos os setores';
  const titulo = `Fechamento · ${alvo} · ${d.mesRotulo}`;
  const preenchidos = d.linhas.filter(l => l.duTrabalhado !== null && l.situacao !== null).length;

  const linhas = d.linhas.map(l => {
    const cor = l.quartil !== null ? COR_QUARTIL[l.quartil] : undefined;
    return `<tr>
<td><strong>${esc(l.nome)}</strong>${l.equipeNome ? `<br><span class="fraco">${esc(l.equipeNome)}</span>` : ''}</td>
<td class="n"><strong>${esc(brl(l.fechamento))}</strong></td>
<td class="n">${l.meta === null ? '<span class="fraco">sem meta</span>' : esc(brl(l.meta))}</td>
<td class="c">${esc(rotuloMetaAtingida(l)) || '<span class="fraco">—</span>'}</td>
<td class="c">${l.duTrabalhado ?? '<span class="fraco">—</span>'}</td>
<td>${esc(rotuloSituacao(l.situacao)) || '<span class="fraco">—</span>'}</td>
<td class="n"${cor && l.alcance !== null ? ` style="color:${cor};font-weight:700"` : ''}>${l.alcance === null ? '<span class="fraco">—</span>' : esc(rotuloAlcance(l.alcance))}</td>
<td class="c">${seloQuartil(l.quartil)}</td>
<td class="n">${celulaValor(l.mediaPorDu)}</td>
</tr>`;
  }).join('\n');

  const quartis = r.porQuartil.map(q => `<tr>
<td>${seloQuartil(q.quartil)}</td><td class="n">${q.qtd}</td><td class="n">${esc(pctInteiro(q.pct))}</td>
</tr>`).join('\n');

  const situacoes = r.porSituacao.filter(s => s.qtd > 0).map(s => `<tr>
<td>${esc(rotuloSituacao(s.codigo))}</td><td class="n">${s.qtd}</td><td class="n">${esc(pctInteiro(s.pct))}</td><td class="n">${esc(brl(s.fechamento))}</td>
</tr>`).join('\n');

  const gerado = d.geradoEm.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="folha">
<header>
  <h1>Fechamento · ${esc(alvo)}</h1>
  <p class="sub">${esc(d.empresaNome)} · ${esc(d.mesRotulo)} · ${d.linhas.length} operadores</p>
  ${d.parcial ? `<div class="aviso">${esc(d.mesRotulo)} ainda está aberto: este fechamento é parcial, e o quartil segue o ritmo até o dia em que foi baixado.</div>` : ''}
</header>

<div class="cards">
  <div class="card"><div class="rot">Faturamento total</div><div class="val">${esc(brl(r.faturamentoTotal))}</div></div>
  <div class="card"><div class="rot">Média por dia útil</div><div class="val">${r.mediaPorDiaUtil === null ? '—' : esc(brl(r.mediaPorDiaUtil))}</div></div>
  <div class="card"><div class="rot">Média por funcionário</div><div class="val">${r.mediaPorFuncionario === null ? '—' : esc(brl(r.mediaPorFuncionario))}</div></div>
  <div class="card"><div class="rot">Preenchidos</div><div class="val">${preenchidos} de ${d.linhas.length}</div></div>
</div>

<section>
  <h2>Operadores, por quartil</h2>
  <div class="rolagem">
  <table>
    <thead><tr>
      <th>Operador</th><th class="n">Fechamento</th><th class="n">Meta</th><th class="c">Meta atingida</th>
      <th class="c">D.U. trabalhado</th><th>Situação</th><th class="n">Alcance meta</th><th class="c">Quartil</th><th class="n">Média fat. D.U.</th>
    </tr></thead>
    <tbody>
${linhas}
    </tbody>
  </table>
  </div>
</section>

<div class="duas">
  <section>
    <h2>Quartis</h2>
    <table><thead><tr><th>Quartil</th><th class="n">Operadores</th><th class="n">Representatividade</th></tr></thead>
    <tbody>${quartis}</tbody></table>
  </section>
  <section>
    <h2>Situações</h2>
    ${situacoes
      ? `<table><thead><tr><th>Situação</th><th class="n">Operadores</th><th class="n">%</th><th class="n">Fechamento</th></tr></thead><tbody>${situacoes}</tbody></table>`
      : '<p class="fraco">Nenhuma situação informada.</p>'}
  </section>
</div>

<footer>Baixado em ${esc(gerado)} · Gestão de Acordos</footer>
</div>
</body>
</html>`;
}
