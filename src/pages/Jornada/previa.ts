/**
 * previa.ts — a aba de mentira que o super_admin vê quando ainda não há
 * equipe nem subgrupo Suporte/Retenção (04/11/2026).
 *
 * Pessoas e NRs são INVENTADOS e vivem só na memória da aba: lançar, apagar e
 * mudar a meta mexem nesta lista e nunca chegam ao banco. O F5 recomeça.
 */
import type {
  NrCompartilhado, OutroNoNr, PainelJornada, PessoaPlacar, RegistroJornada, TipoJornada,
} from '@/services/jornada/jornada.service';
import { diaDaSemana, somarDias } from './jornada';

export interface PessoaPrevia {
  id: string;
  nome: string;
}

/** Um lançamento guardado na prévia; o `outros` é calculado ao montar o painel. */
export type RegistroPrevia = Omit<RegistroJornada, 'outros'>;

export interface EstadoPrevia {
  pessoas: PessoaPrevia[];
  registros: RegistroPrevia[];
  /** Metas da EQUIPE no mês (o total do grupo), em ordem (até 4). Vazia = sem meta. */
  metas: number[];
  /** Metas individuais: perfil → metas do mês. */
  metasPessoa: Record<string, number[]>;
  /** A lixeira da prévia. */
  apagados: (RegistroPrevia & { apagado_em: string })[];
}

/** Nomes fictícios: a prévia não mostra ninguém da operação. */
const NOMES = ['Ana Exemplo', 'Bruno Exemplo', 'Carla Exemplo', 'Diego Exemplo', 'Elisa Exemplo'];

/** Gerador pseudoaleatório com semente: a mesma prévia a cada abertura. */
function sorteador(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * Os últimos 40 dias de lançamentos de exemplo, em dias úteis, até `hoje`.
 * `eu` entra na equipe para o super_admin ver o próprio medidor.
 */
export function gerarPrevia(tipo: TipoJornada, hoje: string, eu: PessoaPrevia): EstadoPrevia {
  const sorte = sorteador(tipo === 'acesso' ? 7 : 11);
  const pessoas: PessoaPrevia[] = [eu, ...NOMES.map((nome, i) => ({ id: `previa-${i}`, nome }))];
  // Metas da equipe inteira (o total do grupo no mês), não de cada um.
  const metas = tipo === 'acesso' ? [600, 700, 800, 900] : [150, 200];
  const [min, max] = tipo === 'acesso' ? [2, 8] : [0, 3];

  const registros: RegistroPrevia[] = [];
  let nr = 13100000;
  for (let d = 40; d >= 0; d--) {
    const dia = somarDias(hoje, -d);
    if (['sáb', 'dom'].includes(diaDaSemana(dia))) continue;
    for (const p of pessoas) {
      // Hoje o dia ainda está no meio; o próprio super_admin começa zerado hoje.
      const fator = dia === hoje ? 0.45 : 1;
      const n = p.id === eu.id && dia === hoje ? 0 : Math.round((min + sorte() * (max - min)) * fator);
      for (let k = 0; k < n; k++) {
        nr += 1 + Math.floor(sorte() * 900);
        const minuto = 8 * 60 + Math.floor(((k + sorte()) / Math.max(n, 1)) * 9 * 60);
        registros.push({
          id: `previa-${dia}-${p.id}-${k}`,
          nr: String(nr),
          data: dia,
          perfil_id: p.id,
          nome: p.nome,
          criado_em: `${dia}T${String(Math.floor(minuto / 60) + 3).padStart(2, '0')}:${String(minuto % 60).padStart(2, '0')}:00Z`,
        });
      }
    }
  }
  // Alguns clientes atendidos por duas pessoas (10/11/2026), para a marca
  // «compartilhado» aparecer: o mesmo NR com outra pessoa, alguns dias depois, no mesmo mês.
  const outrosDoGrupo = registros.filter(r => r.perfil_id !== eu.id);
  for (let k = 0; k < 6 && outrosDoGrupo.length; k++) {
    const base = outrosDoGrupo[Math.floor(sorte() * outrosDoGrupo.length)];
    const outra = pessoas[1 + Math.floor(sorte() * (pessoas.length - 1))];
    const dia = somarDias(base.data, 1 + Math.floor(sorte() * 6));
    if (outra.id === base.perfil_id || dia > hoje || dia.slice(0, 7) !== base.data.slice(0, 7)) continue;
    if (registros.some(r => r.nr === base.nr && r.perfil_id === outra.id)) continue;
    registros.push({ ...base, id: `previa-comp-${k}`, perfil_id: outra.id, nome: outra.nome, data: dia, criado_em: `${dia}T15:${10 + k}:00Z` });
  }
  // Uma pessoa com meta própria, para a prévia mostrar como fica.
  return {
    pessoas, registros, metas,
    metasPessoa: { 'previa-0': tipo === 'acesso' ? [120, 150] : [40] },
    apagados: [],
  };
}

/**
 * Quem MAIS tem o NR deste lançamento no mesmo mês (o 1º dia de cada um) — o
 * `outros` de `fn_jornada_painel`. Exportada para os testes.
 */
export function outrosNoMes(registros: readonly RegistroPrevia[], r: RegistroPrevia): OutroNoNr[] {
  const mes = r.data.slice(0, 7);
  const primeiro = new Map<string, OutroNoNr>();
  for (const x of registros) {
    if (x.nr !== r.nr || x.perfil_id === r.perfil_id || !x.data.startsWith(mes)) continue;
    const ja = primeiro.get(x.perfil_id);
    if (!ja || x.data < ja.data) primeiro.set(x.perfil_id, { perfil_id: x.perfil_id, nome: x.nome, data: x.data });
  }
  return [...primeiro.values()].sort((a, b) => a.data.localeCompare(b.data) || (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'));
}

/** Os NRs do mês com 2+ pessoas, o mais recente primeiro — o `compartilhados` do painel. Exportada para os testes. */
export function compartilhadosNoMes(registros: readonly RegistroPrevia[], mes: string): NrCompartilhado[] {
  const porNr = new Map<string, RegistroPrevia[]>();
  for (const r of registros) if (r.data.startsWith(mes)) porNr.set(r.nr, [...(porNr.get(r.nr) ?? []), r]);
  const lista: (NrCompartilhado & { ultima: string })[] = [];
  for (const [nr, rs] of porNr) {
    const pessoas = outrosNoMes(rs, { ...rs[0], perfil_id: '' });
    if (pessoas.length > 1) lista.push({ nr, pessoas, ultima: pessoas[pessoas.length - 1].data });
  }
  return lista
    .sort((a, b) => b.ultima.localeCompare(a.ultima) || a.nr.localeCompare(b.nr))
    .map(({ nr, pessoas }) => ({ nr, pessoas }));
}

/** O mesmo formato que `fn_jornada_painel` devolve, calculado da prévia. */
export function painelDaPrevia(estado: EstadoPrevia, tipo: TipoJornada, dia: string): PainelJornada {
  const mes = dia.slice(0, 7);
  const doMes = estado.registros.filter(r => r.data.startsWith(mes));

  const totalPorDia = new Map<string, number>();
  for (const r of doMes) totalPorDia.set(r.data, (totalPorDia.get(r.data) ?? 0) + 1);

  const pessoas = estado.pessoas.map((p): PessoaPlacar => ({
    id: p.id,
    nome: p.nome,
    foto_url: null,
    no_grupo: true,
    no_dia: doMes.filter(r => r.perfil_id === p.id && r.data === dia).length,
    no_mes: doMes.filter(r => r.perfil_id === p.id).length,
    // Só a individual: a do grupo é da equipe inteira.
    meta: estado.metasPessoa[p.id]?.[0] ?? null,
    meta_propria: estado.metasPessoa[p.id] !== undefined,
    metas: estado.metasPessoa[p.id] ?? [],
  }));

  return {
    tipo,
    grupo: 'equipe',
    pode_gerir: true,
    sou_membro: true,
    meta: estado.metas[0] ?? null,
    metas: estado.metas,
    pessoas,
    dias: [...totalPorDia].map(([d, total]) => ({ dia: d, total })).sort((a, b) => a.dia.localeCompare(b.dia)),
    registros: doMes
      .filter(r => r.data === dia)
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
      .map(r => ({ ...r, outros: outrosNoMes(doMes, r) })),
    compartilhados: compartilhadosNoMes(doMes, mes),
  };
}
