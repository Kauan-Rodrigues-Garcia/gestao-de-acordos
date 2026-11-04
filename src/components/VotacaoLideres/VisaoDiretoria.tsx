/**
 * VisaoDiretoria — o resultado ANTES de ir para a tela (pedido de 04/11/2026).
 *
 * Fechada a votação, só a diretoria vê a apuração inteira, pergunta por
 * pergunta. Empate no 1º lugar não vai para a revelação: a diretoria escolhe
 * um dos empatados. «Liberar o resultado» só destrava com todos os empates
 * decididos; aí começa a revelação (`ResultadoVotacao`).
 *
 * Na demonstração quem organiza faz o papel da diretoria. Quando for valer,
 * esta tela abre só para o cargo diretoria (e o banco confere de novo).
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Eye, Scale, Trophy, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  empatadas, empatesPendentes, nomeCurto,
  type Candidato, type Desempates, type ResultadoDaPergunta,
} from './cedula';
import { FotoLider } from './FotoLider';

interface Props {
  resultados: ResultadoDaPergunta[];
  pessoas: ReadonlyMap<string, Candidato>;
  desempates: Desempates;
  onDesempatar: (perguntaId: string, liderId: string) => void;
  onLiberar: () => void;
}

type Filtro = 'empates' | 'todas';

export function VisaoDiretoria({ resultados, pessoas, desempates, onDesempatar, onLiberar }: Props) {
  const empates = useMemo(() => empatadas(resultados), [resultados]);
  const pendentes = empatesPendentes(resultados, desempates);
  const [filtro, setFiltro] = useState<Filtro>(empates.length ? 'empates' : 'todas');
  const lista = filtro === 'empates' ? empates : resultados;

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col gap-4 px-4 pb-24 pt-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <Eye className="h-3 w-3" /> Só a diretoria vê
          </span>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">Apuração antes da liberação</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Confira o resultado de cada pergunta. Onde deu empate no 1º lugar, a diretoria decide quem leva — o empate não aparece na revelação.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border bg-card px-3 py-2"><p className="text-xl font-bold tabular-nums">{resultados.length}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Perguntas</p></div>
          <div className={cn('rounded-lg border px-3 py-2', empates.length ? 'border-warning/50 bg-warning/10' : 'bg-card')}><p className="text-xl font-bold tabular-nums">{empates.length}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Empates</p></div>
          <div className={cn('rounded-lg border px-3 py-2', pendentes ? 'bg-card' : 'border-success/50 bg-success/10')}><p className="text-xl font-bold tabular-nums">{empates.length - pendentes}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Decididos</p></div>
        </div>
      </div>

      <div role="radiogroup" aria-label="Mostrar" className="flex w-fit overflow-hidden rounded-md border text-xs">
        {([['empates', `Só os empates (${empates.length})`], ['todas', `Todas (${resultados.length})`]] as const).map(([v, t]) => (
          <button key={v} type="button" role="radio" aria-checked={filtro === v} onClick={() => setFiltro(v)}
            className={cn('px-3 py-1.5', filtro === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{t}</button>
        ))}
      </div>

      {lista.length === 0 && (
        <p className="rounded-lg border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhum empate: todas as perguntas têm um vencedor claro. É só liberar.
        </p>
      )}

      <ul className="space-y-3">
        {lista.map(r => {
          const empatou = r.vencedores.length > 1;
          const escolhido = empatou && r.vencedores.includes(desempates[r.pergunta.id] ?? '') ? desempates[r.pergunta.id] : null;
          const topo = r.linhas[0]?.votos ?? 0;
          return (
            <li key={r.pergunta.id}
              className={cn('rounded-xl border bg-card p-3 sm:p-4', empatou && !escolhido && 'border-warning/60', escolhido && 'border-success/50')}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold"><span aria-hidden="true" className="mr-1.5">{r.pergunta.emoji}</span>{r.pergunta.texto}</p>
                {empatou ? (
                  <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    escolhido ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning')}>
                    {escolhido ? <><Check className="h-3 w-3" /> Decidido</> : <><Scale className="h-3 w-3" /> Empate · {r.vencedores.length} com {topo} votos</>}
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <Trophy className="h-3 w-3" /> {topo} de {r.total} votos
                  </span>
                )}
              </div>

              {empatou ? (
                <>
                  <p className="mt-2 text-xs text-muted-foreground">Quem leva esta pergunta?</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={`Desempate: ${r.pergunta.texto}`}>
                    {r.vencedores.map(id => {
                      const p = pessoas.get(id);
                      const meu = escolhido === id;
                      return (
                        <motion.button key={id} type="button" role="radio" aria-checked={meu} whileTap={{ scale: 0.97 }}
                          onClick={() => onDesempatar(r.pergunta.id, id)}
                          className={cn('relative flex flex-col items-center gap-1.5 rounded-xl border-2 p-2.5 text-center transition-colors',
                            meu ? 'border-success bg-success/10' : escolhido ? 'border-border opacity-55 hover:opacity-100' : 'border-border hover:border-primary/60')}>
                          {meu && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-success text-success-foreground"><Check className="h-3 w-3" /></span>}
                          <FotoLider lider={p} className="h-16 w-16 rounded-xl text-lg" />
                          <span className="line-clamp-2 text-sm font-semibold leading-tight">{p ? nomeCurto(p.nome) : 'Líder'}</span>
                          <span className="text-[11px] text-muted-foreground">{p?.setor} · {topo} votos</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                  {r.linhas.slice(0, 3).map((l, n) => {
                    const p = pessoas.get(l.id);
                    return (
                      <span key={l.id} className={cn('flex items-center gap-1.5', n === 0 ? 'font-semibold' : 'text-muted-foreground')}>
                        <span className="w-5 text-xs tabular-nums">{n + 1}º</span>
                        <FotoLider lider={p} className="h-6 w-6 text-[9px]" />
                        {p ? nomeCurto(p.nome) : 'Líder'} <span className="text-xs tabular-nums opacity-80">{l.votos}</span>
                      </span>
                    );
                  })}
                  {r.vencedores.length === 0 && <span className="text-muted-foreground">Sem votos.</span>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* A barra de liberar fica sempre à vista. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
          <p className={cn('text-sm', pendentes ? 'text-warning' : 'text-success')}>
            {pendentes
              ? `Falta decidir ${pendentes} ${pendentes === 1 ? 'empate' : 'empates'} para liberar.`
              : 'Tudo decidido. Liberado, o resultado vai para a revelação.'}
          </p>
          <Button className="gap-2" disabled={pendentes > 0} onClick={onLiberar}>
            <Unlock className="h-4 w-4" /> Liberar o resultado
          </Button>
        </div>
      </div>
    </div>
  );
}
