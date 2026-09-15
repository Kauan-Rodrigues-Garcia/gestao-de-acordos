/**
 * OperadoresDaEquipe59 — quem recebeu, dentro de uma equipe do 59.
 *
 * Pedido de 14/09/2026: a lista «No 59, sem vínculo com equipe do sistema»
 * dizia «COB RECEPTIVO - BEATRIZ · 6 operadores» e não dizia quem eram. Abre
 * logo abaixo da equipe clicada, com o que cada operador recebeu e o que o
 * cadastro diz dele — é o que alguém precisa para decidir o vínculo.
 *
 * A soma fecha com a linha da equipe: as linhas são as mesmas do detalhe do
 * setor (`buscarOperadoresDaEquipe59`).
 */
import { useEffect, useState } from 'react';
import { UserCheck, UserX, AlertCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/money';
import {
  buscarOperadoresDaEquipe59, type OperadorDaEquipe59,
} from '@/services/mestre/diretoriaSetores.service';

const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const iniciais = (nome: string) =>
  nome.split(/[\s_]+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

export function OperadoresDaEquipe59({
  empresaId, mes, setorId, codGrupo, subgrupo, diaCorte, totalEquipe,
}: {
  empresaId: string;
  mes: string;
  /** `null` = carteira ainda sem setor. */
  setorId: string | null;
  codGrupo: string;
  subgrupo: string;
  diaCorte: number;
  /** O valor da linha da equipe — base da participação de cada operador. */
  totalEquipe: number;
}) {
  const [operadores, setOperadores] = useState<OperadorDaEquipe59[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setOperadores(null);
    setErro(null);
    buscarOperadoresDaEquipe59(empresaId, mes, { setorId, codGrupo, subgrupo }, diaCorte)
      .then(r => { if (vivo) setOperadores(r); })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar os operadores.'); });
    return () => { vivo = false; };
  }, [empresaId, mes, setorId, codGrupo, subgrupo, diaCorte]);

  if (erro) {
    return (
      <p className="flex items-start gap-1.5 px-2 py-2 text-[11px] text-muted-foreground">
        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" /> {erro}
      </p>
    );
  }
  if (operadores === null) return <Skeleton className="mx-2 my-1.5 h-16 rounded-lg" />;
  if (operadores.length === 0) {
    return <p className="px-2 py-2 text-[11px] text-muted-foreground">Nenhum operador com valor no período.</p>;
  }

  const semCadastro = operadores.filter(o => !o.perfilId).length;

  return (
    <div className="mx-1.5 mb-1.5 overflow-x-auto rounded-lg border border-border/50 bg-background/70">
      <table className="w-full min-w-[560px] text-[11px]">
        <thead>
          <tr className="border-b border-border/50 text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-1.5 text-left font-medium">Operador</th>
            <th className="px-2 py-1.5 text-left font-medium">No cadastro</th>
            <th className="px-2 py-1.5 text-right font-medium">Pagamentos</th>
            <th className="px-2 py-1.5 text-right font-medium">Período</th>
            <th className="px-2 py-1.5 text-right font-medium">Recebido</th>
            <th className="px-2 py-1.5 text-right font-medium">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {operadores.map(o => (
            <tr key={o.cobradora}>
              <td className="px-2 py-1.5">
                <span className="flex items-center gap-2">
                  <Avatar className="h-6 w-6 shrink-0 border border-border/60">
                    {o.fotoUrl && <AvatarImage src={o.fotoUrl} alt="" />}
                    <AvatarFallback className="bg-muted text-[9px] font-semibold text-muted-foreground">
                      {iniciais(o.perfilNome ?? o.cobradora)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{o.perfilNome ?? o.cobradora}</span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">{o.cobradora}</span>
                  </span>
                </span>
              </td>
              <td className="px-2 py-1.5">
                {o.perfilId ? (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <UserCheck className="h-3 w-3 shrink-0 text-emerald-500" />
                    <span className="truncate">
                      {o.equipeAtual ?? 'sem equipe'}{o.setorAtual ? ` · ${o.setorAtual}` : ''}
                      {o.perfilAtivo === false && ' · desligado'}
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <UserX className="h-3 w-3 shrink-0" /> sem cadastro
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{o.linhas.toLocaleString('pt-BR')}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                {dataBR(o.primeiroPgto)}–{dataBR(o.ultimoPgto)} · {o.dias}d
              </td>
              <td className="px-2 py-1.5 text-right font-mono font-semibold tabular-nums text-foreground">
                {formatBRL(o.recebido)}
                {o.integralParaCa > 0 && (
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    {formatBRL(o.integralParaCa)} integral para cá
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                {totalEquipe > 0 ? `${((o.recebido / totalEquipe) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {semCadastro > 0 && (
        <p className="border-t border-border/40 px-2 py-1.5 text-[10px] text-muted-foreground">
          {semCadastro} {semCadastro === 1 ? 'login do 59 não casa' : 'logins do 59 não casam'} com nenhum cadastro da empresa.
        </p>
      )}
    </div>
  );
}
