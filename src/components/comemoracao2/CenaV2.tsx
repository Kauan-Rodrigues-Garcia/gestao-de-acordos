/**
 * CenaV2 — a Comemoração 2.0 chegando na tela.
 *
 * O `ComemoracaoOverlay` continua decidindo QUAL festa está no ar, quando o
 * som toca e quem pode parabenizar; esta cena só cuida de como ela aparece.
 * Comemoração sem `design` (criada na 1.0) segue com o card antigo.
 *
 * Mesmas regras de convivência da 1.0, porque isto passa por cima de gente
 * atendendo: não bloqueia cliques fora dos botões, silencia com um clique e
 * fecha no ×.
 */
import { useRef } from 'react';
import { motion } from 'framer-motion';
import { Volume2, VolumeX, X } from 'lucide-react';
import type { PessoaComemoracao } from '@/services/comemoracoes.service';
import {
  FilasParabens, PainelParabens, type PainelParabensProps,
} from '@/components/comemoracao/PainelParabens';
import { CardV2 } from './CardV2';
import { EfeitoV2 } from './EfeitoV2';
import type { DesignCard } from './design';
import { papelDeParede } from './papeisDeParede';

export interface CenaV2Props {
  titulo:       string;
  mensagem:     string | null;
  homenageados: PessoaComemoracao[];
  design:       DesignCard;
  duracaoS:     number;
  ehTeste:      boolean;
  onFechar:     () => void;
  mudo:         boolean;
  onAlternarMudo: () => void;
  /** Convite e mural de parabéns. A cor vem do papel de parede. */
  parabens: Omit<PainelParabensProps, 'cor' | 'corTexto'>;
}

const BOTAO_REDONDO =
  'pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full '
  + 'bg-black/55 text-white shadow-lg backdrop-blur transition-colors hover:bg-black/80 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white';

export function CenaV2({
  titulo, mensagem, homenageados, design, duracaoS, ehTeste,
  onFechar, mudo, onAlternarMudo, parabens,
}: CenaV2Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const papel = papelDeParede(design.papel);

  return (
    <motion.div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-3 pt-5"
      initial={{ opacity: 0, y: -80, scale: 0.86, rotate: -2 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      exit={{ opacity: 0, y: -50, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 230, damping: 20 }}
      role="status"
      aria-live="polite"
    >
      <EfeitoV2 efeito={design.efeito} alvoRef={cardRef} />

      {/* Acima do efeito: o confete sai de trás do card e nunca cobre o texto. */}
      <div className="relative z-10 w-full max-w-[600px]">
        {/* Quem parabenizou, em duas filas penduradas nas laterais do card. */}
        <FilasParabens itens={parabens.itens} cor={papel.destaque} />

        {ehTeste && (
          <span className="absolute -top-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-900 shadow-lg">
            Teste · só você vê
          </span>
        )}

        <div ref={cardRef}
          className="rounded-[28px]"
          style={{ boxShadow: `0 24px 60px -12px rgba(0,0,0,.55), 0 0 0 1px ${papel.destaque}33` }}>
          <CardV2
            titulo={titulo}
            mensagem={mensagem}
            homenageados={homenageados}
            design={design}
            modo="exibicao"
            tempoTotalS={duracaoS}
          />
        </div>

        <div className="absolute -right-2 -top-2 z-20 flex gap-1.5">
          <button type="button" onClick={onAlternarMudo} className={BOTAO_REDONDO}
            aria-label={mudo ? 'Ligar o som das comemorações' : 'Silenciar as comemorações'}
            title={mudo ? 'Som desligado' : 'Silenciar comemorações'}>
            {mudo ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button type="button" onClick={onFechar} className={BOTAO_REDONDO}
            aria-label="Fechar comemoração" title="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3">
          <PainelParabens {...parabens} cor={papel.destaque} corTexto={papel.claro ? '#FFFFFF' : '#16110A'} />
        </div>
      </div>
    </motion.div>
  );
}
