/**
 * O que os quebra-nozes leem do banco: a cidade de quem está logado, a foto de
 * cada boneco e os destaques de ontem (migration 20261112180000).
 *
 * ## A foto
 *
 * É a do perfil de cada um, lida de novo a cada aparição (com meia hora de
 * validade no navegador): quem trocar a foto aparece com a nova, e quem não
 * tem aparece com o rosto de madeira. Passa por `fn_natal_quebra_nozes_elenco`
 * porque o operador não enxerga o perfil da diretoria.
 *
 * ## Os destaques
 *
 * Quem mais recebeu ontem em cada setor da cidade — o mesmo da cena «Destaque»
 * do Modo TV. O banco calcula uma vez por dia e por cidade; aqui a resposta
 * fica guardada até a meia-noite. Quem pergunta enquanto outro calcula recebe
 * «ainda não» e tenta de novo.
 *
 * ## Quem mais recebeu até agora
 *
 * O boletim (migration 20261112210000): o primeiro de hoje no Destaque do Modo
 * TV, o maior entre os setores da cidade. O banco calcula uma vez por sessão,
 * e a cidade inteira lê o mesmo nome.
 *
 * ## Sem a migration
 *
 * A função não existe: a cidade sai do setor (`lib/cidadeDoSetor.ts`) e a foto
 * de uma leitura direta de `perfis`, que só responde para quem enxerga a
 * diretoria. É o bastante para a prévia do `npm run dev`.
 */
import { supabase } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { lerCidadeDoSetor } from '@/lib/cidadeDoSetor';
import type { Destaque } from './diretor';
import { DIRETOR, HEADS, cidadeDoElenco, type Cidade } from './elenco';

type Fotos = Partial<Record<'anderson' | 'jessica' | 'robson', string | null>>;

export interface ElencoLido {
  /** `null`: setor sem cidade (ou de outra cidade) — ninguém aparece. */
  cidade: Cidade | null;
  fotos: Fotos;
}

const chaveDoNome = (nome: string) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';

/** As fotos do diretor e do head de uma cidade, no formato do palco. */
export function fotosDaCidade(lido: ElencoLido, cidade: Cidade): { a: string | null; b: string | null } {
  const de = (nome: string) => lido.fotos[chaveDoNome(nome) as keyof Fotos]?.trim() || null;
  return { a: de(DIRETOR.nome), b: de(HEADS[cidade].nome) };
}

// ── O elenco ────────────────────────────────────────────────────────────────

const VALIDADE_DAS_FOTOS_MS = 30 * 60_000;
/** A cidade muda pouco: vale por um dia, para agendar sem esperar o banco. */
const VALIDADE_DA_CIDADE_MS = 24 * 60 * 60_000;
const chaveDoElenco = (pessoa: string) => `natal:quebra-nozes:elenco:${pessoa}`;

interface ElencoGuardado extends ElencoLido { em: number }

function lerElencoGuardado(pessoa: string): ElencoGuardado | null {
  try {
    const v = JSON.parse(localStorage.getItem(chaveDoElenco(pessoa)) ?? 'null') as Partial<ElencoGuardado> | null;
    if (!v || typeof v.em !== 'number') return null;
    return { em: v.em, cidade: cidadeDoElenco(v.cidade ?? null), fotos: (v.fotos ?? {}) as Fotos };
  } catch { return null; }
}

/** A cidade guardada neste navegador (até um dia), para a agenda não esperar o banco. */
export function cidadeGuardada(pessoa: string, agora = Date.now()): Cidade | null | undefined {
  const g = lerElencoGuardado(pessoa);
  return g && agora - g.em < VALIDADE_DA_CIDADE_MS ? g.cidade : undefined;
}

async function lerElencoSemFuncao(setorId: string | null): Promise<ElencoLido> {
  const cidade = cidadeDoElenco(setorId ? await lerCidadeDoSetor(setorId) : null);
  const { data } = await supabase.from('perfis').select('nome, foto_url, ativo, arquivado').eq('perfil', 'diretoria');
  const fotos: Fotos = {};
  for (const p of (data ?? []) as { nome: string | null; foto_url: string | null; ativo: boolean | null; arquivado: boolean | null }[]) {
    const quem = chaveDoNome(p.nome ?? '');
    if ((quem === 'anderson' || quem === 'jessica' || quem === 'robson') && p.ativo !== false && !p.arquivado && p.foto_url?.trim() && !fotos[quem]) {
      fotos[quem] = p.foto_url.trim();
    }
  }
  return { cidade, fotos };
}

const emCurso = new Map<string, Promise<ElencoLido>>();

/**
 * A cidade e as fotos. Guardadas por meia hora; `forcar` relê (a aparição vai
 * começar e a foto tem de ser a de agora). Leituras simultâneas dividem uma só.
 */
export function lerElenco(pessoa: string, setorId: string | null, forcar = false): Promise<ElencoLido> {
  const guardado = lerElencoGuardado(pessoa);
  if (!forcar && guardado && Date.now() - guardado.em < VALIDADE_DAS_FOTOS_MS) return Promise.resolve(guardado);
  const andando = emCurso.get(pessoa);
  if (andando) return andando;
  const leitura = (async (): Promise<ElencoLido> => {
    const { data, error } = await rpcSemTipo<{ cidade?: string | null; fotos?: Fotos | null }>('fn_natal_quebra_nozes_elenco', {});
    const lido = error || !data
      ? await lerElencoSemFuncao(setorId)
      : { cidade: cidadeDoElenco(data.cidade ?? null), fotos: data.fotos ?? {} };
    try { localStorage.setItem(chaveDoElenco(pessoa), JSON.stringify({ ...lido, em: Date.now() })); } catch { /* sem armazenamento */ }
    return lido;
  })().catch((): ElencoLido => guardado ?? { cidade: null, fotos: {} }).finally(() => { emCurso.delete(pessoa); });
  emCurso.set(pessoa, leitura);
  return leitura;
}

// ── Os destaques ────────────────────────────────────────────────────────────

export interface DestaquesLidos {
  /** O dia dos destaques, 'YYYY-MM-DD'; `null` = não há dia anterior com recebimento no mês. */
  dia: string | null;
  destaques: Destaque[];
}

interface LinhaDeDestaque { setor_id?: string | null; setor?: string | null; nome?: string | null; foto?: string | null }

/** «Maria Eduarda Souza Lima» cabe no cartão como «Maria Lima». Exportada para os testes. */
export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 2) return partes.join(' ');
  return `${partes[0]} ${partes[partes.length - 1]}`;
}

/** As linhas do banco viram os cartões; o do setor de quem olha vem marcado. Exportada para os testes. */
export function montarDestaques(linhas: readonly LinhaDeDestaque[], meuSetorId: string | null): Destaque[] {
  return linhas
    .filter(l => l.setor?.trim() && l.nome?.trim())
    .map(l => ({
      setor: l.setor!.trim(),
      nome: nomeCurto(l.nome!),
      foto: l.foto?.trim() || null,
      meu: !!meuSetorId && l.setor_id === meuSetorId,
    }));
}

const chaveDosDestaques = (cidade: Cidade) => `natal:quebra-nozes:destaques:${cidade}`;

/**
 * Os destaques de ontem da cidade de quem pergunta. `hoje` ('YYYY-MM-DD', de
 * Brasília) é a validade da guardada. `forcarCidade` só vale para o
 * super_admin, que confere a outra cidade pelo card. Devolve `null` enquanto
 * o banco ainda calcula (ou sem a migration): quem chama tenta de novo ou
 * segue sem os destaques.
 */
export async function lerDestaques(cidade: Cidade, hoje: string, meuSetorId: string | null, forcarCidade = false): Promise<DestaquesLidos | null> {
  // A cidade à força não usa a guardada: a resposta do banco pode ser de outra cidade.
  if (!forcarCidade) try {
    const g = JSON.parse(localStorage.getItem(chaveDosDestaques(cidade)) ?? 'null') as { hoje?: string; dia?: string | null; linhas?: LinhaDeDestaque[] } | null;
    if (g?.hoje === hoje && Array.isArray(g.linhas)) return { dia: g.dia ?? null, destaques: montarDestaques(g.linhas, meuSetorId) };
  } catch { /* sem armazenamento: pergunta ao banco */ }
  const { data, error } = await rpcSemTipo<{ pronto?: boolean; dia?: string | null; destaques?: LinhaDeDestaque[] | null }>(
    'fn_natal_quebra_nozes_destaques', { p_cidade: forcarCidade ? cidade : null });
  if (error || !data || data.pronto !== true) return null;
  const linhas = data.destaques ?? [];
  if (!forcarCidade) try { localStorage.setItem(chaveDosDestaques(cidade), JSON.stringify({ hoje, dia: data.dia ?? null, linhas })); } catch { /* sem armazenamento */ }
  return { dia: data.dia ?? null, destaques: montarDestaques(linhas, meuSetorId) };
}

// ── Quem mais recebeu até agora ─────────────────────────────────────────────

const lideres = new Map<string, Destaque | null>();

/**
 * Quem mais recebeu hoje na cidade, para a sessão `sessao` (`Sessao.chave`).
 * Devolve `undefined` enquanto o banco ainda calcula, e `null` quando ninguém
 * recebeu hoje ainda (ou sem a migration). A resposta fica na memória: quem
 * leu antes da hora não pergunta de novo.
 */
export async function lerLider(cidade: Cidade, sessao: string, meuSetorId: string | null, forcarCidade = false): Promise<Destaque | null | undefined> {
  const chave = `${cidade}:${sessao}`;
  if (lideres.has(chave)) return lideres.get(chave);
  const { data, error } = await rpcSemTipo<{ pronto?: boolean; lider?: LinhaDeDestaque | null }>(
    'fn_natal_quebra_nozes_lider', { p_sessao: sessao, p_cidade: forcarCidade ? cidade : null });
  // Sem a função (migration pendente) ou com erro: sem líder, e a sessão segue como aparição comum.
  if (error || !data) return null;
  if (data.pronto !== true) return undefined;
  const [lider] = montarDestaques(data.lider ? [data.lider] : [], meuSetorId);
  const lido = lider ? { ...lider, feito: '★ na frente hoje' } : null;
  if (lideres.size > 20) lideres.clear();
  lideres.set(chave, lido);
  return lido;
}

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** «Destaques de ontem», ou «de sexta» quando ontem não teve expediente. `dia` e `hoje`: 'YYYY-MM-DD'. Exportada para os testes. */
export function tituloDosDestaques(dia: string | null, hoje: string): string {
  if (!dia) return 'Destaques de ontem';
  const d = Date.parse(`${dia}T12:00:00Z`);
  const h = Date.parse(`${hoje}T12:00:00Z`);
  if (!Number.isFinite(d) || !Number.isFinite(h)) return 'Destaques de ontem';
  const distancia = Math.round((h - d) / 86_400_000);
  if (distancia === 1) return 'Destaques de ontem';
  if (distancia > 1 && distancia < 7) return `Destaques de ${SEMANA[new Date(d).getUTCDay()]}`;
  const [, mes, diaDoMes] = dia.split('-');
  return `Destaques de ${diaDoMes}/${mes}`;
}
