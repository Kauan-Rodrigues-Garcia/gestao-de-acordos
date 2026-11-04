/**
 * GradeDeLideres — todos os líderes de uma vez, encaixados na tela (04/11/2026).
 *
 * Mede o espaço que sobra (ResizeObserver) e pede a `melhorGrade` o maior
 * cartão em que todos cabem sem rolar: 6 líderes viram fotos grandes, 30 viram
 * um mosaico. A última linha fica centralizada. Só no celular com muita gente
 * a grade rola, no tamanho mínimo.
 *
 * `bloqueados`: quem a pessoa já escolheu em OUTRA pergunta (cada colega uma
 * vez só, 04/11/2026). O cartão fica travado e mostra o emoji da pergunta.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PROPORCAO_CARTAO, melhorGrade, nomeCurto, type Candidato, type Pergunta } from './cedula';
import { FotoLider } from './FotoLider';

interface Props {
  ids: readonly string[];
  pessoas: ReadonlyMap<string, Candidato>;
  escolhido: string | undefined;
  eleitorId: string | null;
  rotulo: string;
  onEscolher: (id: string) => void;
  /** Candidato → pergunta em que já foi escolhido por quem vota. */
  bloqueados?: ReadonlyMap<string, Pergunta>;
}

const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function GradeDeLideres({ ids, pessoas, escolhido, eleitorId, rotulo, onEscolher, bloqueados }: Props) {
  const area = useRef<HTMLDivElement>(null);
  const [tamanho, setTamanho] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const medir = () => setTamanho({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const espaco = tamanho.w < 640 ? 8 : 12;
  const grade = melhorGrade(ids.length, tamanho.w, tamanho.h, { espaco, minimo: tamanho.w < 640 ? 72 : 84 });
  const w = grade.largura;
  const h = Math.round(w * PROPORCAO_CARTAO);
  const pad = Math.round(limitar(w * 0.055, 4, 10));
  const fonteNome = limitar(w * 0.105, 10.5, 18);
  const mostraSetor = w >= 118;

  return (
    <div ref={area} className={cn('min-h-0 flex-1', grade.rola && 'overflow-y-auto')}>
      {tamanho.w > 0 && (
        <div role="radiogroup" aria-label={rotulo}
          className={cn('mx-auto flex flex-wrap justify-center', !grade.rola && 'h-full content-center')}
          style={{ gap: espaco, maxWidth: grade.colunas * w + espaco * (grade.colunas - 1) }}>
          {ids.map((id, n) => {
            const p = pessoas.get(id);
            const eu = id === eleitorId;
            const meu = escolhido === id;
            const usado = bloqueados?.get(id);
            const travado = eu || !!usado;
            const apagado = !!escolhido && !meu;
            return (
              <motion.button key={id} type="button" role="radio" aria-checked={meu} disabled={travado}
                aria-label={eu ? `${p?.nome ?? 'Você'} (você)` : usado ? `${p?.nome} (já escolhido em: ${usado.texto})` : p?.nome}
                title={usado ? `Você já escolheu ${p?.nome ?? 'esta pessoa'} em «${usado.texto}». Para escolher aqui, troque a resposta de lá.` : undefined}
                initial={{ opacity: 0, y: 14, scale: 0.94 }}
                animate={{ opacity: eu ? 0.4 : usado ? 0.45 : apagado ? 0.5 : 1, y: 0, scale: meu ? 1.06 : 1 }}
                transition={{ delay: escolhido ? 0 : Math.min(n * 0.018, 0.4), type: 'spring', stiffness: 260, damping: 22 }}
                whileHover={travado ? undefined : { y: -5 }} whileTap={travado ? undefined : { scale: 0.96 }}
                onClick={() => onEscolher(id)}
                style={{ width: w, height: h, padding: pad, zIndex: meu ? 2 : undefined }}
                className={cn(
                  'group relative flex shrink-0 flex-col rounded-2xl border-2 bg-card text-center shadow-sm transition-colors',
                  meu ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20' : 'border-border hover:border-primary/60',
                  travado && 'cursor-not-allowed grayscale',
                )}>
                <span className="relative block aspect-square w-full overflow-hidden rounded-xl bg-muted">
                  <FotoLider lider={p}
                    className="h-full w-full rounded-none transition-transform duration-300 group-hover:scale-105"
                    estilo={{ fontSize: w * 0.28 }} />
                  {meu && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                      className="absolute inset-0 grid place-items-center bg-primary/35">
                      <span className="grid place-items-center rounded-full bg-primary text-primary-foreground shadow-md" style={{ width: w * 0.34, height: w * 0.34 }}>
                        <Check style={{ width: w * 0.2, height: w * 0.2 }} strokeWidth={3} />
                      </span>
                    </motion.span>
                  )}
                  {eu && (
                    <span className="absolute inset-x-0 bottom-0 bg-background/80 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Você</span>
                  )}
                  {usado && !eu && (
                    <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-background/85 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span aria-hidden="true" className="text-xs normal-case">{usado.emoji}</span> Já escolhido
                    </span>
                  )}
                </span>
                <span className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden">
                  <span className={cn('font-semibold', mostraSetor ? 'truncate leading-tight' : 'line-clamp-2 break-words leading-[1.1]')} style={{ fontSize: fonteNome }}>{p ? nomeCurto(p.nome) : 'Líder'}</span>
                  {mostraSetor && <span className="truncate text-muted-foreground" style={{ fontSize: limitar(w * 0.07, 10, 13) }}>{p?.setor}</span>}
                </span>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
