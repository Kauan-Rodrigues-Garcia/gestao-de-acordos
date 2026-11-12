/**
 * VisaoDiretoria — o resultado ANTES de ir para a tela (pedido de 04/11/2026).
 *
 * Fechada a votação, só a diretoria vê a apuração inteira, pergunta por
 * pergunta, e decide as categorias que precisam dela:
 *
 *   - empate no 1º lugar (04/11/2026);
 *   - o mesmo líder em 1º em mais de uma categoria (10/11/2026): a diretoria
 *     escolhe, entre os mais votados de cada uma, quem leva. Pode manter o
 *     mesmo líder — fica a critério dela —, mas decide cada categoria dele.
 *
 * Tirar o líder de uma categoria pode dar o 1º lugar a alguém que já leva
 * outra; aí essa outra passa a pedir decisão também. A regra é a mesma do
 * banco (`situacaoDasDecisoes` = `fn_vl_pendentes`), que confere de novo ao
 * liberar. «Liberar o resultado» só destrava sem nada pendente; aí começa a
 * revelação (`ResultadoVotacao`).
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronDown, Copy, Eye, Scale, Trophy, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  nomeCurto, situacaoDasDecisoes,
  type Candidato, type Desempates, type Pergunta, type ResultadoDaPergunta,
} from './cedula';
import { FotoLider } from './FotoLider';
import { textosDo, type TipoDaVotacao } from './textos';

interface Props {
  resultados: ResultadoDaPergunta[];
  pessoas: ReadonlyMap<string, Candidato>;
  desempates: Desempates;
  onDesempatar: (perguntaId: string, liderId: string) => void;
  onLiberar: () => void;
  /** A mesma pessoa em 1º em mais de uma pede decisão (padrão). Ver `situacaoDasDecisoes`. */
  umTitulo?: boolean;
  tipo?: TipoDaVotacao;
}

type Filtro = 'decidir' | 'todas';

/** Quantos dos mais votados aparecem para escolher antes do «ver todos». */
const OPCOES = 4;

const emojis = (ps: readonly Pergunta[]) => ps.map(p => p.emoji).join(' ');

export function VisaoDiretoria({ resultados, pessoas, desempates, onDesempatar, onLiberar, umTitulo = true, tipo = 'lideranca' }: Props) {
  const t = textosDo(tipo);
  const d = useMemo(() => situacaoDasDecisoes(resultados, desempates, { umTitulo }), [resultados, desempates, umTitulo]);
  // As que pedem (ou pediram) a diretoria: pendentes e já decididas.
  const paraDecidir = useMemo(
    () => resultados.filter(r => { const s = d.porPergunta.get(r.pergunta.id); return s?.pendente || s?.decidida; }),
    [resultados, d],
  );
  const [filtro, setFiltro] = useState<Filtro>(paraDecidir.length ? 'decidir' : 'todas');
  const [todasAsOpcoes, setTodasAsOpcoes] = useState<Set<string>>(() => new Set());
  const lista = filtro === 'decidir' ? paraDecidir : resultados;
  const decididas = paraDecidir.length - d.pendentes;
  // Quem fica com mais de uma categoria do jeito que está (só aviso: é escolha da diretoria).
  const comVarias = useMemo(
    () => [...d.titulos.entries()].filter(([, ps]) => ps.length > 1).sort((a, b) => b[1].length - a[1].length),
    [d],
  );
  const nome = (id: string) => { const p = pessoas.get(id); return p ? nomeCurto(p.nome) : t.Pessoa; };

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col gap-4 px-4 pb-28 pt-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <Eye className="h-3 w-3" /> Só a diretoria vê
          </span>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">Apuração antes da liberação</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {umTitulo
              ? `Onde deu empate no 1º lugar, ou onde o mesmo ${t.pessoa} ficou em 1º em mais de uma categoria, a diretoria escolhe quem leva entre os mais votados dela.`
              : `Onde deu empate no 1º lugar, a diretoria escolhe quem leva entre os mais votados. Nesta votação o mesmo ${t.pessoa} pode levar mais de uma categoria.`}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border bg-card px-3 py-2"><p className="text-xl font-bold tabular-nums">{resultados.length}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Perguntas</p></div>
          <div className={cn('rounded-lg border px-3 py-2', d.pendentes ? 'border-warning/50 bg-warning/10' : 'bg-card')}><p className="text-xl font-bold tabular-nums">{d.pendentes}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">A decidir</p></div>
          <div className={cn('rounded-lg border px-3 py-2', !d.pendentes && paraDecidir.length ? 'border-success/50 bg-success/10' : 'bg-card')}><p className="text-xl font-bold tabular-nums">{decididas}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Decididas</p></div>
        </div>
      </div>

      <div role="radiogroup" aria-label="Mostrar" className="flex w-fit overflow-hidden rounded-md border text-xs">
        {([['decidir', `Para decidir (${paraDecidir.length})`], ['todas', `Todas (${resultados.length})`]] as const).map(([v, t]) => (
          <button key={v} type="button" role="radio" aria-checked={filtro === v} onClick={() => setFiltro(v)}
            className={cn('px-3 py-1.5', filtro === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{t}</button>
        ))}
      </div>

      {lista.length === 0 && (
        <p className="rounded-lg border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Nada a decidir: cada pergunta tem um vencedor claro, e ninguém ficou em 1º em mais de uma. É só liberar.
        </p>
      )}

      <ul className="space-y-3">
        {lista.map(r => {
          const s = d.porPergunta.get(r.pergunta.id)!;
          const pede = s.pendente || s.decidida;
          const escolhido = s.decidida ? desempates[r.pergunta.id] : null;
          const topo = r.linhas[0]?.votos ?? 0;
          const comVoto = r.linhas.filter(l => l.votos > 0);
          const verTodas = todasAsOpcoes.has(r.pergunta.id);
          // As opções: os mais votados; o escolhido sempre aparece, mesmo fora dos primeiros.
          // «Ver todos» abre todos os participantes, com ou sem voto (11/11/2026: a diretoria decide).
          const opcoes = verTodas ? r.linhas : r.linhas.filter(l => (l.votos > 0 && comVoto.indexOf(l) < OPCOES) || l.id === escolhido);
          return (
            <li key={r.pergunta.id}
              className={cn('rounded-xl border bg-card p-3 sm:p-4', s.pendente && 'border-warning/60', s.decidida && 'border-success/50')}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold"><span aria-hidden="true" className="mr-1.5">{r.pergunta.emoji}</span>{r.pergunta.texto}</p>
                {s.decidida ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                    <Check className="h-3 w-3" /> Decidido
                  </span>
                ) : s.pendente ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
                    {s.empate ? <><Scale className="h-3 w-3" /> Empate · {r.vencedores.length} com {topo} votos</> : <><Copy className="h-3 w-3" /> Em 1º em mais de uma</>}
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <Trophy className="h-3 w-3" /> {topo} de {r.total} votos
                  </span>
                )}
              </div>

              {pede ? (
                <>
                  {s.repetidos.length > 0 && (
                    <p className="mt-2 text-xs text-warning">
                      {s.repetidos.map(x => `${nome(x.id)} também está em 1º em ${emojis(x.outras)} ${x.outras.map(p => `«${p.texto}»`).join(', ')}`).join(' · ')}.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">Quem leva esta categoria? Os mais votados dela:</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={`Decisão: ${r.pergunta.texto}`}>
                    {opcoes.map(l => {
                      const p = pessoas.get(l.id);
                      const meu = escolhido === l.id;
                      // O que esta pessoa já leva fora daqui (com as decisões de agora).
                      const outras = (d.titulos.get(l.id) ?? []).filter(q => q.id !== r.pergunta.id);
                      return (
                        <motion.button key={l.id} type="button" role="radio" aria-checked={meu} whileTap={{ scale: 0.97 }}
                          onClick={() => onDesempatar(r.pergunta.id, l.id)}
                          className={cn('relative flex flex-col items-center gap-1 rounded-xl border-2 p-2.5 text-center transition-colors',
                            meu ? 'border-success bg-success/10' : escolhido ? 'border-border opacity-55 hover:opacity-100' : 'border-border hover:border-primary/60')}>
                          {meu && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-success text-success-foreground"><Check className="h-3 w-3" /></span>}
                          <FotoLider lider={p} className="h-14 w-14 rounded-xl text-lg" />
                          <span className="line-clamp-2 text-sm font-semibold leading-tight">{p ? nomeCurto(p.nome) : t.Pessoa}</span>
                          <span className="text-[11px] text-muted-foreground">{l.votos} {l.votos === 1 ? 'voto' : 'votos'} · {l.pct.toLocaleString('pt-BR')}%</span>
                          {outras.length > 0 && (
                            <span className="rounded-full bg-warning/15 px-1.5 text-[10px] font-medium text-warning" title={outras.map(q => q.texto).join(' · ')}>
                              já leva {emojis(outras)}
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                  {r.linhas.length > opcoes.length || verTodas ? (
                    <button type="button" className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      onClick={() => setTodasAsOpcoes(t => { const n = new Set(t); if (n.has(r.pergunta.id)) n.delete(r.pergunta.id); else n.add(r.pergunta.id); return n; })}>
                      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', verTodas && 'rotate-180')} />
                      {verTodas ? 'Só os mais votados' : `Ver todos os participantes (${r.linhas.length})`}
                    </button>
                  ) : null}
                </>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                  {r.linhas.slice(0, 3).map((l, n) => {
                    const p = pessoas.get(l.id);
                    return (
                      <span key={l.id} className={cn('flex items-center gap-1.5', n === 0 ? 'font-semibold' : 'text-muted-foreground')}>
                        <span className="w-5 text-xs tabular-nums">{n + 1}º</span>
                        <FotoLider lider={p} className="h-6 w-6 text-[9px]" />
                        {p ? nomeCurto(p.nome) : t.Pessoa} <span className="text-xs tabular-nums opacity-80">{l.votos}</span>
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
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background px-4 py-3">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 text-sm">
            <p className={d.pendentes ? 'text-warning' : 'text-success'}>
              {d.pendentes
                ? `Falta decidir ${d.pendentes} ${d.pendentes === 1 ? 'categoria' : 'categorias'} para liberar.`
                : 'Tudo decidido. Liberado, o resultado vai para a revelação.'}
            </p>
            {!d.pendentes && comVarias.length > 0 && (
              <p className="truncate text-xs text-muted-foreground" title={comVarias.map(([id, ps]) => `${nome(id)}: ${ps.map(p => p.texto).join(' · ')}`).join('\n')}>
                Com mais de uma categoria, por escolha da diretoria: {comVarias.map(([id, ps]) => `${nome(id)} (${ps.length})`).join(', ')}.
              </p>
            )}
          </div>
          <Button className="gap-2" disabled={d.pendentes > 0} onClick={onLiberar}>
            <Unlock className="h-4 w-4" /> Liberar o resultado
          </Button>
        </div>
      </div>
    </div>
  );
}
