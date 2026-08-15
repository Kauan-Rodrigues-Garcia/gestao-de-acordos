/**
 * fechamentoHtml.ts — o relatório de fechamento como página única.
 *
 * ## Por que HTML, e não PDF ou planilha
 *
 * O arquivo é apresentado em reunião e circula por e-mail e WhatsApp. Um HTML
 * de arquivo único abre em qualquer navegador, sem instalar nada, projeta bem,
 * navega por abas — e imprime em PDF pelo próprio navegador quando alguém
 * quiser o PDF. Planilha responderia bem a "me manda os números" e mal a "mostra
 * para a diretoria".
 *
 * ## Autocontido, e isso é uma restrição real
 *
 * Nenhuma requisição externa: sem CDN, sem fonte da web, sem imagem remota. O
 * arquivo vai ser aberto de um pen drive, de um anexo, de uma máquina sem
 * internet numa sala de reunião. Os gráficos são SVG escrito à mão aqui mesmo,
 * pelo mesmo motivo — trazer uma biblioteca de gráficos significaria embutir
 * centenas de KB de JavaScript em cada download.
 *
 * ## Puro
 *
 * Entra `DadosFechamento`, sai string. Sem Supabase, sem DOM, sem `window` —
 * o que permite testar o relatório inteiro sem navegador e garante que o
 * gerador nunca busque um número por conta própria.
 *
 * ⚠️ TODO texto vindo do banco passa por `esc()`. Nome de cliente, de operador e
 * de setor são digitados por gente; um `<` solto quebraria a página, e um
 * `<script>` num nome de setor viraria execução no navegador de quem abrisse o
 * relatório.
 */

import type {
  DadosFechamento, PontoDia, FatiaForma,
  LinhaOperadorFechamento, LinhaSetorFechamento,
} from './tipos';

// ── Formatação ───────────────────────────────────────────────────────────────

/** Escapa para texto/atributo HTML. A única porta de entrada de dado do banco. */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function brl(v: number): string {
  return (Number(v) || 0).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
  });
}

function num(v: number): string {
  return (Number(v) || 0).toLocaleString('pt-BR');
}

function pct(v: number): string {
  return `${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

/** A paleta dos quartis, igual à do app (`lib/diasUteis`). */
const COR_QUARTIL: Record<number, string> = {
  1: '#22c55e', 2: '#6366f1', 3: '#f59e0b', 4: '#ef4444',
};

function corDaProjecao(p: number | null): string {
  if (p === null) return '#94a3b8';
  if (p >= 100) return COR_QUARTIL[1];
  if (p >= 80) return COR_QUARTIL[2];
  if (p >= 50) return COR_QUARTIL[3];
  return COR_QUARTIL[4];
}

/** Paleta das fatias do donut — estável, para a mesma forma ter sempre a cor. */
const CORES_FORMA = [
  '#6366f1', '#22c55e', '#f59e0b', '#06b6d4',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316',
];

// ── Gráficos (SVG escrito à mão) ─────────────────────────────────────────────

/**
 * Barras da evolução diária, com a linha da meta diária por cima.
 *
 * `viewBox` + `preserveAspectRatio` fazem o gráfico acompanhar a largura da
 * tela sem JavaScript — é o que mantém o relatório legível tanto projetado
 * quanto num celular.
 */
function svgEvolucaoDiaria(dias: PontoDia[], metaDiaria: number | null): string {
  const L = 44, R = 12, T = 14, B = 26;
  const larguraUtil = 720, alturaUtil = 190;
  const W = L + larguraUtil + R;
  const H = T + alturaUtil + B;

  const maxValor = Math.max(
    ...dias.map(d => d.bruto),
    metaDiaria ?? 0,
    1,
  );
  const passo = larguraUtil / Math.max(dias.length, 1);
  const larguraBarra = Math.max(passo * 0.62, 2);
  const y = (v: number) => T + alturaUtil - (v / maxValor) * alturaUtil;

  const barras = dias.map((d, i) => {
    const x = L + i * passo + (passo - larguraBarra) / 2;
    const altura = Math.max(((d.bruto / maxValor) * alturaUtil), d.bruto > 0 ? 1.5 : 0);
    if (altura <= 0) return '';
    return `<rect x="${x.toFixed(1)}" y="${(T + alturaUtil - altura).toFixed(1)}" `
      + `width="${larguraBarra.toFixed(1)}" height="${altura.toFixed(1)}" rx="1.5" `
      + `fill="var(--acento)" opacity="0.85">`
      + `<title>Dia ${d.dia}: ${esc(brl(d.bruto))} · ${d.qtd} pagamento(s)</title></rect>`;
  }).join('');

  // Rótulo a cada 5 dias — todos os 31 viram uma faixa ilegível.
  const rotulos = dias.map((d, i) => {
    if (d.dia !== 1 && d.dia % 5 !== 0) return '';
    const x = L + i * passo + passo / 2;
    return `<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle" `
      + `font-size="10" fill="var(--fraco)">${d.dia}</text>`;
  }).join('');

  const grade = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const valor = maxValor * (1 - f);
    const yy = T + alturaUtil * f;
    return `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" `
      + `stroke="var(--borda)" stroke-width="1" opacity="0.6" />`
      + `<text x="${L - 6}" y="${(yy + 3).toFixed(1)}" text-anchor="end" font-size="9" `
      + `fill="var(--fraco)">${esc(compacto(valor))}</text>`;
  }).join('');

  const linhaMeta = metaDiaria && metaDiaria > 0 && metaDiaria <= maxValor
    ? `<line x1="${L}" y1="${y(metaDiaria).toFixed(1)}" x2="${W - R}" y2="${y(metaDiaria).toFixed(1)}" `
      + `stroke="#ef4444" stroke-width="1.5" stroke-dasharray="5 4" />`
      + `<text x="${W - R}" y="${(y(metaDiaria) - 5).toFixed(1)}" text-anchor="end" font-size="9.5" `
      + `fill="#ef4444" font-weight="600">meta/dia útil ${esc(brl(metaDiaria))}</text>`
    : '';

  return `<svg class="grafico" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" `
    + `aria-label="Recebimento por dia do mês">${grade}${barras}${linhaMeta}${rotulos}</svg>`;
}

/** "R$ 12,3 mil" — o eixo do gráfico não cabe o valor cheio. */
function compacto(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (v >= 1_000) return `${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

/** Rosca das formas de pagamento, desenhada com arcos. */
function svgDonut(formas: FatiaForma[], total: number): string {
  if (!formas.length || total <= 0) return '';
  const cx = 90, cy = 90, raio = 70, espessura = 26;
  let anguloAtual = -Math.PI / 2;

  const arcos = formas.slice(0, CORES_FORMA.length).map((f, i) => {
    const fatia = (f.bruto / total) * Math.PI * 2;
    // Fatia de volta inteira não pode virar arco (início = fim): vira círculo.
    if (fatia >= Math.PI * 2 - 0.0001) {
      return `<circle cx="${cx}" cy="${cy}" r="${raio - espessura / 2}" fill="none" `
        + `stroke="${CORES_FORMA[i]}" stroke-width="${espessura}" />`;
    }
    if (fatia <= 0.0001) return '';
    const x1 = cx + Math.cos(anguloAtual) * (raio - espessura / 2);
    const y1 = cy + Math.sin(anguloAtual) * (raio - espessura / 2);
    anguloAtual += fatia;
    const x2 = cx + Math.cos(anguloAtual) * (raio - espessura / 2);
    const y2 = cy + Math.sin(anguloAtual) * (raio - espessura / 2);
    const maior = fatia > Math.PI ? 1 : 0;
    return `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${raio - espessura / 2} ${raio - espessura / 2} `
      + `0 ${maior} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}" fill="none" stroke="${CORES_FORMA[i]}" `
      + `stroke-width="${espessura}">`
      + `<title>${esc(f.rotulo)}: ${esc(brl(f.bruto))} (${esc(pct(f.pct))})</title></path>`;
  }).join('');

  const legenda = formas.slice(0, CORES_FORMA.length).map((f, i) => `
    <li>
      <span class="ponto" style="background:${CORES_FORMA[i]}"></span>
      <span class="forma-nome">${esc(f.rotulo)}</span>
      <span class="forma-val">${esc(brl(f.bruto))}</span>
      <span class="forma-pct">${esc(pct(f.pct))}</span>
    </li>`).join('');

  return `<div class="donut-bloco">
    <svg viewBox="0 0 180 180" class="donut" role="img" aria-label="Recebimento por forma de pagamento">
      ${arcos}
      <text x="90" y="86" text-anchor="middle" font-size="11" fill="var(--fraco)">total</text>
      <text x="90" y="103" text-anchor="middle" font-size="13" font-weight="700" fill="var(--texto)">${esc(compacto(total))}</text>
    </svg>
    <ul class="legenda-formas">${legenda}</ul>
  </div>`;
}

/** Barra de progresso da meta, com o excedente marcado quando passa de 100%. */
function barraMeta(pctValor: number): string {
  const cheia = Math.min(pctValor, 100);
  const cor = corDaProjecao(pctValor);
  return `<div class="barra"><div class="barra-fill" style="width:${cheia.toFixed(1)}%;background:${cor}"></div></div>`;
}

// ── Blocos da página ─────────────────────────────────────────────────────────

function cartao(rotulo: string, valor: string, apoio?: string, cor?: string): string {
  return `<div class="cartao">
    <span class="cartao-rotulo">${esc(rotulo)}</span>
    <strong class="cartao-valor"${cor ? ` style="color:${cor}"` : ''}>${esc(valor)}</strong>
    ${apoio ? `<span class="cartao-apoio">${esc(apoio)}</span>` : ''}
  </div>`;
}

function tabelaOperadores(linhas: LinhaOperadorFechamento[], mostrarSetor: boolean): string {
  if (!linhas.length) {
    return '<p class="vazio">Nenhum operador com movimento ou meta neste escopo.</p>';
  }
  const corpo = linhas.map((o, i) => `
    <tr>
      <td class="pos">${i + 1}</td>
      <td>
        <strong>${esc(o.nome)}</strong>
        <span class="sub">${esc(o.usuario)}${o.equipeNome ? ` · ${esc(o.equipeNome)}` : ''}</span>
      </td>
      ${mostrarSetor ? `<td>${esc(o.setorNome ?? '—')}</td>` : ''}
      <td class="n">${esc(brl(o.bruto))}</td>
      <td class="n">${esc(num(o.qtd))}</td>
      <td class="n">${o.meta !== null ? esc(brl(o.meta)) : '<span class="fraco">—</span>'}</td>
      <td class="n">${o.meta !== null
        ? `<span style="color:${corDaProjecao(o.pctMeta)};font-weight:600">${esc(pct(o.pctMeta))}</span>`
        : '<span class="fraco">—</span>'}</td>
      <td class="n">${o.diferenca !== null
        ? `<span style="color:${o.diferenca >= 0 ? COR_QUARTIL[1] : COR_QUARTIL[4]}">${o.diferenca >= 0 ? '+' : '−'} ${esc(brl(Math.abs(o.diferenca)))}</span>`
        : '<span class="fraco">—</span>'}</td>
      <td class="n">${o.quartil !== null
        ? `<span class="pilula" style="background:${COR_QUARTIL[o.quartil]}22;color:${COR_QUARTIL[o.quartil]}">${o.quartil}º</span>`
        : '<span class="fraco">—</span>'}</td>
    </tr>`).join('');

  return `<div class="rolagem"><table class="grade">
    <thead><tr>
      <th>#</th><th>Operador</th>${mostrarSetor ? '<th>Setor</th>' : ''}
      <th class="n">Recebido</th><th class="n">Pagtos</th><th class="n">Meta</th>
      <th class="n">% meta</th><th class="n">vs. esperado</th><th class="n">Quartil</th>
    </tr></thead>
    <tbody>${corpo}</tbody>
  </table></div>`;
}

function tabelaSetores(linhas: LinhaSetorFechamento[]): string {
  if (!linhas.length) return '<p class="vazio">Nenhum setor com movimento no mês.</p>';
  const corpo = linhas.map((s, i) => `
    <tr>
      <td class="pos">${i + 1}</td>
      <td><strong>${esc(s.nome)}</strong><span class="sub">${esc(num(s.operadores))} operador(es)</span></td>
      <td class="n">${esc(brl(s.bruto))}</td>
      <td class="n">${esc(num(s.qtd))}</td>
      <td class="n">${s.meta !== null ? esc(brl(s.meta)) : '<span class="fraco">—</span>'}</td>
      <td class="n">${s.meta !== null
        ? `<span style="color:${corDaProjecao(s.pctMeta)};font-weight:600">${esc(pct(s.pctMeta))}</span>`
        : '<span class="fraco">—</span>'}</td>
      <td class="n">${esc(pct(s.pctDaEmpresa))}</td>
      <td class="participacao">${barraMeta(s.pctDaEmpresa)}</td>
    </tr>`).join('');

  return `<div class="rolagem"><table class="grade">
    <thead><tr>
      <th>#</th><th>Setor</th><th class="n">Recebido</th><th class="n">Pagtos</th>
      <th class="n">Meta</th><th class="n">% meta</th><th class="n">% da empresa</th><th>Participação</th>
    </tr></thead>
    <tbody>${corpo}</tbody>
  </table></div>`;
}

// ── Página ───────────────────────────────────────────────────────────────────

interface Aba { id: string; rotulo: string; conteudo: string }

export function montarHtmlFechamento(d: DadosFechamento): string {
  const { alvo, resumo } = d;
  const mostrarSetorNaTabela = alvo.nivel === 'diretoria';

  // ── Aba 1: Fechamento ──────────────────────────────────────────────────────
  const proj = resumo.projecao;
  const cartoes = [
    cartao('Total recebido', brl(resumo.totalBruto),
      `${num(resumo.qtdPagamentos)} pagamento(s)`, COR_QUARTIL[1]),
    resumo.totalHO > 0
      ? cartao('H.O. retido', brl(resumo.totalHO), 'parcela que fica na operação')
      : '',
    resumo.meta !== null
      ? cartao('Meta do mês', brl(resumo.meta), `${pct(resumo.pctMeta)} alcançado`)
      : '',
    proj
      ? cartao('Projeção', pct(proj.projecaoPct), 'do esperado até o fim do mês',
        corDaProjecao(proj.projecaoPct))
      : '',
    proj
      ? cartao('Diferença', `${proj.diferenca >= 0 ? '+' : '−'} ${brl(Math.abs(proj.diferenca))}`,
        proj.diferenca >= 0 ? 'acima do esperado' : 'abaixo do esperado',
        proj.diferenca >= 0 ? COR_QUARTIL[1] : COR_QUARTIL[4])
      : '',
    proj?.quartil
      ? cartao('Quartil', `${proj.quartil.quartil}º`, `faixa a partir de ${pct(proj.quartil.min_pct)}`,
        COR_QUARTIL[proj.quartil.quartil])
      : '',
    cartao('Dias úteis', `${d.diasUteis.decorridos} de ${d.diasUteis.total}`,
      alvo.mesFechado ? 'mês fechado' : 'mês em andamento'),
    resumo.melhorDia
      ? cartao('Melhor dia', `Dia ${resumo.melhorDia.dia}`,
        `${brl(resumo.melhorDia.bruto)} · ${num(resumo.melhorDia.qtd)} pagamento(s)`)
      : '',
  ].filter(Boolean).join('');

  const blocoVinculo = resumo.vinculo ? `
    <section class="painel">
      <h3>Composição por vínculo</h3>
      <p class="ajuda">
        Classificação que vem do próprio relatório do ERP (coluna “Tipo comissão”).
        Os três somam exatamente o total recebido acima.
      </p>
      <div class="cartoes tres">
        ${cartao('Recebimento direto', brl(resumo.vinculo.direto),
          `${num(resumo.vinculo.qtdDireto)} pagamento(s)`, '#6366f1')}
        ${cartao('Recebimento extra', brl(resumo.vinculo.extra),
          `${num(resumo.vinculo.qtdExtra)} pagamento(s)`, '#f59e0b')}
        ${cartao('Sem vínculo definido', brl(resumo.vinculo.naoTabulado),
          `${num(resumo.vinculo.qtdNaoTabulado)} pagamento(s) sem classificação`, '#94a3b8')}
      </div>
    </section>` : '';

  const abaFechamento = `
    <section class="painel destaque-meta">
      <div class="meta-cabecalho">
        <div>
          <span class="rotulo-forte">${esc(resumo.rotulo)}</span>
          <strong class="total-grande">${esc(brl(resumo.totalBruto))}</strong>
        </div>
        ${resumo.meta !== null ? `<div class="meta-lado">
          <span class="rotulo-forte">${esc(pct(resumo.pctMeta))} da meta</span>
          <span class="fraco">${esc(brl(resumo.meta))}</span>
        </div>` : ''}
      </div>
      ${resumo.meta !== null ? barraMeta(resumo.pctMeta) : ''}
    </section>

    <div class="cartoes">${cartoes}</div>

    ${blocoVinculo}

    <section class="painel">
      <h3>Evolução diária</h3>
      <p class="ajuda">Recebimento por dia do mês. A linha tracejada é a meta por dia útil.</p>
      ${svgEvolucaoDiaria(resumo.porDia, proj?.metaDiaria ?? null)}
    </section>

    ${resumo.porForma.length ? `<section class="painel">
      <h3>Formas de pagamento</h3>
      ${svgDonut(resumo.porForma, resumo.totalBruto)}
    </section>` : ''}`;

  // ── Demais abas ────────────────────────────────────────────────────────────
  const abas: Aba[] = [{ id: 'fechamento', rotulo: 'Fechamento', conteudo: abaFechamento }];

  if (d.operadores.length) {
    abas.push({
      id: 'operadores',
      rotulo: 'Operadores',
      conteudo: `<section class="painel">
        <h3>Detalhamento por operador</h3>
        <p class="ajuda">
          Mesma leitura do Painel do Líder: recebido no mês, meta, quanto disso foi
          alcançado e a posição contra o esperado até aqui.
        </p>
        ${tabelaOperadores(d.operadores, mostrarSetorNaTabela)}
      </section>`,
    });
  }

  const quartisComGente = d.quartis.filter(q => q.operadores.length);
  if (quartisComGente.length) {
    const blocos = quartisComGente.map(q => `
      <div class="quartil-bloco">
        <h4 style="color:${COR_QUARTIL[q.faixa.quartil] ?? '#64748b'}">
          ${q.faixa.quartil}º quartil
          <span class="fraco">a partir de ${esc(pct(q.faixa.min_pct))} do esperado</span>
        </h4>
        <ul class="lista-quartil">
          ${q.operadores.map(o => `<li>
            <span>${esc(o.nome)}</span>
            <span class="n">${esc(brl(o.bruto))}</span>
            <span class="n" style="color:${corDaProjecao(o.projecaoPct)}">${esc(pct(o.projecaoPct ?? 0))}</span>
          </li>`).join('')}
        </ul>
      </div>`).join('');

    abas.push({
      id: 'quartis',
      rotulo: 'Quartis',
      conteudo: `<section class="painel">
        <h3>Distribuição por quartil</h3>
        <p class="ajuda">
          O quartil sai da projeção (recebido ÷ esperado até aqui), com as faixas
          configuradas na aba Metas. Quem não tem meta cadastrada não aparece —
          sem alvo não existe projeção.
        </p>
        <div class="quartis">${blocos}</div>
      </section>`,
    });
  }

  if (d.ranking.length > 1) {
    const podio = d.ranking.slice(0, 3).map((o, i) => `
      <div class="podio-item podio-${i + 1}">
        <span class="podio-pos">${i + 1}º</span>
        <strong>${esc(o.nome)}</strong>
        <span class="podio-valor">${esc(brl(o.bruto))}</span>
        <span class="fraco">${esc(num(o.qtd))} pagamento(s)</span>
      </div>`).join('');

    const maior = d.ranking[0]?.bruto || 1;
    const linhas = d.ranking.map((o, i) => `
      <li>
        <span class="rank-pos">${i + 1}</span>
        <span class="rank-nome">${esc(o.nome)}</span>
        <span class="rank-barra"><i style="width:${((o.bruto / maior) * 100).toFixed(1)}%"></i></span>
        <span class="rank-valor">${esc(brl(o.bruto))}</span>
      </li>`).join('');

    abas.push({
      id: 'ranking',
      rotulo: 'Ranking',
      conteudo: `<section class="painel">
        <h3>Ranking do mês</h3>
        <div class="podio">${podio}</div>
        <ol class="rank">${linhas}</ol>
      </section>`,
    });
  }

  if (d.destaques.length) {
    const linhas = d.destaques.map(x => `
      <tr>
        <td>${esc(x.diaRotulo)}</td>
        <td><strong>${esc(x.nome)}</strong></td>
        <td class="n">${esc(brl(x.total))}</td>
        <td class="n">${esc(num(x.pagamentos))}</td>
      </tr>`).join('');

    abas.push({
      id: 'destaques',
      rotulo: 'Destaques do dia',
      conteudo: `<section class="painel">
        <h3>Quem mais recebeu em cada dia</h3>
        <p class="ajuda">Um destaque por dia com movimento no mês.</p>
        <div class="rolagem"><table class="grade">
          <thead><tr><th>Dia</th><th>Destaque</th><th class="n">Recebido</th><th class="n">Pagtos</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table></div>
      </section>`,
    });
  }

  if (d.setores.length) {
    abas.push({
      id: 'diretoria',
      rotulo: 'Painel da Diretoria',
      conteudo: `<section class="painel">
        <h3>Comparativo entre setores</h3>
        <p class="ajuda">
          Consolidado da empresa no mês. A coluna “% da empresa” mostra quanto do
          total passou por cada setor.
        </p>
        ${tabelaSetores(d.setores)}
      </section>`,
    });
  }

  // ── Montagem ───────────────────────────────────────────────────────────────
  const botoes = abas.map((a, i) => `<button class="aba${i === 0 ? ' ativa' : ''}" `
    + `data-alvo="${esc(a.id)}" type="button">${esc(a.rotulo)}</button>`).join('');

  const paineis = abas.map((a, i) => `<div class="conteudo${i === 0 ? ' ativa' : ''}" `
    + `id="${esc(a.id)}">${a.conteudo}</div>`).join('');

  const avisos = d.avisos.length ? `
    <section class="avisos">
      <h3>Observações sobre estes números</h3>
      <ul>${d.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
    </section>` : '';

  const subtitulo = [
    alvo.setorNome ? `Setor ${alvo.setorNome}` : null,
    alvo.operadorNome,
    alvo.empresaNome,
  ].filter(Boolean).join(' · ');

  const titulo = `Fechamento ${alvo.mesRotulo} — ${subtitulo || alvo.empresaNome}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<style>
:root{
  --fundo:#f6f7fb; --papel:#ffffff; --texto:#0f172a; --fraco:#64748b;
  --borda:#e2e8f0; --acento:#6366f1; --acento-suave:#eef2ff;
}
@media (prefers-color-scheme: dark){
  :root{
    --fundo:#0b1120; --papel:#111827; --texto:#e5e7eb; --fraco:#94a3b8;
    --borda:#1f2937; --acento:#818cf8; --acento-suave:#1e1b4b;
  }
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--fundo); color:var(--texto);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  font-size:14px; line-height:1.5;
}
.folha{max-width:1120px;margin:0 auto;padding:24px 20px 64px}
header.capa{
  background:var(--papel); border:1px solid var(--borda); border-radius:16px;
  padding:22px 24px; margin-bottom:18px;
}
header.capa .selo{
  display:inline-block; font-size:11px; font-weight:700; letter-spacing:.08em;
  text-transform:uppercase; color:var(--acento); background:var(--acento-suave);
  padding:4px 10px; border-radius:999px; margin-bottom:10px;
}
header.capa h1{margin:0;font-size:26px;line-height:1.2}
header.capa .linha-meta{margin-top:8px;color:var(--fraco);font-size:13px}
.abas{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
.aba{
  border:1px solid var(--borda); background:var(--papel); color:var(--fraco);
  padding:8px 14px; border-radius:10px; font-size:13px; font-weight:600;
  cursor:pointer; font-family:inherit;
}
.aba:hover{color:var(--texto)}
.aba.ativa{background:var(--acento);border-color:var(--acento);color:#fff}
.conteudo{display:none}
.conteudo.ativa{display:block}
.painel{
  background:var(--papel); border:1px solid var(--borda); border-radius:14px;
  padding:18px 20px; margin-bottom:14px;
}
.painel h3{margin:0 0 4px;font-size:15px}
.painel h4{margin:0 0 8px;font-size:13px;display:flex;gap:8px;align-items:baseline}
.ajuda{margin:0 0 14px;color:var(--fraco);font-size:12.5px}
.destaque-meta .meta-cabecalho{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:12px}
.rotulo-forte{display:block;font-size:12px;color:var(--fraco);text-transform:uppercase;letter-spacing:.05em;font-weight:700}
.total-grande{font-size:34px;font-weight:800;letter-spacing:-.02em;display:block;margin-top:2px}
.meta-lado{text-align:right}
.barra{height:10px;background:var(--borda);border-radius:999px;overflow:hidden}
.barra-fill{height:100%;border-radius:999px}
.cartoes{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px}
.cartoes.tres{grid-template-columns:repeat(auto-fit,minmax(210px,1fr));margin-bottom:0}
.cartao{background:var(--papel);border:1px solid var(--borda);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:3px}
.cartao-rotulo{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--fraco)}
.cartao-valor{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
.cartao-apoio{font-size:11.5px;color:var(--fraco)}
.grafico{width:100%;height:auto;display:block}
.donut-bloco{display:flex;gap:24px;align-items:center;flex-wrap:wrap}
.donut{width:180px;height:180px;flex:0 0 auto}
.legenda-formas{list-style:none;margin:0;padding:0;flex:1;min-width:240px}
.legenda-formas li{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--borda);font-size:13px}
.legenda-formas li:last-child{border-bottom:0}
.ponto{width:10px;height:10px;border-radius:3px;flex:0 0 auto}
.forma-nome{flex:1}
.forma-val{font-variant-numeric:tabular-nums;font-weight:600}
.forma-pct{color:var(--fraco);min-width:52px;text-align:right;font-variant-numeric:tabular-nums}
.rolagem{overflow-x:auto}
table.grade{width:100%;border-collapse:collapse;font-size:13px;min-width:640px}
table.grade th{
  text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;
  color:var(--fraco);padding:8px 10px;border-bottom:1px solid var(--borda);white-space:nowrap;
}
table.grade td{padding:9px 10px;border-bottom:1px solid var(--borda);vertical-align:middle}
table.grade tr:last-child td{border-bottom:0}
table.grade .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
table.grade .pos{color:var(--fraco);width:34px;font-variant-numeric:tabular-nums}
table.grade .sub{display:block;font-size:11px;color:var(--fraco)}
.participacao{width:130px}
.pilula{padding:2px 8px;border-radius:999px;font-size:11.5px;font-weight:700}
.fraco{color:var(--fraco);font-weight:400}
.vazio{color:var(--fraco);font-size:13px;margin:0}
.quartis{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.quartil-bloco{border:1px solid var(--borda);border-radius:12px;padding:12px 14px}
.lista-quartil{list-style:none;margin:0;padding:0}
.lista-quartil li{display:flex;gap:10px;justify-content:space-between;padding:4px 0;font-size:12.5px;border-bottom:1px solid var(--borda)}
.lista-quartil li:last-child{border-bottom:0}
.lista-quartil .n{font-variant-numeric:tabular-nums}
.podio{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px}
.podio-item{border:1px solid var(--borda);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:2px}
.podio-1{border-color:#f59e0b;background:#f59e0b12}
.podio-2{border-color:#94a3b8;background:#94a3b812}
.podio-3{border-color:#b45309;background:#b4530912}
.podio-pos{font-size:12px;font-weight:800;color:var(--fraco)}
.podio-valor{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}
ol.rank{list-style:none;margin:0;padding:0}
ol.rank li{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--borda)}
ol.rank li:last-child{border-bottom:0}
.rank-pos{width:26px;color:var(--fraco);font-variant-numeric:tabular-nums;font-size:12px}
.rank-nome{flex:0 0 200px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rank-barra{flex:1;height:8px;background:var(--borda);border-radius:999px;overflow:hidden;min-width:60px}
.rank-barra i{display:block;height:100%;background:var(--acento);border-radius:999px}
.rank-valor{font-variant-numeric:tabular-nums;font-weight:600;font-size:13px;min-width:110px;text-align:right}
.avisos{border:1px solid var(--borda);border-left:3px solid #f59e0b;border-radius:12px;background:var(--papel);padding:14px 18px;margin-top:18px}
.avisos h3{margin:0 0 8px;font-size:13px}
.avisos ul{margin:0;padding-left:18px;color:var(--fraco);font-size:12.5px}
.avisos li{margin-bottom:5px}
footer{margin-top:22px;color:var(--fraco);font-size:11.5px;text-align:center}
@media print{
  body{background:#fff}
  .abas{display:none}
  /* Impressão mostra TUDO: quem imprime quer o documento inteiro, não a aba
     que por acaso estava aberta na hora. */
  .conteudo{display:block!important;page-break-after:always}
  .painel,.cartao{break-inside:avoid}
}
</style>
</head>
<body>
<div class="folha">
  <header class="capa">
    <span class="selo">Fechamento do mês${alvo.mesFechado ? ' · mês fechado' : ' · parcial'}</span>
    <h1>${esc(alvo.mesRotulo)}</h1>
    <div class="linha-meta">
      ${esc(subtitulo)} · gerado por ${esc(alvo.geradoPor)} em ${esc(alvo.geradoEm)}
    </div>
  </header>

  <nav class="abas">${botoes}</nav>
  ${paineis}
  ${avisos}

  <footer>
    Documento gerado pelo sistema de gestão de acordos. Os valores vêm do
    relatório analítico importado do ERP no mês de referência.
  </footer>
</div>
<script>
// Abas: a única linha de JavaScript da página. Sem ela o relatório ainda é
// legível — a impressão mostra todas as seções de qualquer forma.
document.querySelectorAll('.aba').forEach(function (botao) {
  botao.addEventListener('click', function () {
    document.querySelectorAll('.aba').forEach(function (b) { b.classList.remove('ativa'); });
    document.querySelectorAll('.conteudo').forEach(function (c) { c.classList.remove('ativa'); });
    botao.classList.add('ativa');
    var alvo = document.getElementById(botao.dataset.alvo);
    if (alvo) alvo.classList.add('ativa');
  });
});
</script>
</body>
</html>`;
}

/**
 * Nome do arquivo — previsível o bastante para ordenar sozinho numa pasta.
 *
 * `fechamento-2026-08-receptivo.html`, e não "Fechamento Agosto 2026.html":
 * data em formato ordenável na frente, sem acento e sem espaço, porque o
 * arquivo vai circular por WhatsApp e por e-mail.
 */
export function nomeArquivoFechamento(d: DadosFechamento): string {
  const partes = ['fechamento', d.alvo.mes];
  const alvo = d.alvo.operadorNome ?? d.alvo.setorNome ?? d.alvo.empresaNome;
  if (alvo) {
    partes.push(
      // `̀-ͯ` = os acentos que o NFD separou da letra.
      alvo.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    );
  }
  return `${partes.filter(Boolean).join('-')}.html`;
}
