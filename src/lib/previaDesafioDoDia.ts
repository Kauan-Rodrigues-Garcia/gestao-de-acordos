/**
 * previaDesafioDoDia.ts — «ver na barra superior, só eu».
 *
 * Quem monta um desafio do dia quer ver como ele aparece para a operação ANTES
 * de lançar. O rascunho não está em cartaz (`fn_desafio_em_cartaz` só devolve
 * os ativos), então a barra não o acharia sozinha. Esta lista guarda, nesta aba
 * do navegador, os rascunhos que a pessoa pediu para pré-visualizar.
 *
 * É só apresentação: o placar continua vindo de `fn_desafio_diario`, que deixa
 * o rascunho passar apenas para quem configura desafios. Ninguém mais vê.
 *
 * `sessionStorage`: fechar a aba encerra a prévia — ela não é uma preferência.
 */
import type { Desafio } from '@/services/desafios/types';

const CHAVE = 'desafio-do-dia:previa';
const ouvintes = new Set<() => void>();
let lista: Desafio[] = ler();

function ler(): Desafio[] {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    const v = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(v) ? v as Desafio[] : [];
  } catch {
    return [];
  }
}

function gravar(proxima: Desafio[]): void {
  lista = proxima;
  try { sessionStorage.setItem(CHAVE, JSON.stringify(proxima)); } catch { /* aba privada */ }
  for (const f of ouvintes) f();
}

export function previasDaBarra(): Desafio[] {
  return lista;
}

export function estaEmPrevia(id: string): boolean {
  return lista.some(d => d.id === id);
}

/** Liga ou desliga a prévia de um desafio. Ligar de novo atualiza a cópia. */
export function definirPrevia(desafio: Desafio, ligada: boolean): void {
  const sem = lista.filter(d => d.id !== desafio.id);
  gravar(ligada ? [...sem, desafio] : sem);
}

/** Para `useSyncExternalStore`. */
export function ouvirPrevias(f: () => void): () => void {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}
