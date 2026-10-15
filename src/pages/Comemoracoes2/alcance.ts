/**
 * alcance.ts — de quais setores quem está montando pode fazer festa.
 *
 * Pedido do Cleber, 15/10/2026: "nada se mistura". Líder e elite montam
 * comemoração só para o próprio setor — pessoas, equipes, a meta do setor, as
 * músicas da biblioteca e o histórico. Gerência, diretoria, administrador e
 * super_admin continuam vendo a empresa inteira.
 *
 * "Próprio setor" é o setor do cadastro mais o das equipes que a pessoa lidera:
 * o líder que toca um time em outro setor faz festa para esse time também.
 *
 * Filtro do ESTÚDIO. Para quem a festa aparece continua sendo decidido pelo
 * banco (`setores_alvo`, `equipes_alvo`) e por `pages/Comemoracoes/escopo.ts`.
 *
 * Puro, sem React: tem teste.
 */
import { setoresDoOperador, type MapasVinculo } from '@/pages/Comemoracoes/clones';
import type { Comemoracao } from '@/services/comemoracoes.service';
import type { MidiaComemoracao } from '@/services/comemoracaoMidias.service';
import type { DadosEstudio } from './tipos';

/** Cargos que só fazem festa para o próprio setor. */
export const CARGOS_SO_DO_SETOR: ReadonlySet<string> = new Set(['lider', 'elite']);

export interface Alcance {
  /** false = empresa inteira. */
  restrito: boolean;
  /** Setores permitidos. Só vale quando `restrito`. */
  setores:  ReadonlySet<string>;
}

export const ALCANCE_TOTAL: Alcance = { restrito: false, setores: new Set() };

export function alcanceDoCriador(params: {
  cargo:            string | null | undefined;
  setorId:          string | null | undefined;
  equipesLideradas: readonly string[];
  equipes:          readonly { id: string; setor_id: string | null }[];
}): Alcance {
  if (!params.cargo || !CARGOS_SO_DO_SETOR.has(params.cargo)) return ALCANCE_TOTAL;
  const setores = new Set<string>();
  if (params.setorId) setores.add(params.setorId);
  for (const e of params.equipes) {
    if (e.setor_id && params.equipesLideradas.includes(e.id)) setores.add(e.setor_id);
  }
  return { restrito: true, setores };
}

function mapasDe(dados: Pick<DadosEstudio, 'pessoas' | 'clones' | 'equipes'>): MapasVinculo {
  return { perfis: dados.pessoas, clones: dados.clones, equipes: dados.equipes };
}

/**
 * Pessoas, equipes e setores que o estúdio oferece.
 *
 * Pessoa entra se trabalha em algum setor permitido — inclusive como clone:
 * quem é clone num time do meu setor também é comemorado aqui (só aqui; ver
 * `setoresNoAlcance`).
 */
export function dadosNoAlcance(dados: DadosEstudio, a: Alcance): DadosEstudio {
  if (!a.restrito) return dados;
  const mapas = mapasDe(dados);
  return {
    ...dados,
    pessoas: dados.pessoas.filter((p) => setoresDoOperador(p.id, mapas).some((s) => a.setores.has(s))),
    equipes: dados.equipes.filter((e) => !!e.setor_id && a.setores.has(e.setor_id)),
    setores: dados.setores.filter((s) => a.setores.has(s.id)),
  };
}

/** Os setores escolhidos para um homenageado, sem sair do alcance. */
export function setoresNoAlcance(setores: readonly string[], a: Alcance): string[] {
  return a.restrito ? setores.filter((s) => a.setores.has(s)) : [...setores];
}

/**
 * Comemorações que o histórico e a faixa de meta batida mostram.
 *
 * A RLS deixa líder+ ler a empresa toda. Para o líder restrito ficam as do
 * próprio setor, as que ele criou e as de meta de setor (que aparecem para
 * todo mundo de qualquer jeito).
 */
export function comemoracoesNoAlcance(
  lista: Comemoracao[],
  a: Alcance,
  usuarioId: string | null,
): Comemoracao[] {
  if (!a.restrito) return lista;
  return lista.filter((c) =>
    c.empresa_inteira
    || (!!usuarioId && c.criado_por === usuarioId)
    || c.setores_alvo.some((s) => a.setores.has(s)));
}

/**
 * Músicas da biblioteca que o estúdio lista.
 *
 * Quem tem setor vê as do próprio setor e as que enviou. Quem não tem setor
 * nenhum (diretoria, administração) vê todas — não há setor para separar.
 */
export function musicasNoAlcance(
  musicas: MidiaComemoracao[] | null,
  setoresDoUsuario: ReadonlySet<string>,
  usuarioId: string | null,
): MidiaComemoracao[] | null {
  if (!musicas || setoresDoUsuario.size === 0) return musicas;
  return musicas.filter((m) =>
    (!!m.setor_id && setoresDoUsuario.has(m.setor_id))
    || (!!usuarioId && m.criado_por === usuarioId));
}

/** O que no rascunho está fora do alcance — o envio barra. */
export function foraDoAlcance(
  r: { alvoTipo: string; escolhidos: { id: string; nome: string }[]; equipeId: string; setorId: string },
  noAlcance: Pick<DadosEstudio, 'pessoas' | 'equipes' | 'setores'>,
  a: Alcance,
): string | null {
  if (!a.restrito) return null;
  if (r.alvoTipo === 'operadores') {
    const ok = new Set(noAlcance.pessoas.map((p) => p.id));
    const fora = r.escolhidos.find((p) => !ok.has(p.id));
    if (fora) return `${fora.nome.split(' ')[0]} não é do seu setor. Tire da lista para enviar.`;
  }
  if (r.alvoTipo === 'equipe' && r.equipeId && !noAlcance.equipes.some((e) => e.id === r.equipeId)) {
    return 'Essa equipe não é do seu setor.';
  }
  if (r.alvoTipo === 'setor' && r.setorId && !noAlcance.setores.some((s) => s.id === r.setorId)) {
    return 'Você só comemora a meta do seu setor.';
  }
  return null;
}
