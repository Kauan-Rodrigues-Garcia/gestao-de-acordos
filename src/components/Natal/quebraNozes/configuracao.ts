/**
 * configuracao.ts — os interruptores dos quebra-nozes e a chamada na hora.
 *
 * Uma linha em `natal_quebra_nozes` (migration 20261112180000): as aparições
 * sorteadas ligadas ou não, a chamada das dez, os sons, e a última chamada
 * que o super_admin fez pelo card de Configurações › Geral. A 20261112210000
 * acrescenta o boletim e os horários trocados à mão (`ajustes`); sem ela, o
 * boletim fica desligado e os horários não se mexem. Mudou a linha, o
 * banco manda um sinal no tópico `permissoes` de cada empresa, e quem está
 * logado relê aqui. Mesmo molde de `Natal/liberacao.ts`.
 *
 * Tabela ausente (migration pendente) = tudo desligado: os bonecos só sobem
 * pela prévia do `npm run dev`.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { assinarSinal } from '@/lib/sinais';
import type { Ajustes, TipoDeSessao } from './agenda';
import type { Cidade } from './elenco';

export interface ChamadaNaHora {
  /** Quando começa (ms), no relógio do banco. */
  em: number;
  tipo: TipoDeSessao;
  cidade: Cidade | 'todas';
  /** Cresce a cada chamada: entra na semente do sorteio. */
  numero: number;
}

export interface ConfiguracaoDosQuebraNozes {
  automaticas: boolean;
  chamada10h: boolean;
  sons: boolean;
  /** Uma das aparições da tarde diz quem mais recebeu até agora. */
  boletim: boolean;
  /** Os horários trocados à mão (`agenda.ts`). */
  ajustes: Ajustes;
  chamada: ChamadaNaHora | null;
  /** A linha foi lida do banco (falso = migration pendente ou ainda carregando). */
  lida: boolean;
  /** A linha tem o boletim e os horários (falso = falta a migration 20261112210000). */
  completa: boolean;
}

const SEM_AJUSTES: Ajustes = Object.freeze({});
export const DESLIGADA: ConfiguracaoDosQuebraNozes = {
  automaticas: false, chamada10h: false, sons: true, boletim: false, ajustes: SEM_AJUSTES, chamada: null, lida: false, completa: false,
};

interface Linha {
  automaticas: boolean | null;
  chamada_10h: boolean | null;
  sons: boolean | null;
  chamada_em: string | null;
  chamada_tipo: string | null;
  chamada_cidade: string | null;
  chamada_numero: number | null;
  boletim?: boolean | null;
  ajustes?: Record<string, unknown> | null;
}

function ajustesDaLinha(bruto: Record<string, unknown> | null | undefined): Ajustes {
  if (!bruto || typeof bruto !== 'object') return SEM_AJUSTES;
  const ajustes: Record<string, number> = {};
  for (const [chave, minuto] of Object.entries(bruto)) {
    if (typeof minuto === 'number' && Number.isFinite(minuto) && minuto >= 0 && minuto < 1440) ajustes[chave] = Math.floor(minuto);
  }
  return ajustes;
}

/** A linha do banco vira a configuração. Exportada para os testes. */
export function daLinha(l: Linha | null): ConfiguracaoDosQuebraNozes {
  if (!l) return DESLIGADA;
  const em = l.chamada_em ? new Date(l.chamada_em).getTime() : NaN;
  const tipo = l.chamada_tipo === 'parabens' || l.chamada_tipo === 'aparicao' || l.chamada_tipo === 'boletim' ? l.chamada_tipo : null;
  const cidade = l.chamada_cidade === 'birigui' || l.chamada_cidade === 'marilia' || l.chamada_cidade === 'todas' ? l.chamada_cidade : null;
  return {
    automaticas: l.automaticas === true,
    chamada10h: l.chamada_10h === true,
    sons: l.sons !== false,
    // Sem a coluna (migration 20261112210000 pendente) não há de onde ler o líder: desligado.
    boletim: l.boletim === true,
    ajustes: ajustesDaLinha(l.ajustes),
    completa: typeof l.boletim === 'boolean',
    chamada: Number.isFinite(em) && tipo && cidade ? { em, tipo, cidade, numero: l.chamada_numero ?? 0 } : null,
    lida: true,
  };
}

let atual = DESLIGADA;
let carregando: Promise<void> | null = null;
const ouvintes = new Set<() => void>();

function trocar(nova: ConfiguracaoDosQuebraNozes) {
  atual = nova;
  for (const o of ouvintes) o();
}

/** Cliente sem tipo: a tabela ainda não está em `database.types.ts`. */
interface Consulta extends PromiseLike<{ data: Linha | null; error: { message: string } | null }> {
  select(colunas: string): Consulta;
  limit(n: number): Consulta;
  maybeSingle(): Consulta;
}
const tabela = () => (supabase.from as unknown as (t: string) => Consulta)('natal_quebra_nozes');

/**
 * A resposta guardada no navegador, para não ler a tabela a cada página.
 * Enquanto a página está aberta, quem avisa da mudança é o sinal.
 */
const CHAVE_GUARDADA = 'natal:quebra-nozes:configuracao';
const VALIDADE_MS = 15 * 60_000;

function lerGuardada(): ConfiguracaoDosQuebraNozes | null {
  try {
    const bruto = localStorage.getItem(CHAVE_GUARDADA);
    if (!bruto) return null;
    const v = JSON.parse(bruto) as { em?: number; linha?: Linha | null };
    if (!v.linha || Date.now() - (Number(v.em) || 0) > VALIDADE_MS) return null;
    return daLinha(v.linha);
  } catch { return null; }
}

function guardar(linha: Linha | null) {
  try { localStorage.setItem(CHAVE_GUARDADA, JSON.stringify({ em: Date.now(), linha })); } catch { /* sem armazenamento */ }
}

async function ler(forcar: boolean): Promise<void> {
  const guardada = forcar ? null : lerGuardada();
  if (guardada) { trocar(guardada); return; }
  // Todas as colunas, sem dizer o nome: a linha é pequena, e assim a leitura
  // serve com e sem as colunas da 20261112210000.
  const { data, error } = await tabela().select('*').limit(1).maybeSingle();
  if (error) return;
  guardar(data);
  trocar(daLinha(data));
}

function carregar(forcar = false): Promise<void> {
  if (!carregando || forcar) carregando = ler(forcar).catch((): void => undefined);
  return carregando;
}

/** A configuração, viva: relê quando o banco avisa. `ativo` falso = não pergunta nada. */
export function useConfiguracaoDosQuebraNozes(empresaId: string | null | undefined, ativo = true): ConfiguracaoDosQuebraNozes {
  const valor = useSyncExternalStore(
    o => { ouvintes.add(o); return () => { ouvintes.delete(o); }; },
    () => atual,
  );

  useEffect(() => { if (ativo) void carregar(); }, [ativo]);

  useEffect(() => {
    if (!empresaId || !ativo) return;
    // `mesmoSemOlhar`: a chamada na hora começa em 15 s e tem de chegar também
    // a quem está com a janela de lado (Cleber, 13/11/2026).
    return assinarSinal('permissoes', empresaId, {
      onMudou: s => { if (s.tabela === 'natal_quebra_nozes') void carregar(true); },
      onReconectado: () => { void carregar(true); },
    }, { mesmoSemOlhar: true });
  }, [empresaId, ativo]);

  return valor;
}

/** Os interruptores do card. Só o super_admin passa no banco. O que não vier fica como está. */
export async function configurarQuebraNozes(p: { automaticas?: boolean; chamada10h?: boolean; sons?: boolean; boletim?: boolean }): Promise<{ erro: string | null }> {
  const { error } = await rpcSemTipo<null>('fn_natal_quebra_nozes_configurar', {
    p_automaticas: p.automaticas ?? null, p_chamada_10h: p.chamada10h ?? null, p_sons: p.sons ?? null,
    // Só vai quando é ele que muda: a função de antes da 20261112210000 não tem o parâmetro.
    ...(p.boletim === undefined ? {} : { p_boletim: p.boletim }),
  });
  if (error) return { erro: error.message };
  await carregar(true);
  return { erro: null };
}

/**
 * Troca a hora de uma sessão marcada (`minuto` do dia, de Brasília), ou
 * devolve ao sorteio (`null`). Só o super_admin passa no banco.
 */
export async function ajustarHorarioDosQuebraNozes(dia: number, cidade: Cidade, indice: number, minuto: number | null): Promise<{ erro: string | null }> {
  const { error } = await rpcSemTipo<unknown>('fn_natal_quebra_nozes_ajustar_horario', {
    p_dia: dia, p_cidade: cidade, p_indice: indice, p_minuto: minuto,
  });
  if (error) return { erro: error.message };
  await carregar(true);
  return { erro: null };
}

/** «Chamar agora» do card: a cidade inteira vê, daqui a 15 s. Só o super_admin passa no banco. */
export async function chamarQuebraNozesParaTodos(tipo: TipoDeSessao, cidade: Cidade | 'todas'): Promise<{ erro: string | null; em: number | null }> {
  const { data, error } = await rpcSemTipo<string | null>('fn_natal_quebra_nozes_chamar', { p_tipo: tipo, p_cidade: cidade });
  if (error) return { erro: error.message, em: null };
  await carregar(true);
  return { erro: null, em: typeof data === 'string' ? new Date(data).getTime() : null };
}
