/**
 * capa.ts — a primeira tela, e a frase que resume o mês.
 *
 * Quem projeta o relatório numa reunião precisa poder ler a abertura em voz
 * alta e já ter dado o recado. Por isso a capa não é decoração: é total, meta,
 * percentual e UMA frase que diz se bateu, por quanto e em que ritmo.
 *
 * A frase é DERIVADA dos mesmos números do corpo, nunca escrita à parte —
 * senão vira a única linha do documento que pode discordar do resto dele.
 */

import { esc, brl, pct, num } from '../formato';
import { corDaProjecao } from '../graficos/paleta';
import type { DadosFechamento } from '../tipos';

/**
 * O veredito do mês em uma frase.
 *
 * Exportado à parte porque é a peça mais delicada da capa: mudar o tom aqui
 * muda o tom da reunião inteira, e precisa de teste próprio.
 */
export function fraseVeredito(d: DadosFechamento): string {
  const { resumo } = d;
  const escopo = esc(resumo.rotulo);

  if (resumo.meta === null || resumo.meta <= 0) {
    return `<strong>${escopo}</strong> recebeu <strong>${esc(brl(resumo.totalBruto))}</strong> `
      + `em ${esc(num(resumo.qtdPagamentos))} pagamento(s). `
      + 'Não havia meta cadastrada para este escopo no mês, então não há percentual a comparar.';
  }

  const diferenca = resumo.totalBruto - resumo.meta;
  const bateu = diferenca >= 0;
  const ritmo = resumo.projecao
    ? ` O ritmo fechou em <strong>${esc(pct(resumo.projecao.projecaoPct))}</strong> do esperado`
      + `${resumo.projecao.quartil ? `, no <strong>${resumo.projecao.quartil.quartil}º quartil</strong>` : ''}.`
    : '';

  if (bateu) {
    return `<strong>${escopo}</strong> bateu a meta de ${esc(brl(resumo.meta))}: `
      + `<strong>${esc(brl(resumo.totalBruto))}</strong> recebidos, `
      + `<strong>${esc(brl(diferenca))}</strong> acima do alvo `
      + `(${esc(pct(resumo.pctMeta))} da meta).${ritmo}`;
  }

  return `<strong>${escopo}</strong> recebeu <strong>${esc(brl(resumo.totalBruto))}</strong> `
    + `de uma meta de ${esc(brl(resumo.meta))} — faltaram `
    + `<strong>${esc(brl(Math.abs(diferenca)))}</strong> `
    + `para o alvo (${esc(pct(resumo.pctMeta))} alcançado).${ritmo}`;
}

export function secaoCapa(d: DadosFechamento): string {
  const { alvo, resumo } = d;

  const escopoTexto = [
    alvo.setorNome ? `Setor ${alvo.setorNome}` : null,
    alvo.operadorNome,
  ].filter(Boolean).join(' · ') || alvo.empresaNome;

  const cor = resumo.meta ? corDaProjecao(resumo.pctMeta) : undefined;

  const numeros = `<div class="capa-numeros">
    <div class="capa-numero">
      <span class="rotulo-forte">Total recebido</span>
      <strong class="total-grande"${cor ? ` style="color:${cor}"` : ''}>${esc(brl(resumo.totalBruto))}</strong>
    </div>
    ${resumo.meta !== null ? `<div class="capa-numero">
      <span class="rotulo-forte">Meta do mês</span>
      <span class="medio">${esc(brl(resumo.meta))}</span>
    </div>
    <div class="capa-numero">
      <span class="rotulo-forte">Alcançado</span>
      <span class="medio"${cor ? ` style="color:${cor}"` : ''}>${esc(pct(resumo.pctMeta))}</span>
    </div>` : ''}
    <div class="capa-numero">
      <span class="rotulo-forte">Pagamentos</span>
      <span class="medio">${esc(num(resumo.qtdPagamentos))}</span>
    </div>
  </div>`;

  return `<header class="capa">
    <span class="selo${alvo.mesFechado ? '' : ' parcial'}">
      ${alvo.mesFechado ? 'Fechamento do mês' : 'Retrato parcial · mês em curso'}
    </span>
    <h1>${esc(alvo.mesRotulo)}</h1>
    <div class="escopo">${esc(escopoTexto)}</div>
    <div class="assinatura">
      ${esc(alvo.empresaNome)} · gerado por ${esc(alvo.geradoPor)} em ${esc(alvo.geradoEm)}
    </div>
    ${numeros}
    <p class="veredito">${fraseVeredito(d)}</p>
  </header>`;
}
