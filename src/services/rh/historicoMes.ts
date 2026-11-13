/**
 * historicoMes.ts — o Histórico do mês do RH, sem React e sem banco.
 *
 * Recebe as linhas de `fn_rh_historico_mes` e responde o que a tela pergunta:
 * quantos de cada tipo em cada cidade, e quais linhas mostrar com os filtros.
 *
 * A cidade de um evento é a do setor (origem e destino). Transferência entre
 * cidades conta nas duas — é saída numa e entrada na outra (decisão do Cleber,
 * 13/11/2026). Spec: docs/superpowers/specs/2026-11-13-rh-historico-do-mes-design.md
 */
import { marcaDaCidade } from '@/lib/marca';

export const TIPOS_EVENTO = [
  'transferencia', 'cargo', 'desligamento', 'reativacao',
  'afastamento', 'ferias', 'entrada', 'troca_equipe',
] as const;
export type TipoEvento = typeof TIPOS_EVENTO[number];

/** Uma linha de `fn_rh_historico_mes`, como o PostgREST entrega. */
export interface EventoRh {
  tipo: TipoEvento;
  dia: string;
  pessoa_id: string | null;
  pessoa_nome: string;
  cargo: string | null;
  empresa_id: string | null;
  setor_de_id: string | null;
  setor_de_nome: string | null;
  cidade_de: string | null;
  setor_para_id: string | null;
  setor_para_nome: string | null;
  cidade_para: string | null;
  valor_de: string | null;
  valor_para: string | null;
  sentido: 'promocao' | 'rebaixamento' | null;
  ausencia_tipo: string | null;
  ausencia_rotulo: string | null;
  inicio: string | null;
  fim: string | null;
  feito_por: string | null;
}

/** Chave estável de cidade: «birigui», «marilia», ou SEM_CIDADE. */
export const SEM_CIDADE = '~';

export function chaveCidade(nome: string | null | undefined): string {
  if (!nome) return SEM_CIDADE;
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() || SEM_CIDADE;
}

export interface CidadeHistorico {
  chave: string;
  nome: string;
  /** «BookPlay», «PaguePlay» ou null. */
  marca: string | null;
}

/** As cidades de um evento — uma, ou duas quando a transferência cruza cidades. */
export function cidadesDoEvento(e: EventoRh): string[] {
  const de = e.setor_de_id || e.cidade_de ? chaveCidade(e.cidade_de) : null;
  const para = chaveCidade(e.cidade_para ?? e.cidade_de);
  return de && de !== para ? [de, para] : [para];
}

export function cruzaCidades(e: EventoRh): boolean {
  return e.tipo === 'transferencia' && cidadesDoEvento(e).length === 2;
}

/** As cidades presentes no mês, Birigui antes de Marília, «Sem cidade» por último. */
export function cidadesDoMes(eventos: readonly EventoRh[]): CidadeHistorico[] {
  const vistas = new Map<string, CidadeHistorico>();
  const anotar = (nome: string | null) => {
    const chave = chaveCidade(nome);
    if (vistas.has(chave)) return;
    vistas.set(chave, {
      chave,
      nome: chave === SEM_CIDADE ? 'Sem cidade' : (nome as string),
      marca: marcaDaCidade(nome)?.nome ?? null,
    });
  };
  for (const e of eventos) {
    if (e.setor_de_id || e.cidade_de) anotar(e.cidade_de);
    anotar(e.cidade_para ?? e.cidade_de);
  }
  const ordem = (c: CidadeHistorico) => (c.chave === 'birigui' ? 0 : c.chave === 'marilia' ? 1 : c.chave === SEM_CIDADE ? 3 : 2);
  return [...vistas.values()].sort((a, b) => ordem(a) - ordem(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export type Contagem = Record<TipoEvento, number>;

const zerada = (): Contagem =>
  Object.fromEntries(TIPOS_EVENTO.map(t => [t, 0])) as Contagem;

/** Quantos de cada tipo em cada cidade. */
export function contarPorCidade(eventos: readonly EventoRh[]): Map<string, Contagem> {
  const m = new Map<string, Contagem>();
  for (const e of eventos) {
    for (const c of cidadesDoEvento(e)) {
      const cont = m.get(c) ?? zerada();
      cont[e.tipo] += 1;
      m.set(c, cont);
    }
  }
  return m;
}

export interface FiltroHistorico {
  /** Chave da cidade, ou null = todas. */
  cidade: string | null;
  /** Id do setor, ou null = todos. Vale origem ou destino. */
  setor: string | null;
}

export function filtrar(eventos: readonly EventoRh[], f: FiltroHistorico): EventoRh[] {
  return eventos.filter(e =>
    (!f.cidade || cidadesDoEvento(e).includes(f.cidade))
    && (!f.setor || e.setor_de_id === f.setor || e.setor_para_id === f.setor));
}

export interface SetorDoMes {
  id: string;
  nome: string;
  /** Nome da cidade do setor, ou null. */
  cidade: string | null;
  /** Quantos eventos do mês passam por ele (origem ou destino). */
  eventos: number;
}

/** Os setores que aparecem no mês, para o seletor: Birigui, Marília, os outros, por nome. */
export function setoresDoMes(eventos: readonly EventoRh[]): SetorDoMes[] {
  const m = new Map<string, SetorDoMes>();
  const anotar = (id: string | null, nome: string | null, cidade: string | null) => {
    if (!id || !nome) return;
    const s = m.get(id) ?? { id, nome, cidade, eventos: 0 };
    s.eventos += 1;
    m.set(id, s);
  };
  for (const e of eventos) {
    anotar(e.setor_de_id, e.setor_de_nome, e.cidade_de);
    if (e.setor_para_id !== e.setor_de_id) anotar(e.setor_para_id, e.setor_para_nome, e.cidade_para);
  }
  const ordem = (c: string | null) => { const k = chaveCidade(c); return k === 'birigui' ? 0 : k === 'marilia' ? 1 : k === SEM_CIDADE ? 3 : 2; };
  return [...m.values()].sort((a, b) => ordem(a.cidade) - ordem(b.cidade) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** As seções na ordem da tela, só as que têm linha, cada uma ordenada por dia e nome. */
export function agruparPorTipo(eventos: readonly EventoRh[]): { tipo: TipoEvento; eventos: EventoRh[] }[] {
  return TIPOS_EVENTO
    .map(tipo => ({
      tipo,
      eventos: eventos
        .filter(e => e.tipo === tipo)
        .sort((a, b) => a.dia.localeCompare(b.dia) || a.pessoa_nome.localeCompare(b.pessoa_nome, 'pt-BR')),
    }))
    .filter(g => g.eventos.length > 0);
}

// ── Mês ─────────────────────────────────────────────────────────────────────

/** O primeiro mês com log de pessoas (12/08/2026). */
export const PRIMEIRO_MES = '2026-08';

/** «2026-11» do dia de hoje. */
export function mesDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function somarMes(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return mesDe(d);
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function rotuloMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  const nome = MESES[m - 1] ?? '';
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}/${a}`;
}

/** Fim de afastamento sem data de volta (sentinela de `ausencias`). */
export const SEM_DATA_DE_VOLTA = '9999-12-31';

// ── Planilha ────────────────────────────────────────────────────────────────

export const ROTULO_TIPO: Record<TipoEvento, { um: string; varios: string; aba: string }> = {
  transferencia: { um: 'transferência', varios: 'transferências', aba: 'Transferências' },
  cargo:         { um: 'mudança de cargo', varios: 'mudanças de cargo', aba: 'Mudanças de cargo' },
  desligamento:  { um: 'desligamento', varios: 'desligamentos', aba: 'Desligamentos' },
  reativacao:    { um: 'reativação', varios: 'reativações', aba: 'Reativações' },
  afastamento:   { um: 'afastamento', varios: 'afastamentos', aba: 'Afastamentos' },
  ferias:        { um: 'férias', varios: 'férias', aba: 'Férias' },
  entrada:       { um: 'entrada', varios: 'entradas', aba: 'Entradas' },
  troca_equipe:  { um: 'troca de equipe', varios: 'trocas de equipe', aba: 'Trocas de equipe' },
};

function dataBr(iso: string | null): string {
  if (!iso) return '';
  if (iso.startsWith(SEM_DATA_DE_VOLTA)) return 'sem data de volta';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Uma aba por tipo, só as que têm linha. */
export function linhasDoHistorico(
  eventos: readonly EventoRh[],
  rotuloCargo: (c: string) => string,
): Record<string, Record<string, string>[]> {
  const abas: Record<string, Record<string, string>[]> = {};
  for (const { tipo, eventos: evs } of agruparPorTipo(eventos)) {
    abas[ROTULO_TIPO[tipo].aba] = evs.map(e => {
      const base: Record<string, string> = {
        Dia: dataBr(e.dia),
        Nome: e.pessoa_nome,
        Cargo: e.cargo ? rotuloCargo(e.cargo) : '',
      };
      if (tipo === 'transferencia') {
        base['Setor de origem'] = e.setor_de_nome ?? '';
        base['Cidade de origem'] = e.cidade_de ?? '';
        base['Setor de destino'] = e.setor_para_nome ?? '';
        base['Cidade de destino'] = e.cidade_para ?? '';
      } else {
        base.Setor = e.setor_para_nome ?? e.setor_de_nome ?? '';
        base.Cidade = e.cidade_para ?? e.cidade_de ?? '';
      }
      if (tipo === 'cargo') {
        base.De = e.valor_de ? rotuloCargo(e.valor_de) : '';
        base.Para = e.valor_para ? rotuloCargo(e.valor_para) : '';
        base.Sentido = e.sentido === 'promocao' ? 'Promoção' : e.sentido === 'rebaixamento' ? 'Rebaixamento' : '';
      }
      if (tipo === 'troca_equipe') {
        base['Equipe de origem'] = e.valor_de ?? 'Sem equipe';
        base['Equipe de destino'] = e.valor_para ?? 'Sem equipe';
      }
      if (tipo === 'afastamento' || tipo === 'ferias') {
        base.Tipo = e.ausencia_rotulo ?? '';
        base['Início'] = dataBr(e.inicio);
        base.Fim = dataBr(e.fim);
      }
      base['Feito por'] = e.feito_por ?? '';
      return base;
    });
  }
  return abas;
}
