/**
 * OnboardingTour.tsx
 * Tour guiado exibido apenas no primeiro login.
 * Implementação 100% customizada — sem bibliotecas externas de tour.
 *
 * Bookplay: navega automaticamente entre Dashboard (/) e Acordos (/acordos).
 * PaguePLAY: tudo no Dashboard — tabela de acordos fica dentro do {isPP && …}.
 *
 * Controlado por localStorage: key = `onboarding_v3_${userId}`.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  X, ChevronRight, ChevronLeft,
  BarChart3, Filter, FileText, Plus, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/lib/tenant-config';
import { cn } from '@/lib/utils';

const STORAGE_KEY = (uid: string) => `onboarding_v3_${uid}`;
const PAD    = 12;   // padding ao redor do elemento destacado
const TW     = 308;  // largura do tooltip em px
const GAP    = 18;   // espaço entre spotlight e tooltip
const RX     = 10;   // raio das bordas do spotlight
const Z      = 10000;
const CARD_H = 252;  // altura estimada do card (para centralizar sem CSS transform)

interface TourStep {
  target:    string | null;
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center';
  Icon:      React.ElementType | null;
  emoji?:    string;
  title:     string;
  body:      string;
  route?:    string;   // navegar para esta rota antes de exibir o passo
  spotMaxH?: number;   // limita a altura do spotlight (evita selecionar listas longas)
  scrollPx?: number;   // distância em px do topo do elemento ao topo da viewport após scroll
}

// ─── Definição dos passos por tenant ──────────────────────────────────────────

const WELCOME: TourStep = {
  target: null, placement: 'center', Icon: null, emoji: '👋',
  title:  'Bem-vindo ao sistema!',
  body:   'Vamos fazer um tour rápido pelas principais funcionalidades. Leva menos de 1 minuto.',
};

// PaguePLAY — tudo na tela Dashboard (/)
const STEPS_PP: TourStep[] = [
  WELCOME,
  {
    target: '[data-tour="metricas"]', placement: 'bottom', Icon: BarChart3, route: '/',
    title: 'Métricas do dia',
    body:  'Resumo em tempo real: acordos de hoje, pagos, pendentes e vencidos — com os valores previstos e já recebidos.',
  },
  {
    target: '[data-tour="filtros"]', placement: 'bottom', Icon: Filter, route: '/',
    title: 'Busca e filtros',
    body:  'Encontre acordos pelo Código ou nome. Combine filtros de status, forma de pagamento e data para resultados precisos.',
  },
  {
    target: '[data-tour="tabela-acordos"]', placement: 'top', Icon: FileText, route: '/',
    spotMaxH: 140,
    scrollPx: 320,
    title: 'Tabela de acordos',
    body:  'Cada linha é um acordo. Use os botões de ação: marcar como pago, reagendar, editar ou excluir. Clique na linha para detalhes.',
  },
  {
    target: '[data-tour="novo-acordo"]', placement: 'left', Icon: Plus, route: '/',
    title: 'Novo acordo',
    body:  'Cadastre um novo acordo diretamente na lista. O Código é validado automaticamente para evitar duplicatas.',
  },
];

// Bookplay — métricas no Dashboard (/), filtros/tabela/novo no Acordos (/acordos)
const STEPS_BOOKPLAY: TourStep[] = [
  WELCOME,
  {
    target: '[data-tour="metricas"]', placement: 'bottom', Icon: BarChart3, route: '/',
    title: 'Métricas do dia',
    body:  'Resumo em tempo real: acordos de hoje, pagos, pendentes e vencidos — com os valores previstos e já recebidos.',
  },
  {
    target: '[data-tour="filtros"]', placement: 'bottom', Icon: Filter, route: '/acordos',
    title: 'Busca e filtros',
    body:  'Encontre acordos pelo NR, nome ou WhatsApp. Combine filtros de status, tipo de pagamento e data para resultados precisos.',
  },
  {
    target: '[data-tour="tabela-acordos"]', placement: 'top', Icon: FileText, route: '/acordos',
    spotMaxH: 140,
    scrollPx: 320,
    title: 'Tabela de acordos',
    body:  'Cada linha é um acordo. Use os botões de ação: marcar como pago, reagendar, editar ou excluir. Clique na linha para detalhes.',
  },
  {
    target: '[data-tour="novo-acordo"]', placement: 'left', Icon: Plus, route: '/acordos',
    title: 'Novo acordo',
    body:  'Cadastre um novo acordo diretamente na lista, sem sair da página.',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

interface SpotRect { x: number; y: number; w: number; h: number }

function measureTarget(selector: string, maxH?: number): SpotRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const h = maxH ? Math.min(r.height, maxH) : r.height;
  return {
    x: r.left  - PAD,
    y: r.top   - PAD,
    w: r.width  + PAD * 2,
    h: h        + PAD * 2,
  };
}

function useSpotRect(target: string | null, active: boolean, maxH?: number, scrollPx?: number): SpotRect | null {
  const [rect, setRect] = useState<SpotRect | null>(null);

  useEffect(() => {
    if (!active || !target) { setRect(null); return; }

    const update = () => setRect(measureTarget(target, maxH));
    const el = document.querySelector(target);
    if (!el) { setRect(null); return; }

    if (scrollPx !== undefined) {
      // Scroll customizado: posiciona o topo do elemento a `scrollPx` px do topo da viewport.
      // Necessário quando o elemento é muito alto e o spotlight mostra apenas o topo
      // (evita que o scrollIntoView role para o centro da lista).
      const absTop = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, absTop - scrollPx), behavior: 'smooth' });
    } else {
      // Scroll mínimo: só rola o suficiente para tornar o elemento visível
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Medição imediata (para elementos já visíveis)
    update();

    // Re-medição após o scroll terminar (~380 ms)
    const t = setTimeout(update, 380);

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('scroll', update, { passive: true });

    return () => {
      clearTimeout(t);
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
    };
  }, [target, active, maxH, scrollPx]);

  return rect;
}

function useViewport() {
  const [size, setSize] = useState(() => ({
    vw: typeof window !== 'undefined' ? window.innerWidth  : 1280,
    vh: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  useEffect(() => {
    const h = () => setSize({ vw: window.innerWidth, vh: window.innerHeight });
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return size;
}

function computeTooltipStyle(
  step: TourStep,
  spot: SpotRect | null,
  vw:   number,
  vh:   number,
): React.CSSProperties {
  const base: React.CSSProperties = {
    position:  'fixed',
    width:     TW,
    maxWidth:  'calc(100vw - 32px)',
    zIndex:    Z,
  };

  // Centro: posicionamento em px para não colidir com o transform do framer-motion
  if (step.placement === 'center' || !spot) {
    return {
      ...base,
      top:  Math.max(20, (vh - CARD_H) / 2),
      left: Math.max(16, (vw - TW) / 2),
    };
  }

  const cx = spot.x + spot.w / 2;

  if (step.placement === 'bottom') {
    return { ...base, top: spot.y + spot.h + GAP, left: clamp(cx - TW / 2, 16, vw - TW - 16) };
  }
  if (step.placement === 'top') {
    return { ...base, bottom: vh - spot.y + GAP, left: clamp(cx - TW / 2, 16, vw - TW - 16) };
  }
  if (step.placement === 'left') {
    return { ...base, top: clamp(spot.y + spot.h / 2 - 110, 16, vh - 260), left: clamp(spot.x - TW - GAP, 16, vw - TW - 16) };
  }
  // 'right'
  return { ...base, top: clamp(spot.y + spot.h / 2 - 110, 16, vh - 260), left: clamp(spot.x + spot.w + GAP, 16, vw - TW - 16) };
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function OnboardingTour() {
  const { user }  = useAuth();
  const tenant    = useTenant();
  const navigate  = useNavigate();
  const location       = useLocation();

  const [active, setActive]           = useState(false);
  const [stepIdx, setStepIdx]         = useState(0);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const { vw, vh } = useViewport();

  const isPP  = tenant.isPaguePlay;
  const STEPS = useMemo(() => (isPP ? STEPS_PP : STEPS_BOOKPLAY), [isPP]);

  // ── Inicialização ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    if (!localStorage.getItem(STORAGE_KEY(user.id))) {
      const t = setTimeout(() => setActive(true), 1000);
      return () => clearTimeout(t);
    }
  }, [user?.id]);

  // ── Finalizar tour ─────────────────────────────────────────────────────────
  const finish = useCallback(() => {
    setActive(false);
    setConfirmSkip(false);
    if (user?.id) localStorage.setItem(STORAGE_KEY(user.id), '1');
  }, [user?.id]);

  // ── Navegar para o passo com mudança de rota se necessário ────────────────
  const goToStep = useCallback((nextIdx: number) => {
    const nextStep = STEPS[nextIdx];
    setConfirmSkip(false);
    if (nextStep.route && location.pathname !== nextStep.route) {
      navigate(nextStep.route);
      // Aguarda a página renderizar antes de definir o índice
      setTimeout(() => setStepIdx(nextIdx), 350);
    } else {
      setStepIdx(nextIdx);
    }
  }, [STEPS, navigate, location.pathname]);

  const goNext = useCallback(() => {
    if (stepIdx >= STEPS.length - 1) { finish(); return; }
    goToStep(stepIdx + 1);
  }, [stepIdx, STEPS.length, finish, goToStep]);

  const goPrev = useCallback(() => {
    if (stepIdx > 0) goToStep(stepIdx - 1);
  }, [stepIdx, goToStep]);

  // ── Renderização ───────────────────────────────────────────────────────────
  const step       = STEPS[stepIdx];
  const spotRect   = useSpotRect(step.target, active, step.spotMaxH, step.scrollPx);
  const tooltipPos = computeTooltipStyle(step, spotRect, vw, vh);
  const isFirst    = stepIdx === 0;
  const isLast     = stepIdx === STEPS.length - 1;

  const confirmPos: React.CSSProperties = {
    position: 'fixed',
    top:      Math.max(20, (vh - 240) / 2),
    left:     Math.max(16, (vw - TW) / 2),
    width:    TW,
    zIndex:   Z,
  };

  if (!active) return null;

  return createPortal(
    // Wrapper: click fora → pede confirmação (não fecha direto)
    <div
      style={{ position: 'fixed', inset: 0, zIndex: Z - 1 }}
      onClick={() => { if (!confirmSkip) setConfirmSkip(true); }}
    >
      {/* ── Overlay visual (pointer-events: none) ── */}
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
                <rect x={0} y={0} width={vw} height={vh} fill="white" />
                <motion.rect
                  initial={false}
                  animate={{ x: spotRect.x, y: spotRect.y, width: spotRect.w, height: spotRect.h }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  rx={RX} ry={RX}
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              x={0} y={0} width={vw} height={vh}
              fill="rgba(0,0,0,0.62)"
              mask="url(#__onboarding_mask__)"
            />
            <motion.rect
              initial={false}
              animate={{ x: spotRect.x, y: spotRect.y, width: spotRect.w, height: spotRect.h }}
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

      {/* ── Dialog de confirmação (ao clicar fora) ── */}
      <AnimatePresence>
        {confirmSkip && (
          <motion.div
            key="confirm-skip"
            style={confirmPos}
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="h-[3px] bg-gradient-to-r from-warning/80 via-warning/50 to-transparent" />
            <div className="p-5 text-center">
              <div className="w-10 h-10 rounded-xl bg-warning/10 border border-warning/20 flex items-center justify-center text-warning mx-auto mb-3">
                <AlertTriangle className="w-[18px] h-[18px]" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Pular o tour?</h3>
              <p className="text-[12px] text-muted-foreground leading-relaxed mb-4">
                Você pode acessar o tour novamente pelo ícone{' '}
                <span className="font-semibold text-foreground">?</span> no cabeçalho.
              </p>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmSkip(false)}
                  className="text-xs h-8"
                >
                  Continuar tour
                </Button>
                <Button
                  size="sm"
                  onClick={finish}
                  className="text-xs h-8 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                >
                  Pular
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tooltip card do passo atual ── */}
      {!confirmSkip && (
        <AnimatePresence mode="wait">
          <motion.div
            key={stepIdx}
            style={tooltipPos}
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -5 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Barra de acento */}
            <div className="h-[3px] bg-gradient-to-r from-primary via-primary/70 to-transparent" />

            <div className="p-5">
              {/* Botão de fechar */}
              <button
                onClick={() => setConfirmSkip(true)}
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

              {/* Rodapé: progresso + botões */}
              <div className="flex items-center justify-between gap-2">
                {/* Pílulas de progresso */}
                <div className="flex items-center gap-1.5">
                  {STEPS.map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ width: i === stepIdx ? 20 : 6, opacity: i <= stepIdx ? 1 : 0.28 }}
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

              {/* Link pular (exceto último passo) */}
              {!isLast && (
                <button
                  onClick={() => setConfirmSkip(true)}
                  className="w-full text-center mt-3 text-[11px] text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors"
                >
                  Pular tour
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>,
    document.body,
  );
}
