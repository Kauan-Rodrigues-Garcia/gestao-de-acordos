import { deslocarMes, mesAtual, rotuloDoMes } from '@/lib/mesReferencia';

/** «Setembro», do mês anterior ao corrente em São Paulo. Exportada para teste. */
export function mesQuePassou(hoje: string = mesAtual()): string {
  return rotuloDoMes(deslocarMes(hoje, -1)).split(' ')[0];
}

/** «Ana Paula Souza» → «Ana». Sem nome, sem vocativo. */
export function primeiroNome(nome: string | null | undefined): string | null {
  const n = String(nome ?? '').trim().split(/\s+/)[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : null;
}
