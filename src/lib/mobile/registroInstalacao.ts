/**
 * registroInstalacao.ts — avisa o banco que a pessoa abriu o gestão como APP
 * INSTALADO no celular (Monitoramento de uso › App no celular, 05/10/2026).
 *
 * Uma vez por dia por aparelho: a marca do último dia registrado fica no
 * `localStorage`, por pessoa. Não mede uso — só responde «chegou a instalar?».
 * O teste do super_admin (impersonação) não conta: quem abriu não foi o
 * operador.
 */
import { supabase } from '@/lib/supabase';
import { ehIPhone } from './instalar';

export type Aparelho = 'iphone' | 'android' | 'outro';

export function aparelhoDoNavegador(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): Aparelho {
  if (ehIPhone(ua)) return 'iphone';
  if (/Android/i.test(ua)) return 'android';
  return 'outro';
}

const chave = (perfilId: string) => `app-instalado:${perfilId}`;

function lerDia(perfilId: string): string | null {
  try { return localStorage.getItem(chave(perfilId)); } catch { return null; }
}
function gravarDia(perfilId: string, dia: string): void {
  try { localStorage.setItem(chave(perfilId), dia); } catch { /* registra de novo amanhã */ }
}

/** Precisa registrar hoje? Exportada para os testes. */
export function precisaRegistrar(perfilId: string, hojeISO: string, lido: string | null = lerDia(perfilId)): boolean {
  return lido !== hojeISO;
}

/**
 * Registra a abertura instalada, se ainda não registrou hoje. Falha não é
 * guardada: a próxima abertura tenta de novo.
 */
export async function registrarAberturaInstalada(perfilId: string, hojeISO: string): Promise<void> {
  if (!precisaRegistrar(perfilId, hojeISO)) return;
  const cliente = supabase as unknown as {
    rpc: (n: string, a: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  };
  const { error } = await cliente.rpc('fn_app_registrar_abertura', { p_aparelho: aparelhoDoNavegador() });
  if (!error) gravarDia(perfilId, hojeISO);
}
