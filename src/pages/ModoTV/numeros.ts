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
import type { NumerosTv, TelaDoPainel, Unidade } from './tipos';
import { opcao } from './templates';

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
  diasNoMes: number;
  hojeDia: number;
  /** Recebido acumulado por dia, do dia 0 (zero) até hoje. */
  serie: { dia: number; valor: number }[];
  /** A cena «Destaque»: o 1º de cada dia e do mês, já na unidade. */
  destaques: { escopo: string; dia: string; id: string; nome: string; foto: string | null; valor: number; pagamentos: number }[];
  equipes: { id: string; nome: string }[];
  equipeDoPainel: string | null;
  setorNome: string;
  /** «YYYY-MM-DD» e «YYYY-MM» do banco. */
  hojeIso: string;
  mesIso: string;
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
    diasNoMes: diasDoMes(n.mes),
    hojeDia: diaDe(n.hoje) ?? diasDoMes(n.mes),
    serie: serieAcumulada(n, unidade),
    destaques: (Array.isArray(n.destaques) ? n.destaques : []).map(d => ({
      escopo: String(d.escopo), dia: String(d.dia), id: d.id, nome: d.nome ?? '', foto: d.foto ?? null,
      valor: num(emHo ? d.valor_ho : d.valor), pagamentos: Math.max(0, Math.trunc(num(d.pagamentos))),
    })),
    equipes: Array.isArray(n.equipes) ? n.equipes : [],
    equipeDoPainel: n.equipe_id ?? null,
    setorNome: n.setor_nome ?? (n.alvo_tipo === 'setor' ? n.alvo_nome ?? '' : ''),
    hojeIso: String(n.hoje ?? '').slice(0, 10),
    mesIso: String(n.mes ?? ''),
  };
}

// ── A cena «Destaque» ────────────────────────────────────────────────────────

export interface DestaqueNaTela {
  /** `null`: ninguém (ainda) — `motivo` diz por quê. */
  pessoa: { id: string; nome: string; foto: string | null; valor: number; pagamentos: number } | null;
  motivo: string;
  /** «YYYY-MM-DD», ou `null` no mês inteiro (ou sem dia escolhido). */
  dia: string | null;
  doMes: boolean;
  /** «Equipe Rosa», «Play 1». */
  onde: string;
}

const rotuloDaEquipe = (nome: string) => (/^equipe\b/i.test(nome.trim()) ? nome.trim() : `Equipe ${nome.trim()}`);

/**
 * Quem a cena mostra, pelas opções da tela: setor ou equipe; hoje, o dia
 * anterior com recebimento, um dia escolhido (do mês corrente — o pacote é do
 * mês) ou o mês até agora.
 */
export function destaqueDaTela(v: VisaoTv, tela: Pick<TelaDoPainel, 'template' | 'opcoes'>): DestaqueNaTela {
  const doMes = opcao<string>(tela, 'dia') === 'mes';
  const porEquipe = opcao<string>(tela, 'escopo') === 'equipe';
  const equipe = porEquipe ? (opcao<string>(tela, 'equipe_id') || v.equipeDoPainel || '') : '';
  const nomeEquipe = v.equipes.find(e => e.id === equipe)?.nome;
  const onde = porEquipe ? (nomeEquipe ? rotuloDaEquipe(nomeEquipe) : '') : v.setorNome;
  const vazio = (motivo: string, dia: string | null = null): DestaqueNaTela => ({ pessoa: null, motivo, dia, doMes, onde });

  if (porEquipe && !equipe) return vazio('Escolha a equipe nas opções da tela.');
  const escopo = porEquipe ? equipe : 'setor';
  const doEscopo = v.destaques.filter(d => d.escopo === escopo);

  let dia: string | null = null;
  switch (opcao<string>(tela, 'dia')) {
    case 'hoje': dia = v.hojeIso; break;
    case 'mes': dia = null; break;
    case 'data': {
      const escolhido = opcao<string>(tela, 'data');
      if (!escolhido) return vazio('Escolha o dia nas opções da tela.');
      if (!escolhido.startsWith(`${v.mesIso}-`)) return vazio('A TV mostra os dias do mês atual.', escolhido);
      dia = escolhido;
      break;
    }
    default: {
      const antes = doEscopo.map(d => d.dia).filter(d => d !== 'mes' && d < v.hojeIso).sort();
      if (!antes.length) return vazio('Ainda não teve outro dia com recebimento neste mês.');
      dia = antes[antes.length - 1];
    }
  }

  const achado = doEscopo.find(d => d.dia === (dia ?? 'mes'));
  if (!achado) {
    return vazio(dia === v.hojeIso ? 'Ninguém recebeu ainda hoje. Quem vai ser o primeiro?' : 'Ninguém recebeu neste dia.', dia);
  }
  return {
    pessoa: { id: achado.id, nome: achado.nome, foto: achado.foto, valor: achado.valor, pagamentos: achado.pagamentos },
    motivo: '', dia, doMes, onde,
  };
}

function diasDoMes(mes: string | undefined): number {
  const [a, m] = String(mes ?? '').split('-').map(Number);
  return a && m ? new Date(a, m, 0).getDate() : 30;
}

function diaDe(iso: string | undefined): number | null {
  const d = Number(String(iso ?? '').slice(8, 10));
  return Number.isInteger(d) && d >= 1 && d <= 31 ? d : null;
}

/**
 * O recebido ACUMULADO de cada dia do mês, até hoje, para o gráfico.
 *
 * A série do banco é o formato do mês (uma leitura só do analítico); o total
 * oficial é o do Painel do Líder. A curva é escalada para terminar exatamente
 * no total — o último ponto do gráfico é o mesmo número das outras telas.
 * Sem série (cache antigo), uma reta de 0 ao total.
 */
export function serieAcumulada(n: Pick<NumerosTv, 'serie' | 'mes' | 'hoje' | 'recebido' | 'recebido_ho'>, unidade: Unidade): { dia: number; valor: number }[] {
  const total = num(unidade === 'ho' ? n.recebido_ho : n.recebido);
  const ultimo = diaDe(n.hoje) ?? diasDoMes(n.mes);
  const porDia = new Map<number, number>();
  for (const p of Array.isArray(n.serie) ? n.serie : []) {
    const d = diaDe(p?.dia);
    if (d && d <= ultimo) porDia.set(d, (porDia.get(d) ?? 0) + num(unidade === 'ho' ? p.valor_ho : p.valor));
  }
  const soma = [...porDia.values()].reduce((a, b) => a + b, 0);

  const pontos: { dia: number; valor: number }[] = [{ dia: 0, valor: 0 }];
  if (soma <= 0) {
    pontos.push({ dia: ultimo, valor: total });
    return pontos;
  }
  const fator = total / soma;
  let acc = 0;
  for (let d = 1; d <= ultimo; d++) {
    acc += (porDia.get(d) ?? 0) * fator;
    pontos.push({ dia: d, valor: d === ultimo ? total : centavos(acc) });
  }
  return pontos;
}

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 2, minimumFractionDigits: 2,
});

/** Dinheiro de parede: o valor exato do relatório, com centavos (Cleber, 27/10). */
export function moedaTv(v: number): string {
  return MOEDA.format(Math.round(v * 100) / 100);
}

/** Largura de cada caractere, em «em», na fonte da TV (Inter, negrito, algarismos tabulares). */
const LARGURA_EM: Record<string, number> = { '.': 0.3, ',': 0.3, ' ': 0.28, ' ': 0.28, R: 0.7, $: 0.64, '%': 0.92 };

/**
 * O maior corpo, até `base`, em que `texto` cabe em `largura` px. Com centavos
 * o número cresceu: «R$ 1.234.567,89» não cabe no corpo de «R$ 1.234.567».
 */
export function tamanhoQueCabe(texto: string, largura: number, base: number): number {
  const em = [...texto].reduce((s, ch) => s + (LARGURA_EM[ch] ?? 0.64), 0);
  return em > 0 ? Math.min(base, Math.floor(largura / em)) : base;
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
