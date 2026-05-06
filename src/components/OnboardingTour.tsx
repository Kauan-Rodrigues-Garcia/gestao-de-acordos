/**
 * OnboardingTour.tsx
 * Tour de 5 passos exibido apenas no primeiro login.
 * Controlado por localStorage: key = `onboarding_v1_${userId}`.
 * Usa react-joyride com tema personalizado alinhado ao design system.
 */
import { useState, useEffect, useCallback } from 'react';
import Joyride, { type CallBackProps, type Step, STATUS, EVENTS } from 'react-joyride';
import { useAuth } from '@/hooks/useAuth';

const STORAGE_KEY = (uid: string) => `onboarding_v1_${uid}`;

const STEPS: Step[] = [
  {
    target: 'body',
    placement: 'center',
    disableBeacon: true,
    content: (
      <div className="text-center py-2">
        <div className="text-4xl mb-3">👋</div>
        <h3 className="text-base font-bold mb-2">Bem-vindo ao sistema!</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Vamos fazer um tour rápido pelas principais funcionalidades. Leva menos de 1 minuto.
        </p>
      </div>
    ),
  },
  {
    target: '[data-tour="metricas"]',
    placement: 'bottom',
    disableBeacon: true,
    content: (
      <div>
        <h3 className="text-sm font-bold mb-1.5">📊 Métricas do dia</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Aqui você vê um resumo em tempo real: acordos de hoje, quantos foram pagos, pendentes e vencidos — com os valores previstos e já recebidos.
        </p>
      </div>
    ),
  },
  {
    target: '[data-tour="filtros"]',
    placement: 'bottom',
    disableBeacon: true,
    content: (
      <div>
        <h3 className="text-sm font-bold mb-1.5">🔍 Busca e filtros</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Encontre acordos pelo Código, nome ou CPF do cliente. Combine com filtros de status, tipo de pagamento e data para resultados precisos.
        </p>
      </div>
    ),
  },
  {
    target: '[data-tour="tabela-acordos"]',
    placement: 'top',
    disableBeacon: true,
    content: (
      <div>
        <h3 className="text-sm font-bold mb-1.5">📋 Tabela de acordos</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Cada linha é um acordo. Use os botões de ação à direita: ✓ para marcar como pago, 📅 para reagendar, ✏️ para editar e 🗑️ para excluir. Clique na linha para ver os detalhes completos.
        </p>
      </div>
    ),
  },
  {
    target: '[data-tour="novo-acordo"]',
    placement: 'left',
    disableBeacon: true,
    content: (
      <div>
        <h3 className="text-sm font-bold mb-1.5">➕ Novo acordo</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Clique aqui para cadastrar um novo acordo diretamente na lista, sem sair da página. O sistema valida automaticamente o Código para evitar duplicidades.
        </p>
      </div>
    ),
  },
];

const joyrideStyles = {
  options: {
    primaryColor: 'hsl(var(--primary))',
    backgroundColor: 'hsl(var(--card))',
    textColor: 'hsl(var(--foreground))',
    overlayColor: 'rgba(0,0,0,0.55)',
    arrowColor: 'hsl(var(--card))',
    zIndex: 9999,
  },
  tooltip: {
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
    border: '1px solid hsl(var(--border))',
    minWidth: '280px',
    maxWidth: '340px',
  },
  tooltipTitle: { display: 'none' },
  buttonNext: {
    backgroundColor: 'hsl(var(--primary))',
    color: 'hsl(var(--primary-foreground))',
    borderRadius: '8px',
    fontSize: '12px',
    padding: '8px 16px',
    fontWeight: 600,
  },
  buttonBack: {
    color: 'hsl(var(--muted-foreground))',
    fontSize: '12px',
    marginRight: '8px',
  },
  buttonSkip: {
    color: 'hsl(var(--muted-foreground))',
    fontSize: '11px',
  },
  buttonClose: {
    color: 'hsl(var(--muted-foreground))',
    width: '20px',
    height: '20px',
  },
  beacon: { display: 'none' },
};

export function OnboardingTour() {
  const { user } = useAuth();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    const jaViu = localStorage.getItem(STORAGE_KEY(user.id));
    if (!jaViu) {
      // Delay para aguardar a página carregar completamente
      const t = setTimeout(() => setRun(true), 1200);
      return () => clearTimeout(t);
    }
  }, [user?.id]);

  const handleJoyrideCallback = useCallback(
    (data: CallBackProps) => {
      const { status, type, index } = data;

      if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
        setStepIndex(index + (data.action === 'prev' ? -1 : 1));
      }

      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        setRun(false);
        if (user?.id) {
          localStorage.setItem(STORAGE_KEY(user.id), '1');
        }
      }
    },
    [user?.id]
  );

  if (!run) return null;

  return (
    <Joyride
      steps={STEPS}
      run={run}
      stepIndex={stepIndex}
      continuous
      showSkipButton
      showProgress
      scrollToFirstStep
      disableOverlayClose
      locale={{
        back: 'Voltar',
        close: 'Fechar',
        last: 'Concluir',
        next: 'Próximo',
        open: 'Abrir',
        skip: 'Pular tour',
      }}
      styles={joyrideStyles}
      callback={handleJoyrideCallback}
    />
  );
}
