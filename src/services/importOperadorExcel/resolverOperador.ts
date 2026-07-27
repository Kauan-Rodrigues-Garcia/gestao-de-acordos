/**
 * resolverOperador.ts — vincula o "Login" da planilha ao operador cadastrado.
 *
 * Fonte da verdade: `perfis.usuario` (login do sistema, ex.: "gabriel_oliveira").
 * Casos em que o login da planilha NÃO bate exatamente com `usuario` são
 * resolvidos por uma tabela de apelidos opcional (`import_login_aliases`).
 *
 * O parser recebe apenas a função `ResolverOperador` (login normalizado →
 * operador | null | 'AMBIGUOUS'); toda a conversa com o banco fica aqui.
 */

import { supabase } from '@/lib/supabase';
import { normalizarLogin } from './normalizar';
import type { ResolverOperador } from './parser';

export interface OperadorCadastro {
  id: string;
  nome: string;
  usuario: string;
  setorId: string | null;
}

/** Um login normalizado pode, em tese, apontar para mais de um operador. */
export type MapaLogins = Map<string, OperadorCadastro[]>;

/** Adiciona um operador ao mapa sob a chave (login normalizado). */
function indexar(mapa: MapaLogins, loginNorm: string, op: OperadorCadastro): void {
  if (!loginNorm) return;
  const lista = mapa.get(loginNorm);
  if (lista) {
    if (!lista.some(o => o.id === op.id)) lista.push(op);
  } else {
    mapa.set(loginNorm, [op]);
  }
}

/**
 * Carrega os operadores da empresa e monta o mapa login→operador(es).
 * Indexa por `perfis.usuario` e pelos apelidos de `import_login_aliases`
 * (se a tabela existir; ausência é tratada como "sem apelidos").
 */
export async function carregarMapaLogins(empresaId: string): Promise<MapaLogins> {
  const mapa: MapaLogins = new Map();

  const { data: perfis, error } = await supabase
    .from('perfis')
    .select('id, nome, usuario, setor_id')
    .eq('empresa_id', empresaId)
    .eq('ativo', true);
  if (error) throw error;

  const porId = new Map<string, OperadorCadastro>();
  for (const p of perfis ?? []) {
    const op: OperadorCadastro = { id: p.id, nome: p.nome ?? '', usuario: p.usuario ?? '', setorId: p.setor_id ?? null };
    porId.set(op.id, op);
    indexar(mapa, normalizarLogin(op.usuario), op);
  }

  // Apelidos (opcional). Se a tabela não existir ainda, ignora silenciosamente.
  const { data: aliases, error: errAlias } = await supabase
    .from('import_login_aliases')
    .select('login_excel, perfil_id')
    .eq('empresa_id', empresaId);
  if (!errAlias && aliases) {
    for (const a of aliases) {
      const op = porId.get(a.perfil_id);
      if (op) indexar(mapa, normalizarLogin(a.login_excel), op);
    }
  }

  return mapa;
}

/** Cria o resolver puro a partir de um mapa já carregado (fácil de testar). */
export function criarResolver(mapa: MapaLogins): ResolverOperador {
  return (loginNormalizado: string) => {
    const lista = mapa.get(loginNormalizado);
    if (!lista || lista.length === 0) return null;
    if (lista.length > 1) return 'AMBIGUOUS';
    return { id: lista[0].id, nome: lista[0].nome, setorId: lista[0].setorId };
  };
}

/** Atalho: carrega o mapa da empresa e devolve o resolver pronto. */
export async function resolverOperadorDaEmpresa(empresaId: string): Promise<ResolverOperador> {
  return criarResolver(await carregarMapaLogins(empresaId));
}
