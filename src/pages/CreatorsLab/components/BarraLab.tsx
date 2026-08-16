/**
 * BarraLab — a barra fixa: trocar realidade, movimento, som, conquistas e sair.
 *
 * Fica embaixo e no centro porque é o polegar que alcança no celular, e porque
 * o topo já é do conteúdo.
 *
 * O botão de movimento precisa estar SEMPRE visível, não escondido num menu:
 * como o Lab decidiu não obedecer sozinho ao `prefers-reduced-motion` (ver
 * `theme/CreatorsProvider.tsx`), a saída de emergência tem que estar à mão de
 * quem precisa dela — um clique, sempre no mesmo lugar.
 */
import { useCreators } from '../theme/CreatorsProvider';
import { CONQUISTAS } from '../lib/conquistas';

export function BarraLab({
  aoSair, aoAbrirConquistas,
}: {
  aoSair: () => void;
  aoAbrirConquistas: () => void;
}) {
  const {
    tokens, tema, trocarTema, somLigado, alternarSom, desbloqueadas,
    movimentoReduzido, alternarMovimento,
  } = useCreators();
  const outro = tema === 'cyberpunk' ? 'arcade' : 'cyberpunk';

  return (
    <nav
      /* `--reto`: sem o chanfro do Cyberpunk. Um corte de 18 px numa barra
         desta altura comeria o canto dos botões das pontas. */
      className="creators-lab__painel creators-lab__painel--reto fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-1 px-2 py-1.5"
      aria-label="Controles do Creators Lab"
    >
      <button
        className="creators-lab__btn"
        onClick={() => trocarTema(outro)}
        aria-label={`Trocar para a realidade ${outro}`}
        title={`Trocar para ${outro}`}
      >
        {tema === 'cyberpunk' ? '🕹️' : '⚡'}
        <span className="ml-1.5 hidden sm:inline">{outro}</span>
      </button>

      <button
        className="creators-lab__btn"
        onClick={aoAbrirConquistas}
        aria-label={`Conquistas: ${desbloqueadas.size} de ${CONQUISTAS.length}`}
        title="Conquistas"
      >
        🏆<span className="ml-1.5 creators-lab__mono">{desbloqueadas.size}/{CONQUISTAS.length}</span>
      </button>

      <button
        className="creators-lab__btn"
        onClick={alternarMovimento}
        aria-label={movimentoReduzido ? 'Ligar animações' : 'Reduzir animações'}
        aria-pressed={movimentoReduzido}
        title={movimentoReduzido ? 'Animações reduzidas — clique para ligar' : 'Animações ligadas — clique para reduzir'}
      >
        {movimentoReduzido ? '◐' : '◉'}
      </button>

      <button
        className="creators-lab__btn"
        onClick={alternarSom}
        aria-label={somLigado ? 'Desligar som' : 'Ligar som'}
        aria-pressed={somLigado}
        title={somLigado ? 'Som ligado' : 'Som desligado'}
      >
        {somLigado ? '🔊' : '🔇'}
      </button>

      <button
        className="creators-lab__btn"
        onClick={aoSair}
        aria-label="Voltar ao Gestão de Acordos"
        title="Voltar ao Gestão"
        style={{ borderColor: tokens.cores.secundaria }}
      >
        ✕<span className="ml-1.5 hidden sm:inline">{tokens.vocab.voltar}</span>
      </button>
    </nav>
  );
}
