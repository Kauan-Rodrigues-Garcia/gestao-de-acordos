/**
 * BaloesParabens — os parabéns subindo pelas laterais.
 *
 * Balões e não lista empilhada: o setor inteiro pode clicar ao mesmo tempo, e
 * uma lista viraria parede de texto no meio da tela. Subindo pelas bordas, o
 * centro fica livre para a comemoração e o volume de cliques não atrapalha.
 *
 * Cada balão aparece UMA vez e some. Não é um histórico — quem chegou depois
 * não precisa ver os parabéns de antes.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { fraseValida } from '@/pages/Comemoracoes/frases';
import type { ParabensComemoracao } from '@/services/comemoracoes.service';

/** Quanto tempo o balão leva para subir e sumir. */
const VIDA_MS = 4_200;

/**
 * Teto de balões simultâneos.
 *
 * Um setor grande clicando junto encheria a tela; acima disso os mais antigos
 * saem para dar lugar, e ninguém percebe a diferença.
 */
const MAX_NA_TELA = 8;

interface BalaoNaTela {
  chave:   string;
  nome:    string;
  foto:    string | null;
  frase:   string;
  /** Balões alternam os lados para não empilharem numa borda só. */
  lado:    'esquerda' | 'direita';
  /** Altura de partida, em % — espalha para não saírem todos do mesmo ponto. */
  base:    number;
}

function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] || 'Alguém';
}

export function BaloesParabens({ parabens }: { parabens: ParabensComemoracao[] }) {
  const [naTela, setNaTela] = useState<BalaoNaTela[]>([]);

  /**
   * Quem já virou balão. Começa vazio e é preenchido na primeira carga sem
   * animar: quem abre a tela no meio da festa não deve levar uma enxurrada de
   * balões de parabéns que já aconteceram.
   */
  const vistosRef = useRef<Set<string> | null>(null);
  const contadorRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  useEffect(() => {
    const chaveDe = (p: ParabensComemoracao) => `${p.comemoracao_id}:${p.usuario_id}`;

    if (vistosRef.current === null) {
      vistosRef.current = new Set(parabens.map(chaveDe));
      return;
    }

    const vistos = vistosRef.current;
    const novos = parabens.filter((p) => !vistos.has(chaveDe(p)));
    if (!novos.length) return;
    for (const p of novos) vistos.add(chaveDe(p));

    const criados = novos.map((p) => {
      const n = contadorRef.current++;
      return {
        chave: `${chaveDe(p)}:${n}`,
        nome:  primeiroNome(p.pessoa?.nome),
        foto:  p.pessoa?.foto_url ?? null,
        frase: fraseValida(p.frase),
        lado:  (n % 2 === 0 ? 'esquerda' : 'direita') as BalaoNaTela['lado'],
        // 20% a 70% da altura: abaixo do card e acima do rodapé.
        base:  20 + Math.random() * 50,
      };
    });

    setNaTela((atual) => [...atual, ...criados].slice(-MAX_NA_TELA));

    const timer = setTimeout(() => {
      const chaves = new Set(criados.map((c) => c.chave));
      setNaTela((atual) => atual.filter((b) => !chaves.has(b.chave)));
    }, VIDA_MS);
    timersRef.current.push(timer);
  }, [parabens]);

  return (
    // Não rouba clique: isto passa por cima de gente trabalhando.
    <div className="pointer-events-none fixed inset-0 z-[101] overflow-hidden" aria-hidden="true">
      <AnimatePresence>
        {naTela.map((b) => (
          <motion.div
            key={b.chave}
            className={cn(
              'absolute flex items-center gap-2 rounded-full border border-white/20 bg-black/70 py-1 pl-1 pr-3 shadow-lg backdrop-blur-sm',
              b.lado === 'esquerda' ? 'left-3' : 'right-3',
            )}
            style={{ top: `${b.base}%` }}
            initial={{ opacity: 0, y: 30, scale: 0.8 }}
            animate={{ opacity: [0, 1, 1, 0], y: -120, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: VIDA_MS / 1000, ease: 'easeOut', times: [0, 0.12, 0.75, 1] }}
          >
            <Avatar className="h-6 w-6 border border-white/40">
              {b.foto && <AvatarImage src={b.foto} alt="" className="object-cover" />}
              <AvatarFallback className="bg-primary text-[9px] font-bold text-primary-foreground">
                {b.nome.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="whitespace-nowrap text-xs font-semibold text-white">
              <strong className="font-bold">{b.nome}:</strong> {b.frase}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
