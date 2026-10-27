/**
 * numeros.ts — do pacote do banco ao que a parede mostra.
 *
 * O banco devolve o pacote cru (`fn_tv_numeros_calcular`): meta gravada em
 * bruto, recebido em bruto e em H.O., dias úteis. Aqui ele vira a visão de UMA
 * unidade, com falta, percentual, ritmo e projeção já contados.
 *
 * ## H.O. só na regra Cofen
 *
 * Setor de Nosso produto vê sempre bruto, seja qual for a unidade do painel.
 * No Cofen a meta é PENSADA em H.O. e GRAVADA em bruto: converte-se pelo
 * percentual da empresa, igual a `metaNaUnidade` (`lib/unidadeValor.ts`). O
 * recebido em H.O. não é convertido — vem da coluna do relatório.
 *
 * Puro: sem React e sem banco. Testado em `numeros.test.ts`.
 */
import { hoPercentualDaConfig } from '@/lib/hoPercentual';
import type { NumerosTv, Unidade } from './tipos';

export interface VisaoTv {
  unidade: Unidade;
  alvoNome: string;
  meta: number;
  recebido: number;
  falta: number;
  /** 0–1+, sem corte em cima: 1,12 é 112%. */
  fracao: number;
  batida: boolean;
  hoje: { alvo: number; recebido: number; falta: number; fracao: number };
  diasUteis: number;
  diasDecorridos: number;
  diasRestantes: number;
  /** Quanto precisa entrar por dia útil que sobra. */
  ritmo: number;
  projecao: number;
  ranking: { id: string; nome: string; foto: string | null; valor: number }[];
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const centavos = (v: number) => Math.round(v * 100) / 100;

export function unidadeEfetiva(n: Pick<NumerosTv, 'regra'>, doPainel: Unidade): Unidade {
  return n.regra === 'cofen' ? doPainel : 'bruto';
}

export function montarVisao(
  n: NumerosTv,
  unidadeDoPainel: Unidade,
  alvoDiarioManual: number | null = null,
): VisaoTv {
  const unidade = unidadeEfetiva(n, unidadeDoPainel);
  const emHo = unidade === 'ho';
  const pct = hoPercentualDaConfig({ ho_percentual: n.ho_percentual });

  const meta = emHo ? centavos(num(n.meta) * pct) : num(n.meta);
  const recebido = num(emHo ? n.recebido_ho : n.recebido);
  const recebidoHoje = num(emHo ? n.recebido_hoje_ho : n.recebido_hoje);

  const diasUteis = Math.max(0, Math.trunc(num(n.dias_uteis)));
  const diasDecorridos = Math.min(diasUteis, Math.max(0, Math.trunc(num(n.dias_decorridos))));
  const diasRestantes = diasUteis - diasDecorridos;

  const falta = Math.max(0, centavos(meta - recebido));
  const alvoHoje = alvoDiarioManual && alvoDiarioManual > 0
    ? alvoDiarioManual
    : diasUteis > 0 ? centavos(meta / diasUteis) : 0;

  return {
    unidade,
    alvoNome: n.alvo_nome ?? '',
    meta,
    recebido,
    falta,
    fracao: meta > 0 ? recebido / meta : 0,
    batida: meta > 0 && recebido >= meta,
    hoje: {
      alvo: alvoHoje,
      recebido: recebidoHoje,
      falta: Math.max(0, centavos(alvoHoje - recebidoHoje)),
      fracao: alvoHoje > 0 ? recebidoHoje / alvoHoje : 0,
    },
    diasUteis,
    diasDecorridos,
    diasRestantes,
    // No último dia útil, tudo o que falta é para hoje.
    ritmo: falta > 0 ? centavos(falta / Math.max(1, diasRestantes)) : 0,
    projecao: diasDecorridos > 0 ? centavos(recebido / diasDecorridos * diasUteis) : 0,
    ranking: (Array.isArray(n.ranking) ? n.ranking : []).map(p => ({
      id: p.id,
      nome: p.nome ?? '',
      foto: p.foto ?? null,
      valor: num(emHo ? p.valor_ho : p.valor),
    })).sort((a, b) => b.valor - a.valor),
  };
}

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0, minimumFractionDigits: 0,
});

/** Dinheiro de parede: sem centavos, que ninguém lê a cinco metros. */
export function moedaTv(v: number): string {
  return MOEDA.format(Math.floor(v));
}

/** Percentual cortado, nunca arredondado para cima: 99,6% não é 100%. */
export function percentualTv(fracao: number): string {
  const p = Math.floor(Math.max(0, fracao) * 1000) / 10;
  return `${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

/** «Maria Aparecida Souza» → «Maria Souza». A parede não tem espaço para três nomes. */
export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 2) return partes.join(' ');
  return `${partes[0]} ${partes[partes.length - 1]}`;
}

export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
