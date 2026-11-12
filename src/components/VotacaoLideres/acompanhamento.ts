/**
 * acompanhamento.ts — as contas da tela «Acompanhar» (10/11/2026).
 *
 * Tudo sai do retrato do banco (`fn_votacao_lideranca_registro` para o
 * super_admin, `fn_votacao_lideranca_apuracao` para a diretoria): quem votou e
 * quando, participação por setor, e — quando o banco manda a contagem — a
 * parcial de cada pergunta e os destaques. Nunca em quem cada um votou.
 */
import { apurar, type Candidato, type ResultadoDaPergunta, type Votos } from './cedula';
import { montarDoRetrato, type ApuracaoDaVotacao } from './banco';

export interface PessoaNoAcompanhamento {
  id: string;
  lider: Candidato;
  votou: boolean;
  enviadoEm: string | null;
  /** Do «começou a votar» ao «enviou», em minutos inteiros (nulo sem os dois horários). */
  minutos: number | null;
  respondidas: number | null;
}

export interface SetorNoAcompanhamento {
  setor: string;
  total: number;
  votaram: number;
  /** 0–100, cortado (não arredonda para cima). */
  pct: number;
}

export interface Destaque {
  id: string;
  /** Soma dos votos em todas as perguntas. */
  votos: number;
  /** Em quantas perguntas está em 1º (sozinho ou empatado). */
  naFrente: number;
}

export interface Acompanhamento {
  pessoas: PessoaNoAcompanhamento[];
  setores: SetorNoAcompanhamento[];
  resumo: {
    participantes: number;
    votaram: number;
    faltam: number;
    pct: number;
    /** Mediana do tempo para votar, em minutos (nula sem horários). */
    tempoTipico: number | null;
    ultimoVoto: string | null;
  };
  /** A parcial: nula quando o banco não mandou a contagem (aberta, para a diretoria). */
  parcial: ResultadoDaPergunta[] | null;
  destaques: Destaque[];
  pessoasPorId: ReadonlyMap<string, Candidato>;
}

export const pctCortado = (parte: number, total: number) => (total ? Math.floor((parte / total) * 100) : 0);

function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2);
}

const porNome = (a: Candidato, b: Candidato) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });

export function montarAcompanhamento(r: ApuracaoDaVotacao): Acompanhamento {
  const { cedula, pessoas: pessoasPorId } = montarDoRetrato(r);
  const envio = new Map((r.envios ?? []).map(e => [e.eleitor_id, e]));
  // Quem VOTA (12/11/2026): na votação dos gerentes os eleitores vêm à parte,
  // com setor e equipe; na da liderança votam os próprios participantes.
  const quemVota: Candidato[] = r.eleitores
    ? r.eleitores.map(e => ({
        id: e.id, nome: (e.nome ?? '').trim() || 'Sem nome', foto: e.foto || null, perfil: e.perfil ?? 'operador',
        setor: [e.setor?.trim() || 'Sem setor', e.equipe?.trim()].filter(Boolean).join(' · '),
      }))
    : [...pessoasPorId.values()];

  const pessoas: PessoaNoAcompanhamento[] = [...quemVota].sort(porNome).map(lider => {
    const e = envio.get(lider.id);
    const ini = e?.comecou_em ? Date.parse(e.comecou_em) : NaN;
    const fim = e?.enviado_em ? Date.parse(e.enviado_em) : NaN;
    return {
      id: lider.id,
      lider,
      votou: !!e,
      enviadoEm: e?.enviado_em ?? null,
      minutos: Number.isFinite(ini) && Number.isFinite(fim) && fim >= ini ? Math.round((fim - ini) / 60000) : null,
      respondidas: e?.respondidas ?? null,
    };
  });

  const contaSetor = new Map<string, { total: number; votaram: number }>();
  for (const p of pessoas) {
    const s = contaSetor.get(p.lider.setor) ?? { total: 0, votaram: 0 };
    s.total++;
    if (p.votou) s.votaram++;
    contaSetor.set(p.lider.setor, s);
  }
  // Quem está mais atrás vem primeiro: é ali que precisa cobrar.
  const setores = [...contaSetor].map(([setor, s]) => ({ setor, ...s, pct: pctCortado(s.votaram, s.total) }))
    .sort((a, b) => a.pct - b.pct || a.setor.localeCompare(b.setor, 'pt-BR'));

  const votaram = pessoas.filter(p => p.votou).length;
  const ultimoVoto = (r.envios ?? []).reduce<string | null>((u, e) => (!u || e.enviado_em > u ? e.enviado_em : u), null);

  let parcial: ResultadoDaPergunta[] | null = null;
  let destaques: Destaque[] = [];
  if (r.contagem) {
    const votos: Votos = {};
    for (const c of r.contagem) (votos[c.pergunta_id] ??= {})[c.candidato_id] = c.votos;
    parcial = apurar(cedula, votos);
    const soma = new Map<string, Destaque>();
    for (const res of parcial) {
      for (const l of res.linhas) {
        if (!l.votos) continue;
        const d = soma.get(l.id) ?? { id: l.id, votos: 0, naFrente: 0 };
        d.votos += l.votos;
        if (res.vencedores.includes(l.id)) d.naFrente++;
        soma.set(l.id, d);
      }
    }
    destaques = [...soma.values()].sort((a, b) => b.votos - a.votos || b.naFrente - a.naFrente
      || porNome(pessoasPorId.get(a.id)!, pessoasPorId.get(b.id)!));
  }

  return {
    pessoas,
    setores,
    resumo: {
      participantes: pessoas.length,
      votaram,
      faltam: pessoas.length - votaram,
      pct: pctCortado(votaram, pessoas.length),
      tempoTipico: mediana(pessoas.flatMap(p => (p.minutos === null ? [] : [p.minutos]))),
      ultimoVoto,
    },
    parcial,
    destaques,
    pessoasPorId,
  };
}

/** O texto de «Copiar quem falta»: por setor, para mandar no chat. */
export function textoDeQuemFalta(titulo: string, pessoas: readonly PessoaNoAcompanhamento[]): string {
  const faltam = pessoas.filter(p => !p.votou);
  if (!faltam.length) return `${titulo}: todos já votaram.`;
  const porSetor = new Map<string, string[]>();
  for (const p of faltam) porSetor.set(p.lider.setor, [...(porSetor.get(p.lider.setor) ?? []), p.lider.nome]);
  const blocos = [...porSetor].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([setor, nomes]) => `${setor} (${nomes.length}):\n${nomes.map(n => `- ${n}`).join('\n')}`);
  return `${titulo} — faltam votar ${faltam.length}:\n\n${blocos.join('\n\n')}`;
}

export type FiltroDeStatus = 'todos' | 'votaram' | 'faltam';

export function passaNoFiltro(p: PessoaNoAcompanhamento, f: { status: FiltroDeStatus; setor: string | null; busca: string }): boolean {
  if (f.status === 'votaram' && !p.votou) return false;
  if (f.status === 'faltam' && p.votou) return false;
  if (f.setor && p.lider.setor !== f.setor) return false;
  const b = f.busca.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (!b) return true;
  return p.lider.nome.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(b);
}
