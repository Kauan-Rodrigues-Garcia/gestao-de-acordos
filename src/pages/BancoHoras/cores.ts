/**
 * As cores do Banco de Horas, nos tokens do tema do gestão.
 *
 *   positivas (guardadas) .. primary
 *   negativas (devendo) .... destructive — sempre em vermelho (regra do usuário)
 *   vence no dia 25 ........ warning
 *   em dia ................. success
 */
import type { IdGrupo, Pessoa, TomGrupo } from '@/lib/bancoHoras/calculos';

export const TOM: Record<TomGrupo, { texto: string; fundo: string; suave: string; borda: string; anel: string }> = {
  neg: { texto: 'text-destructive', fundo: 'bg-destructive', suave: 'bg-destructive/10', borda: 'border-destructive/30', anel: 'ring-destructive' },
  warn: { texto: 'text-warning', fundo: 'bg-warning', suave: 'bg-warning/12', borda: 'border-warning/35', anel: 'ring-warning' },
  pos: { texto: 'text-primary', fundo: 'bg-primary', suave: 'bg-primary/10', borda: 'border-primary/25', anel: 'ring-primary' },
  ok: { texto: 'text-success', fundo: 'bg-success', suave: 'bg-success/10', borda: 'border-success/30', anel: 'ring-success' },
};

export const tomDoGrupo = (id: IdGrupo): TomGrupo =>
  (id === 'dev' || id === 'f1' || id === 'f2' || id === 'f3' ? 'neg' : id === 'vence' ? 'warn' : id === 'ok' ? 'ok' : 'pos');

/** O tom do anel da foto: devendo, vencendo, positivo. */
export const tomDaPessoa = (p: Pessoa, mostraVence: boolean): TomGrupo =>
  (p.saldo < 0 ? 'neg' : p.vprox > 0 && mostraVence ? 'warn' : 'pos');
