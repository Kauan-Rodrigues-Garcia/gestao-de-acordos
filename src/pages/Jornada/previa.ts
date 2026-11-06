/**
 * previa.ts — a aba de mentira que o super_admin vê quando ainda não há
 * equipe nem subgrupo Suporte/Retenção (04/11/2026).
 *
 * Pessoas e NRs são INVENTADOS e vivem só na memória da aba: lançar, apagar e
 * mudar a meta mexem nesta lista e nunca chegam ao banco. O F5 recomeça.
 */
import type {
  PainelJornada, PessoaPlacar, RegistroJornada, TipoJornada,
} from '@/services/jornada/jornada.service';
import { diaDaSemana, somarDias } from './jornada';

export interface PessoaPrevia {
  id: string;
  nome: string;
}

export interface EstadoPrevia {
  pessoas: PessoaPrevia[];
  registros: RegistroJornada[];
  /** Metas de cada operador no mês, em ordem (até 4). Vazia = sem meta. */
  metas: number[];
  /** Metas individuais: perfil → metas do mês. */
  metasPessoa: Record<string, number[]>;
  /** A lixeira da prévia. */
  apagados: (RegistroJornada & { apagado_em: string })[];
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
  const metas = tipo === 'acesso' ? [100, 120, 140, 160] : [30, 40];
  const [min, max] = tipo === 'acesso' ? [2, 8] : [0, 3];

  const registros: RegistroJornada[] = [];
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
  // Uma pessoa com meta própria, para a prévia mostrar como fica.
  return {
    pessoas, registros, metas,
    metasPessoa: { 'previa-0': tipo === 'acesso' ? [120, 150] : [40] },
    apagados: [],
  };
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
    meta: (estado.metasPessoa[p.id] ?? estado.metas)[0] ?? null,
    meta_propria: estado.metasPessoa[p.id] !== undefined,
    metas: estado.metasPessoa[p.id] ?? estado.metas,
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
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
  };
}
