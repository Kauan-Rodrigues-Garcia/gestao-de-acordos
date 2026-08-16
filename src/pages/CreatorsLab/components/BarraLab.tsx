/**
 * BarraLab — a barra fixa: trocar realidade, som, conquistas e sair.
 *
 * Fica embaixo e no centro porque é o polegar que alcança no celular, e porque
 * o topo já é do conteúdo.
 */
import { useCreators } from '../theme/CreatorsProvider';
import { CONQUISTAS } from '../lib/conquistas';

export function BarraLab({
  aoSair, aoAbrirConquistas,
}: {
  aoSair: () => void;
  aoAbrirConquistas: () => void;
  /** Aceito para compatibilidade de chamada; a contagem sai do provider. */
  totalConquistas?: number;
}) {
  const { tokens, tema, trocarTema, somLigado, alternarSom, desbloqueadas } = useCreators();
  const outro = tema === 'cyberpunk' ? 'arcade' : 'cyberpunk';

  return (
    <nav
      className="creators-lab__painel fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-1 px-2 py-1.5"
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
