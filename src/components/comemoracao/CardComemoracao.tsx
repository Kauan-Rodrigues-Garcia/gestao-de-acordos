/**
 * CardComemoracao — o card da comemoração.
 *
 * O MESMO componente serve à exibição e (na fase 2) ao preview do editor, via
 * `modo`. Se fossem dois, divergiriam na primeira mudança — e o líder
 * descobriria isso com a comemoração já na tela de todo mundo.
 *
 * Proporção fixa (`ASPECTO`) para o que o líder vê ser o que os outros veem,
 * em qualquer monitor.
 */
import { motion } from 'framer-motion';
import { X, Trophy } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { PessoaComemoracao } from '@/services/comemoracoes.service';

/** Card de referência, em unidades lógicas. As posições do editor são % disto. */
export const LARGURA_LOGICA = 640;
export const ALTURA_LOGICA  = 360;
export const ASPECTO = `${LARGURA_LOGICA} / ${ALTURA_LOGICA}`;

/** Primeiro nome — o card não tem largura para nome completo de 4 palavras. */
function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] || '—';
}

function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase();
}

export function CardComemoracao({
  titulo, mensagem, homenageados, modo = 'exibicao', onFechar, tempoTotalS,
}: {
  titulo:       string;
  mensagem:     string | null;
  homenageados: PessoaComemoracao[];
  /** 'editor' ganha alças de arrasto na fase 2; 'exibicao' só anima. */
  modo?:        'editor' | 'exibicao';
  onFechar?:    () => void;
  /** Duração, para a barra de tempo. Ausente = sem barra (preview). */
  tempoTotalS?: number;
}) {
  // Com muita gente as fotos encolhem, senão a última linha sai do card.
  const muitos = homenageados.length > 6;

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border-2 border-amber-400/60 shadow-2xl',
        'bg-gradient-to-br from-amber-500/95 via-orange-500/95 to-rose-500/95',
        modo === 'editor' && 'ring-1 ring-primary/40',
      )}
      style={{ aspectRatio: ASPECTO }}
    >
      {/* Brilho de fundo, puramente decorativo */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.35),transparent_60%)]" />

      {onFechar && (
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar comemoração"
          // O card inteiro é `pointer-events-none` (ver o overlay); este botão
          // reativa só para si.
          className="pointer-events-auto absolute right-2 top-2 z-10 rounded-full bg-black/20 p-1 text-white/80 transition-colors hover:bg-black/40 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <div className="relative flex h-full flex-col items-center justify-center gap-3 px-6 py-5 text-center text-white">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 14 }}
          className="rounded-full bg-white/20 p-2.5 backdrop-blur-sm"
        >
          <Trophy className="h-7 w-7 drop-shadow" />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-2xl font-black uppercase leading-tight tracking-wide drop-shadow-md sm:text-3xl"
        >
          {titulo}
        </motion.h2>

        {mensagem && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="max-w-[85%] text-sm font-medium leading-snug text-white/90 drop-shadow"
          >
            {mensagem}
          </motion.p>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="flex flex-wrap items-start justify-center gap-x-4 gap-y-2 pt-1"
        >
          {homenageados.map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-1">
              <Avatar className={cn('border-2 border-white/70 shadow-lg', muitos ? 'h-9 w-9' : 'h-12 w-12')}>
                {p.foto_url && <AvatarImage src={p.foto_url} alt={p.nome} className="object-cover" />}
                <AvatarFallback className="bg-white/25 text-xs font-bold text-white">
                  {iniciais(p.nome)}
                </AvatarFallback>
              </Avatar>
              <span className={cn('font-bold drop-shadow', muitos ? 'text-[10px]' : 'text-xs')}>
                {primeiroNome(p.nome)}
              </span>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Relógio visual: mostra quanto falta, para o card não parecer travado. */}
      {!!tempoTotalS && (
        <div className="absolute bottom-0 left-0 h-1.5 w-full bg-black/20">
          <motion.div
            className="h-full bg-white/80"
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: tempoTotalS, ease: 'linear' }}
          />
        </div>
      )}
    </div>
  );
}
