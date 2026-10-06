/**
 * SugestaoModoLeve — percebe a máquina travando e oferece o modo leve.
 *
 * Quem mede é o navegador: `PerformanceObserver` avisa cada quadro longo
 * (`long-animation-frame`, ou `longtask` no Chrome antigo) sem nenhum laço
 * nosso rodando — vigiar a tela com `requestAnimationFrame` seria gastar
 * processador justamente em quem já está sem. Navegador sem nenhum dos dois
 * (Firefox, Safari) simplesmente não oferece; o modo continua no menu de temas.
 *
 * Aba escondida não conta: o navegador segura a aba de fundo, e o que trava ali
 * não é a pessoa usando o sistema.
 *
 * A regra de quando oferecer mora em `lib/modoLeve.ts` (`deveSugerir`), testada
 * à parte. Oferece uma vez por carga de página; «Agora não» cala por 7 dias.
 */
import { useEffect } from 'react';
import { ehCelular } from '@/lib/mobile/preferencia';
import { useNaRotaDoCelular } from '@/lib/mobile/rota';
import { toast } from 'sonner';
import {
  definirModoLeve, deveSugerir, JANELA_MS, podeSugerir, recusarSugestao, useModoLeve,
  type DicasDaMaquina, type Travada,
} from '@/lib/modoLeve';

/** Espera depois de abrir a página: a primeira carga sempre trava um pouco. */
const CARENCIA_MS = 45_000;

function dicasDaMaquina(): DicasDaMaquina {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    nucleos: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined,
    memoriaGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
  };
}

export function SugestaoModoLeve(): null {
  const leve = useModoLeve();
  // Nunca no celular (Cleber, 06/10/2026): nem no app, nem no site aberto no
  // celular. O aviso fala de «computador», e o app já é a versão leve.
  const naRotaDoApp = useNaRotaDoCelular();

  useEffect(() => {
    if (naRotaDoApp || ehCelular()) return;
    if (leve || !podeSugerir()) return;
    if (typeof PerformanceObserver === 'undefined') return;
    // `long-animation-frame` (Chrome 123+) mede o quadro INTEIRO — script,
    // estilo, layout e pintura —, que é onde enfeite pesa em máquina fraca.
    // `longtask` só vê script, e fica de reserva para navegador mais antigo.
    const tipos = PerformanceObserver.supportedEntryTypes ?? [];
    const tipo = tipos.includes('long-animation-frame') ? 'long-animation-frame'
      : tipos.includes('longtask') ? 'longtask' : null;
    if (!tipo) return;

    const inicio = performance.now();
    const dicas = dicasDaMaquina();
    let travadas: Travada[] = [];
    let ofereceu = false;

    const oferecer = () => {
      ofereceu = true;
      observador.disconnect();
      toast('Seu computador parece estar com dificuldade nesta tela', {
        description: 'O modo leve desliga animações e enfeites para o sistema ficar mais rápido. Os números não mudam, e você desliga quando quiser no menu de temas.',
        duration: 30_000,
        action: { label: 'Ativar modo leve', onClick: () => definirModoLeve(true) },
        cancel: { label: 'Agora não', onClick: () => recusarSugestao() },
      });
    };

    const observador: PerformanceObserver = new PerformanceObserver(lista => {
      if (ofereceu || document.visibilityState !== 'visible') return;
      const agora = performance.now();
      for (const e of lista.getEntries()) travadas.push({ fim: e.startTime + e.duration, duracao: e.duration });
      travadas = travadas.filter(t => agora - t.fim <= JANELA_MS);
      if (agora - inicio < CARENCIA_MS) return;
      if (deveSugerir(travadas, agora, dicas) && podeSugerir()) oferecer();
    });
    try {
      observador.observe({ type: tipo, buffered: false });
    } catch {
      return;
    }
    return () => observador.disconnect();
  }, [leve, naRotaDoApp]);

  return null;
}

export default SugestaoModoLeve;
