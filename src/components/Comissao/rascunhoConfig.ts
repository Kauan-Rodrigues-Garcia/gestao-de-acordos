/**
 * rascunhoConfig.ts — o formulário da comissão entre o que se digita e o que se grava.
 *
 * O formulário grava sozinho, como o resto da tela de Metas. Isso pede três
 * cuidados, e todos moram aqui, testados:
 *
 *   • faixa sem percentual não vai ao banco — a coluna é obrigatória, e gravar
 *     zero faria uma faixa «atingida» pagar R$ 0,00 sem ninguém ter decidido;
 *   • exceção de equipe nunca leva a regra do setor — ela mora só na linha do
 *     setor, e o banco recusaria;
 *   • reformatar um campo (`2,1` → `2,10`) não dispara escrita: a assinatura
 *     compara valores, não texto.
 */
import type { ConfigComissao, ModoIndireta, RegraSetor } from '@/services/comissao/comissao';
import type { PayloadConfig } from '@/services/comissao/comissao.service';
import { lerPct, paraCampo } from './formato';

export interface RascunhoFaixa {
  ordem: number;
  pct: string;
  pctEspecial: string;
}

export interface RascunhoConfig {
  modoIndireta: ModoIndireta;
  pctIndireta: string;
  pctIndiretaEspecial: string;
  regraSetor: RegraSetor;
  multiplicador: string;
  faixas: RascunhoFaixa[];
}

export interface AlvoConfig {
  empresaId: string;
  setorId: string;
  /** `null` = padrão do setor. */
  equipeId: string | null;
  ano: number;
  mes: number;
}

function faixaVazia(ordem: number): RascunhoFaixa {
  return { ordem, pct: '', pctEspecial: '' };
}

/** O rascunho de uma configuração — ou o formulário vazio de um mês sem nada. */
export function rascunhoDe(config: ConfigComissao | null): RascunhoConfig {
  if (!config) {
    return {
      modoIndireta: 'junto',
      pctIndireta: '',
      pctIndiretaEspecial: '',
      regraSetor: 'nenhuma',
      multiplicador: '',
      faixas: [faixaVazia(1)],
    };
  }

  const faixas = [...config.faixas]
    .sort((a, b) => a.ordem - b.ordem)
    .map((f, i) => ({ ordem: i + 1, pct: paraCampo(f.pct), pctEspecial: paraCampo(f.pctEspecial) }));

  return {
    modoIndireta: config.modoIndireta,
    pctIndireta: paraCampo(config.pctIndireta),
    pctIndiretaEspecial: paraCampo(config.pctIndiretaEspecial),
    regraSetor: config.regraSetor,
    multiplicador: paraCampo(config.multiplicador),
    faixas: faixas.length ? faixas : [faixaVazia(1)],
  };
}

/** A exceção nasce com as faixas do padrão, para ajustar — e sem a regra do setor. */
export function rascunhoParaExcecao(padrao: ConfigComissao | null): RascunhoConfig {
  return { ...rascunhoDe(padrao), regraSetor: 'nenhuma', multiplicador: '' };
}

/** As ordens das faixas com percentual vazio ou inválido. */
export function faixasSemPct(rascunho: RascunhoConfig): number[] {
  return rascunho.faixas.filter(f => lerPct(f.pct) === null).map(f => f.ordem);
}

/** O que vai para `fn_comissao_salvar`. `null` enquanto houver faixa sem percentual. */
export function payloadDe(rascunho: RascunhoConfig, alvo: AlvoConfig): PayloadConfig | null {
  if (faixasSemPct(rascunho).length > 0) return null;

  const regraSetor: RegraSetor = alvo.equipeId === null ? rascunho.regraSetor : 'nenhuma';

  return {
    ...alvo,
    modoIndireta: rascunho.modoIndireta,
    pctIndireta: lerPct(rascunho.pctIndireta),
    pctIndiretaEspecial: lerPct(rascunho.pctIndiretaEspecial),
    regraSetor,
    multiplicador: regraSetor === 'multiplicador' ? lerPct(rascunho.multiplicador) : null,
    faixas: rascunho.faixas.map((f, i) => ({
      ordem: i + 1,
      pct: lerPct(f.pct) ?? 0,
      pctEspecial: lerPct(f.pctEspecial),
    })),
  };
}

/** Compara VALORES: `2,1` e `2,10` são a mesma gravação. */
export function assinaturaDo(rascunho: RascunhoConfig): string {
  return JSON.stringify([
    rascunho.modoIndireta,
    lerPct(rascunho.pctIndireta),
    lerPct(rascunho.pctIndiretaEspecial),
    rascunho.regraSetor,
    lerPct(rascunho.multiplicador),
    rascunho.faixas.map(f => [lerPct(f.pct), lerPct(f.pctEspecial)]),
  ]);
}

export function comFaixaNova(rascunho: RascunhoConfig): RascunhoConfig {
  return { ...rascunho, faixas: [...rascunho.faixas, faixaVazia(rascunho.faixas.length + 1)] };
}

/** Remove a faixa e renumera as seguintes. A última nunca sai. */
export function semFaixa(rascunho: RascunhoConfig, indice: number): RascunhoConfig {
  if (rascunho.faixas.length <= 1) return rascunho;
  return {
    ...rascunho,
    faixas: rascunho.faixas
      .filter((_, i) => i !== indice)
      .map((f, i) => ({ ...f, ordem: i + 1 })),
  };
}
