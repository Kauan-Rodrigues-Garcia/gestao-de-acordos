/**
 * ResultadoVotacao — a revelação, pergunta por pergunta, pensada para passar na
 * TV da reunião: aparece a pergunta e os líderes dela, «Revelar», um suspense
 * curto e o vencedor. Empate não chega aqui: a diretoria decide antes de
 * liberar (`VisaoDiretoria`), e o escolhido aparece como vencedor. No fim, o quadro de
 * quem levou mais títulos. Com todos os líderes em cada pergunta, as barras
 * mostram os 5 mais votados (e «Ver todos»); antes de revelar, os rostos de
 * todos, com um holofote passeando durante o suspense.
 *
 * Recebe o resultado já apurado e desempatado. Espaço/Enter revela e avança.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Crown, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  nomeCurto, quadroDeTitulos, type Candidato, type ItemDaCedula, type MeusVotos, type ResultadoDaPergunta,
} from './cedula';
import { FotoLider } from './FotoLider';

interface Props {
  cedula: ItemDaCedula[];
  /** Já com os desempates da diretoria aplicados. */
  resultados: ResultadoDaPergunta[];
  pessoas: ReadonlyMap<string, Candidato>;
  meus: MeusVotos;
}

const SUSPENSE_MS = 1800;
/** Quantos aparecem nas barras antes de «Ver todos». */
const TOPO = 5;

export function ResultadoVotacao({ cedula, resultados, pessoas, meus }: Props) {
  const quadro = useMemo(() => quadroDeTitulos(resultados), [resultados]);

  const fim = resultados.length; // a última «página» é o quadro de títulos
  const [idx, setIdx] = useState(0);
  const [revelados, setRevelados] = useState<Set<number>>(new Set());
  const [apurando, setApurando] = useState(false);
  const revelado = revelados.has(idx);
  const [verTodos, setVerTodos] = useState(false);
  const [holofote, setHolofote] = useState(0);
  const r = resultados[idx];
  const ordemFixa = useMemo(() => (r ? cedula[idx].candidatos : []), [r, cedula, idx]);

  // O holofote do suspense: pula de rosto em rosto enquanto «apura».
  useEffect(() => {
    if (!apurando || !ordemFixa.length) return;
    const id = window.setInterval(() => setHolofote(Math.floor(Math.random() * ordemFixa.length)), 110);
    return () => window.clearInterval(id);
  }, [apurando, ordemFixa.length]);
  useEffect(() => { setVerTodos(false); }, [idx]);

  const revelar = useCallback(() => {
    if (apurando || revelados.has(idx) || idx >= fim) return;
    setApurando(true);
    window.setTimeout(() => {
      setRevelados(r => new Set(r).add(idx));
      setApurando(false);
    }, SUSPENSE_MS);
  }, [apurando, revelados, idx, fim]);

  const ir = useCallback((n: number) => { if (!apurando) setIdx(Math.max(0, Math.min(fim, n))); }, [apurando, fim]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (idx < fim && !revelados.has(idx)) revelar(); else ir(idx + 1);
      } else if (e.key === 'ArrowRight') ir(idx + 1);
      else if (e.key === 'ArrowLeft') ir(idx - 1);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [idx, fim, revelados, revelar, ir]);

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Resultado</h2>
          <p className="text-[11px] text-muted-foreground">Liberado pela diretoria. Na demonstração, os votos dos outros foram sorteados; os seus entraram de verdade.</p>
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Perguntas">
          {resultados.map((x, n) => (
            <button key={x.pergunta.id} type="button" onClick={() => ir(n)} title={x.pergunta.texto}
              aria-current={n === idx ? 'step' : undefined}
              className={cn('h-2.5 w-2.5 rounded-full transition-colors', n === idx ? 'bg-primary' : revelados.has(n) ? 'bg-primary/40' : 'bg-muted-foreground/25')} />
          ))}
          <button type="button" onClick={() => ir(fim)} title="Quadro de títulos" aria-current={idx === fim ? 'step' : undefined}
            className={cn('ml-1 grid h-2.5 w-2.5 place-items-center rounded-sm transition-colors', idx === fim ? 'bg-warning' : 'bg-warning/40')} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {r ? (
          <motion.div key={r.pergunta.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.25 }}
            className="flex flex-1 flex-col gap-5">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{idx + 1} de {fim}</p>
              <div className="mt-2 text-5xl" aria-hidden="true">{r.pergunta.emoji}</div>
              <h3 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{r.pergunta.texto}</h3>
            </div>

            {/* O vencedor (ou os empatados), depois do suspense. */}
            <div className="grid min-h-[190px] place-items-center">
              <AnimatePresence mode="wait">
                {revelado ? (
                  <motion.div key="vencedor" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 13 }}
                    className="flex flex-wrap justify-center gap-6">
                    {r.vencedores.length === 0 && <p className="text-muted-foreground">Ninguém votou nesta pergunta.</p>}
                    {r.vencedores.map(id => {
                      const p = pessoas.get(id);
                      return (
                        <div key={id} className="flex flex-col items-center gap-2 text-center">
                          <div className="relative">
                            <motion.span initial={{ y: -24, opacity: 0, rotate: -20 }} animate={{ y: 0, opacity: 1, rotate: -12 }} transition={{ delay: 0.25 }}
                              className="absolute -top-6 left-1/2 -translate-x-1/2 text-warning"><Crown className="h-9 w-9 fill-warning/40" /></motion.span>
                            <FotoLider lider={p} className="h-28 w-28 text-3xl ring-4 ring-warning" />
                          </div>
                          <p className="text-xl font-bold">{p?.nome ?? 'Líder'}</p>
                          <p className="text-xs text-muted-foreground">{p?.setor}{r.desempatado ? ' · desempate da diretoria' : ''}</p>
                        </div>
                      );
                    })}
                  </motion.div>
                ) : apurando ? (
                  <motion.div key="apurando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3">
                    <motion.span animate={{ scale: [1, 1.18, 1] }} transition={{ repeat: Infinity, duration: 0.45 }} className="text-5xl" aria-hidden="true">🥁</motion.span>
                    <p className="text-sm font-medium text-muted-foreground">Apurando…</p>
                  </motion.div>
                ) : (
                  <motion.div key="revelar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Button size="lg" className="gap-2 px-8" onClick={revelar}><Trophy className="h-4 w-4" /> Revelar o vencedor</Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {revelado ? (
              <div className="space-y-2">
                <ul className="space-y-2">
                  {r.linhas.slice(0, verTodos ? undefined : TOPO).map((l, n) => {
                    const p = pessoas.get(l.id);
                    const venceu = r.vencedores.includes(l.id);
                    const posicao = 1 + r.linhas.filter(o => o.votos > l.votos).length;
                    return (
                      <motion.li key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(n, 8) * 0.05 }}
                        className={cn('relative overflow-hidden rounded-lg border bg-card', venceu && 'border-warning/60')}>
                        <motion.div className={cn('absolute inset-y-0 left-0', venceu ? 'bg-warning/20' : 'bg-primary/10')}
                          initial={{ width: 0 }} animate={{ width: `${l.pct}%` }} transition={{ duration: 0.8, delay: 0.15 + Math.min(n, 8) * 0.06 }} />
                        <div className="relative flex items-center gap-3 px-3 py-1.5">
                          <span className="w-6 text-center text-xs font-bold tabular-nums text-muted-foreground">{posicao}º</span>
                          <FotoLider lider={p} className="h-8 w-8 text-[11px]" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {p ? nomeCurto(p.nome) : 'Líder'}
                            {meus[r.pergunta.id] === l.id && <span className="ml-2 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">seu voto</span>}
                          </span>
                          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                            <strong className="text-foreground">{l.votos}</strong> {l.votos === 1 ? 'voto' : 'votos'} · {l.pct.toLocaleString('pt-BR')}%
                          </span>
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
                {r.linhas.length > TOPO && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{verTodos ? `Os ${r.linhas.length} líderes` : `Os ${TOPO} mais votados de ${r.linhas.length}`}</span>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setVerTodos(v => !v)}>
                      {verTodos ? `Mostrar só os ${TOPO} primeiros` : `Ver todos os ${r.linhas.length}`}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              /* Antes de revelar: todos os rostos da pergunta; no suspense, um holofote passeia por eles. */
              <div className="space-y-2 text-center">
                <p className="text-xs text-muted-foreground">{r.linhas.length} líderes concorrendo</p>
                <ul className="mx-auto flex max-w-3xl flex-wrap justify-center gap-1.5">
                  {ordemFixa.map((id, n) => {
                    const p = pessoas.get(id);
                    const aceso = apurando && n === holofote;
                    return (
                      <li key={id} title={p?.nome}>
                        <FotoLider lider={p} className={cn('h-10 w-10 text-[11px] transition-all duration-100 sm:h-12 sm:w-12',
                          apurando && !aceso && 'opacity-35', aceso && 'scale-125 ring-4 ring-warning')} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="quadro" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col gap-4">
            <div className="text-center">
              <div className="text-5xl" aria-hidden="true">🏆</div>
              <h3 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Quem levou mais títulos</h3>
              <p className="mt-1 text-sm text-muted-foreground">Cada pergunta é um título; os empates foram decididos pela diretoria.</p>
            </div>
            <ol className="space-y-2">
              {quadro.map((q, n) => {
                const p = pessoas.get(q.id);
                // Empate em títulos divide a posição: todos os de 2 títulos são «2º».
                const posicao = 1 + quadro.filter(o => o.titulos.length > q.titulos.length).length;
                return (
                  <motion.li key={q.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: n * 0.05 }}
                    className={cn('flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5', posicao === 1 && 'border-warning/60 bg-warning/10')}>
                    <span className="w-6 text-center text-sm font-bold tabular-nums text-muted-foreground">{posicao}º</span>
                    <FotoLider lider={p} className="h-10 w-10 text-xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p?.nome ?? 'Líder'}</p>
                      <p className="truncate text-xs text-muted-foreground" title={q.titulos.map(t => t.texto).join(' · ')}>
                        {q.titulos.map(t => t.emoji).join(' ')}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums"><strong>{q.titulos.length}</strong> {q.titulos.length === 1 ? 'título' : 'títulos'}</span>
                  </motion.li>
                );
              })}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <Button variant="ghost" className="gap-1.5" disabled={idx === 0 || apurando} onClick={() => ir(idx - 1)}><ChevronLeft className="h-4 w-4" /> Anterior</Button>
        <span className="hidden text-xs text-muted-foreground sm:inline">Espaço revela e avança</span>
        <Button variant={revelado || idx === fim ? 'default' : 'ghost'} className="gap-1.5" disabled={idx === fim || apurando} onClick={() => ir(idx + 1)}>
          {idx === fim - 1 ? 'Quadro de títulos' : 'Próxima'} <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
