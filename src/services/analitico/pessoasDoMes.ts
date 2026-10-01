/**
 * pessoasDoMes.ts — quem era cada pessoa NUM MÊS FECHADO.
 *
 * ## O defeito que isto corrige (01/10/2026)
 *
 * As telas já AGRUPAVAM o mês fechado pelo retrato (`composicao_mes`): equipe,
 * setor e liderança de setembro continuavam os de setembro. Mas a LISTA de
 * pessoas — quem aparece, com que nome, em que situação — saía de `perfis`, o
 * cadastro de hoje. Na virada isso deixava o passado mudar sozinho:
 *
 *   • renomear alguém em outubro trocava o nome dele em setembro;
 *   • pôr de férias ou desligar em outubro tirava a pessoa dos quartis, da
 *     área expandida do card e do fechamento de setembro, mês que ela
 *     trabalhou inteiro;
 *   • excluir apagava a pessoa de setembro;
 *   • quem foi criado em outubro aparecia em setembro (na barra «sem meta»).
 *
 * A regra (Cleber, 01/10/2026): «nada muda no mês passado — só relatório com
 * pagamento daquele mês». O retrato já guarda nome, cargo, situação, setor e
 * equipe de cada pessoa NAQUELE mês (migration `20260903410000`); aqui as telas
 * passam a ler de lá.
 *
 * ## O que vem do retrato e o que vem de hoje
 *
 * Do retrato: nome, cargo, situação, `ativo`, desligamento, setor e equipe —
 * tudo o que decide se a pessoa aparece e onde.
 *
 * De hoje: só a FOTO, quando a pessoa ainda existe. É a mesma pessoa e ninguém
 * quer ver a foto antiga; a regra é a mesma de `buscarLideresDoRetrato`. Sem
 * perfil (excluída), fica a foto guardada no retrato.
 *
 * ## Sem retrato
 *
 * Mês corrente, ou mês sem retrato gravado: `null`, e quem chama segue com a
 * lista de hoje — o comportamento de sempre, e melhor que uma tela vazia.
 */
import { tabelaSemTipo } from '@/lib/supabaseSemTipo';
import { lerComCache } from '@/lib/cacheCurto';
import { ehMesAtual } from '@/lib/mesReferencia';
import { PREFIXO_COMPOSICAO, VALIDADE_COMPOSICAO_MS } from './composicaoCache';

/** Uma pessoa como ela estava no mês, já no formato que as telas usam. */
export interface PessoaDoRetrato {
  id: string;
  nome: string;
  /** O cargo (`perfis.perfil`) naquele mês. */
  perfil: string | null;
  foto_url: string | null;
  setor_id: string | null;
  equipe_id: string | null;
  situacao: string;
  ativo: boolean;
  desligado_em: string | null;
}

interface LinhaRetrato {
  operador_id: string;
  nome: string | null;
  usuario: string | null;
  cargo: string | null;
  foto_url: string | null;
  setor_id: string | null;
  equipe_id: string | null;
  situacao: string | null;
  ativo: boolean | null;
  desligado_em: string | null;
}

/** Retrato por id. */
export type RetratoDePessoas = ReadonlyMap<string, PessoaDoRetrato>;

/** Converte a linha crua do retrato. Exportada para os testes. */
export function pessoaDaLinha(l: LinhaRetrato): PessoaDoRetrato {
  return {
    id:           l.operador_id,
    // Linha antiga sem identidade (anterior ao backfill): o login ainda diz
    // quem é, e é melhor que um nome em branco na tabela.
    nome:         l.nome ?? l.usuario ?? 'Sem nome',
    perfil:       l.cargo,
    foto_url:     l.foto_url,
    setor_id:     l.setor_id,
    equipe_id:    l.equipe_id,
    situacao:     l.situacao ?? 'ativo',
    ativo:        l.ativo ?? true,
    desligado_em: l.desligado_em,
  };
}

/**
 * As pessoas do retrato do mês. `null` no mês corrente, sem retrato, ou com a
 * leitura falhando — quem chama cai na lista de hoje.
 *
 * Guardado junto da composição (mesmo prefixo, mesma validade): quem grava
 * composição já invalida tudo o que começa por `composicao:`.
 */
export async function buscarPessoasDoRetrato(
  empresaId: string, mes: string | null | undefined,
): Promise<RetratoDePessoas | null> {
  if (!empresaId || !mes || ehMesAtual(mes)) return null;
  return lerComCache(
    `${PREFIXO_COMPOSICAO}pessoas:${empresaId}:${mes}`,
    VALIDADE_COMPOSICAO_MS,
    async () => {
      const { data, error } = await tabelaSemTipo<LinhaRetrato>('composicao_mes')
        .select('operador_id, nome, usuario, cargo, foto_url, setor_id, equipe_id, situacao, ativo, desligado_em')
        .eq('empresa_id', empresaId).eq('mes', mes);
      if (error || !data?.length) return null;
      return new Map(data.map(l => [l.operador_id, pessoaDaLinha(l)]));
    },
    // Falha ou mês sem retrato não ficam guardados: a próxima leitura tenta.
    { guardarSe: v => v !== null },
  );
}

/** Os filtros de cadastro que as telas aplicam, agora sobre o retrato. */
export interface FiltroDoRetrato {
  /** Cargos que entram (ex.: `PERFIS_QUE_CONTAM_NO_RECEBIMENTO`). */
  cargos: readonly string[];
  /**
   * `ativos`     — `ativo` e situação `ativo` (área expandida do card).
   * `ou_desligado` — `ativo`, ou desligado (Quartis, fechamento: desligar
   *                  zera `ativo` e a pessoa ainda produziu no mês).
   * `ativo`      — só `ativo` (Painel do Líder).
   */
  situacao: 'ativos' | 'ou_desligado' | 'ativo';
}

/** A pessoa passa no filtro, com os valores DO MÊS. Exportada para os testes. */
export function passaNoFiltro(p: PessoaDoRetrato, filtro: FiltroDoRetrato): boolean {
  if (!filtro.cargos.includes(p.perfil ?? '')) return false;
  switch (filtro.situacao) {
    case 'ativos':       return p.ativo && p.situacao === 'ativo';
    case 'ou_desligado': return p.ativo || p.situacao === 'desligado';
    case 'ativo':        return p.ativo;
  }
}

/**
 * A lista de pessoas do mês, no formato da lista de hoje.
 *
 * Sem retrato devolve `vivos` como veio. Com retrato, a população é a DO MÊS
 * (filtrada com os valores do mês) e cada pessoa leva por cima da linha de hoje
 * os campos congelados — quem foi excluído entra só com o que o retrato tem.
 *
 * `arquivado` volta sempre falso: o arquivamento acontece DEPOIS do mês em que
 * a pessoa saiu, e o retrato é daquele mês.
 *
 * Ordenada por nome, como as consultas de hoje (`order('nome')`).
 */
export function pessoasDoMes<T extends { id: string }>(
  vivos: readonly T[],
  retrato: RetratoDePessoas | null,
  filtro: FiltroDoRetrato,
): T[] {
  if (!retrato) return [...vivos];
  const hoje = new Map(vivos.map(v => [v.id, v]));
  const saida: T[] = [];
  for (const p of retrato.values()) {
    if (!passaNoFiltro(p, filtro)) continue;
    const vivo = hoje.get(p.id) as (T & { foto_url?: string | null }) | undefined;
    saida.push({
      ...(vivo ?? {}),
      id:           p.id,
      nome:         p.nome,
      perfil:       p.perfil,
      foto_url:     vivo?.foto_url ?? p.foto_url,
      setor_id:     p.setor_id,
      equipe_id:    p.equipe_id,
      situacao:     p.situacao,
      ativo:        p.ativo,
      arquivado:    false,
      desligado_em: p.desligado_em,
    } as unknown as T);
  }
  return saida.sort((a, b) =>
    String((a as { nome?: string }).nome ?? '').localeCompare(String((b as { nome?: string }).nome ?? ''), 'pt-BR'));
}

/**
 * Só o nome do mês, para quem já tem a lista e precisa trocar o rótulo (ranking,
 * líderes do card). Sem retrato, ou pessoa fora dele, devolve `atual`.
 */
export function nomeNoMes(
  retrato: RetratoDePessoas | null, id: string, atual: string | null | undefined,
): string | null {
  return retrato?.get(id)?.nome ?? atual ?? null;
}
