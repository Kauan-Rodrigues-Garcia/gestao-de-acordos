/**
 * OnboardingTour.tsx
 * Tour guiado exibido apenas no primeiro login.
 * Implementação 100% customizada — sem bibliotecas externas de tour.
 * Spotlight via SVG mask com animação spring (framer-motion).
 * Controlado por localStorage: key = `onboarding_v2_${userId}`.
 */
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronRight, ChevronLeft,
  BarChart3, Filter, FileText, Plus, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const STORAGE_KEY = (uid: string) => `onboarding_v2_${uid}`;
const PAD = 12;   // padding ao redor do elemento destacado
const TW  = 308;  // largura do tooltip em px
const GAP = 18;   // espaço entre spotlight e tooltip
const RX  = 10;   // raio das bordas do spotlight
const Z   = 10000;

interface TourStep {
  target:    string | null;
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center';
  Icon:      React.ElementType | null;
  emoji?:    string;
  title:     string;
  body:      string;
}

const STEPS: TourStep[] = [
  {
    target:    null,
    placement: 'center',
    Icon:      null,
    emoji:     '👋',
    title:     'Bem-vindo ao sistema!',
    body:      'Vamos fazer um tour rápido pelas principais funcionalidades. Leva menos de 1 minuto.',
  },
  {
    target:    '[data-tour="metricas"]',
    placement: 'bottom',
    Icon:      BarChart3,
    title:     'Métricas do dia',
    body:      'Resumo em tempo real: acordos de hoje, pagos, pendentes e vencidos — com os valores previstos e já recebidos.',
  },
  {
    target:    '[data-tour="filtros"]',
    placement: 'bottom',
    Icon:      Filter,
    title:     'Busca e filtros',
    body:      'Encontre acordos pelo Código, nome ou CPF. Combine filtros de status, forma de pagamento e data para resultados precisos.',
  },
  {
    target:    '[data-tour="tabela-acordos"]',
    placement: 'top',
    Icon:      FileText,
    title:     'Tabela de acordos',
    body:      'Cada linha é um acordo. Use os botões de ação: marcar como pago, reagendar, editar ou excluir. Clique na linha para detalhes.',
  },
  {
    target:    '[data-tour="novo-acordo"]',
    placement: 'left',
    Icon:      Plus,
    title:     'Novo acordo',
    body:      'Cadastre um novo acordo diretamente na lista, sem sair da página. O Código é validado automaticamente para evitar duplicatas.',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

interface SpotRect { x: number; y: number; w: number; h: number }

function measureTarget(selector: string): SpotRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    x: r.left  - PAD,
    y: r.top   - PAD,
    w: r.width  + PAD * 2,
    h: r.height + PAD * 2,
  };
}

function useSpotRect(target: string | null, active: boolean): SpotRect | null {
  const [rect, setRect] = useState<SpotRect | null>(null);

  useEffect(() => {
    if (!active || !target) { setRect(null); return; }

    const update = () => setRect(measureTarget(target));
    update();

    // Scroll suave ao elemento quando o passo ativa
    const el = document.querySelector(target);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const ro = new ResizeObserver(update);
      ro.observe(el);
      window.addEventListener('resize', update, { passive: true });
      window.addEventListener('scroll', update, { passive: true });
      return () => {
        ro.disconnect();
        window.removeEventListener('resize', update);
        window.removeEventListener('scroll', update);
      };
    }
  }, [target, active]);

  return rect;
}

function useViewport() {
  const [size, setSize] = useState(() => ({
    vw: typeof window !== 'undefined' ? window.innerWidth  : 1280,
    vh: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  useEffect(() => {
    const handler = () => setSize({ vw: window.innerWidth, vh: window.innerHeight });
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return size;
}

function computeTooltipStyle(
  step:  TourStep,
  spot:  SpotRect | null,
  vw:    number,
  vh:    number,
): React.CSSProperties {
  const base: React.CSSProperties = {
    position:   'fixed',
    width:      TW,
    maxWidth:   'calc(100vw - 32px)',
    zIndex:     Z,
  };

  if (step.placement === 'center' || !spot) {
    return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  const cx = spot.x + spot.w / 2;

  if (step.placement === 'bottom') {
    return {
      ...base,
      top:  spot.y + spot.h + GAP,
      left: clamp(cx - TW / 2, 16, vw - TW - 16),
    };
  }
  if (step.placement === 'top') {
    return {
      ...base,
      bottom: vh - spot.y + GAP,
      left:   clamp(cx - TW / 2, 16, vw - TW - 16),
    };
  }
  if (step.placement === 'left') {
    return {
      ...base,
      top:  clamp(spot.y + spot.h / 2 - 110, 16, vh - 260),
      left: clamp(spot.x - TW - GAP, 16, vw - TW - 16),
    };
  }
  // 'right'
  return {
    ...base,
    top:  clamp(spot.y + spot.h / 2 - 110, 16, vh - 260),
    left: clamp(spot.x + spot.w + GAP, 16, vw - TW - 16),
  };
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function OnboardingTour() {
  const { user } = useAuth();
  const [active, setActive]   = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const { vw, vh } = useViewport();

  useEffect(() => {
    if (!user?.id) return;
    if (!localStorage.getItem(STORAGE_KEY(user.id))) {
      const t = setTimeout(() => setActive(true), 1000);
      return () => clearTimeout(t);
    }
  }, [user?.id]);

  const finish = useCallback(() => {
    setActive(false);
    if (user?.id) localStorage.setItem(STORAGE_KEY(user.id), '1');
  }, [user?.id]);

  const goNext = useCallback(() => {
    if (stepIdx >= STEPS.length - 1) { finish(); return; }
    setStepIdx(i => i + 1);
  }, [stepIdx, finish]);

  const goPrev = useCallback(() => {
    if (stepIdx > 0) setStepIdx(i => i - 1);
  }, [stepIdx]);

  const step       = STEPS[stepIdx];
  const spotRect   = useSpotRect(step.target, active);
  const tooltipPos = computeTooltipStyle(step, spotRect, vw, vh);
  const isFirst    = stepIdx === 0;
  const isLast     = stepIdx === STEPS.length - 1;

  if (!active) return null;

  return createPortal(
    // Wrapper captura cliques fora do tooltip (fecha o tour)
    <div
      style={{ position: 'fixed', inset: 0, zIndex: Z - 1 }}
      onClick={finish}
    >
      {/* ── Overlay visual (pointer-events: none — só visual) ── */}
      <AnimatePresence>
        {spotRect ? (
          <motion.svg
            key="svg-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}
            width={vw}
            height={vh}
          >
            <defs>
              <mask id="__onboarding_mask__">
                {/* Branco = visível; preto = transparente (buraco do spotlight) */}
                <rect x={0} y={0} width={vw} height={vh} fill="white" />
                <motion.rect
                  initial={false}
                  animate={{
                    x: spotRect.x,
                    y: spotRect.y,
                    width:  spotRect.w,
                    height: spotRect.h,
                  }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  rx={RX} ry={RX}
                  fill="black"
                />
              </mask>
            </defs>

            {/* Sombra escura com buraco no elemento */}
            <rect
              x={0} y={0} width={vw} height={vh}
              fill="rgba(0,0,0,0.62)"
              mask="url(#__onboarding_mask__)"
            />

            {/* Anel de destaque ao redor do elemento */}
            <motion.rect
              initial={false}
              animate={{
                x: spotRect.x,
                y: spotRect.y,
                width:  spotRect.w,
                height: spotRect.h,
              }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              rx={RX} ry={RX}
              fill="none"
              stroke="rgba(147,197,253,0.65)"
              strokeWidth="1.5"
            />
          </motion.svg>
        ) : (
          <motion.div
            key="full-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position:       'fixed',
              inset:          0,
              background:     'rgba(0,0,0,0.62)',
              backdropFilter: 'blur(3px)',
              pointerEvents:  'none',
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Tooltip card ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={stepIdx}
          style={tooltipPos}
          initial={{ opacity: 0, scale: 0.94, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -6 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          // Impede que cliques no card fechem o tour
          onClick={(e) => e.stopPropagation()}
          className="relative bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Barra de acento colorida */}
          <div className="h-[3px] bg-gradient-to-r from-primary via-primary/70 to-transparent" />

          <div className="p-5">
            {/* Botão de fechar */}
            <button
              onClick={finish}
              className="absolute top-3.5 right-3.5 w-6 h-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Fechar tour"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            {/* Ícone + título */}
            <div className="flex items-center gap-3 mb-3 pr-8">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center text-primary">
                {step.emoji ? (
                  <span className="text-2xl leading-none">{step.emoji}</span>
                ) : step.Icon ? (
                  <step.Icon className="w-[18px] h-[18px]" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold text-primary/60 uppercase tracking-widest mb-0.5">
                  Passo {stepIdx + 1} de {STEPS.length}
                </p>
                <h3 className="text-sm font-semibold text-foreground leading-tight">
                  {step.title}
                </h3>
              </div>
            </div>

            {/* Descrição */}
            <p className="text-[12.5px] text-muted-foreground leading-relaxed mb-4">
              {step.body}
            </p>

            {/* Rodapé: indicadores + botões */}
            <div className="flex items-center justify-between gap-2">
              {/* Pílulas de progresso animadas */}
              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{
                      width:   i === stepIdx ? 20 : 6,
                      opacity: i <= stepIdx  ? 1  : 0.28,
                    }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className={cn('h-1.5 rounded-full bg-primary')}
                  />
                ))}
              </div>

              {/* Botões de navegação */}
              <div className="flex items-center gap-1.5">
                {!isFirst && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={goPrev}
                    className="h-8 px-3 text-xs gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Voltar
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={goNext}
                  className="h-8 px-4 text-xs font-semibold gap-1"
                >
                  {isLast ? (
                    <><CheckCircle2 className="w-3.5 h-3.5" />Concluir</>
                  ) : (
                    <>Próximo<ChevronRight className="w-3.5 h-3.5" /></>
                  )}
                </Button>
              </div>
            </div>

            {/* Link para pular (exceto no último passo) */}
            {!isLast && (
              <button
                onClick={finish}
                className="w-full text-center mt-3 text-[11px] text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors"
              >
                Pular tour
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  );
}
