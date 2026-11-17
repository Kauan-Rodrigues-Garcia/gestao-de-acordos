/**
 * BarraTarefas — o menu de programas, as janelas abertas, a bandeja e o relógio.
 * ─────────────────────────────────────────────────────────────────────────────
 * A mesma barra nos três sistemas: em cima como HUD, embaixo como painel de
 * controle, embaixo com botão Iniciar. A posição e o desenho vêm de tokens
 * (`barra.posicao`, `barra.estilo`), lidos pelo CSS; o DOM é um só.
 *
 * ## O botão de movimento fica SEMPRE à vista
 *
 * Não vai para dentro de Configurações (lá também tem, mas não só lá). O Lab
 * decidiu não obedecer sozinho ao `prefers-reduced-motion` — ver
 * `theme/CreatorsProvider.tsx` —, então a saída de emergência tem que estar à
 * mão de quem precisa dela: um clique, sempre no mesmo lugar, inclusive no
 * celular.
 */
import { useEffect, useRef, useState } from 'react';
import type { EstadoJanelas } from '../lib/janelas';
import { CONQUISTAS } from '../lib/conquistas';
import { useCreators } from '../theme/CreatorsProvider';
import type { IdPrograma } from '../theme/themes';
import { Icone } from './Icone';
import { PROGRAMAS, programa } from './programas';

/** O relógio da barra. Um `setInterval` de segundo em segundo, e só ele re-renderiza. */
function Relogio({ segundos }: { segundos: boolean }) {
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    // Sem segundos na tela, meio minuto de folga é mais que o bastante.
    const t = setInterval(() => setAgora(new Date()), segundos ? 1000 : 15000);
    return () => clearInterval(t);
  }, [segundos]);

  const texto = agora.toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', ...(segundos ? { second: '2-digit' } : {}),
  });

  return (
    <time className="creators-lab__relogio" dateTime={agora.toISOString()}>
      {texto}
    </time>
  );
}

export function BarraTarefas({
  estado, aoAbrir, aoAlternar,
}: {
  estado: EstadoJanelas;
  aoAbrir: (id: IdPrograma) => void;
  /** Clique no botão de uma janela aberta: foca, ou minimiza se já é a do foco. */
  aoAlternar: (id: string) => void;
}) {
  const { tokens, desbloqueadas, movimentoReduzido, alternarMovimento } = useCreators();
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const botaoRef = useRef<HTMLButtonElement | null>(null);
  const nomes = tokens.vocab.programas;

  // Clique fora e Esc fecham o menu. Só ouve enquanto ele está aberto.
  useEffect(() => {
    if (!menuAberto) return;

    const aoApertar = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (menuRef.current?.contains(alvo) || botaoRef.current?.contains(alvo)) return;
      setMenuAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuAberto(false); botaoRef.current?.focus(); }
    };

    document.addEventListener('pointerdown', aoApertar);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('pointerdown', aoApertar);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [menuAberto]);

  const escolher = (id: IdPrograma) => { setMenuAberto(false); aoAbrir(id); };

  /*
   * As janelas aparecem na barra na ordem em que foram ABERTAS, não na de
   * empilhamento: senão os botões trocariam de lugar a cada clique. A lista de
   * programas instalados tem ordem fixa, então serve de régua.
   */
  const abertas = PROGRAMAS.filter(p => estado.janelas.some(j => j.id === p.id));

  return (
    <>
      {menuAberto && (
        <div ref={menuRef} className="creators-lab__menu" role="menu" aria-label={tokens.vocab.sistema}>
          {PROGRAMAS.filter(p => p.id !== 'desligar').map(p => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              className="creators-lab__menu-item"
              onClick={() => escolher(p.id)}
            >
              <Icone id={p.icone} />
              {nomes[p.id]}
            </button>
          ))}
          <div className="creators-lab__menu-separador" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="creators-lab__menu-item"
            onClick={() => escolher('desligar')}
          >
            <Icone id="desligar" />
            {nomes.desligar}
          </button>
        </div>
      )}

      <nav className="creators-lab__barra-tarefas" aria-label="Barra de tarefas">
        <button
          ref={botaoRef}
          type="button"
          className="creators-lab__barra-botao creators-lab__barra-botao--iniciar"
          onClick={() => setMenuAberto(v => !v)}
          aria-haspopup="menu"
          aria-expanded={menuAberto}
        >
          {tokens.vocab.iniciar}
        </button>

        <div className="creators-lab__barra-janelas">
          {abertas.map(p => {
            const j = estado.janelas.find(x => x.id === p.id)!;
            return (
              <button
                key={p.id}
                type="button"
                className="creators-lab__barra-botao"
                data-ativo={estado.foco === p.id}
                onClick={() => aoAlternar(p.id)}
                title={nomes[p.id]}
                aria-pressed={estado.foco === p.id}
                style={{ opacity: j.minimizada ? 0.6 : 1 }}
              >
                <Icone id={programa(p.id)!.icone} />
                <span>{nomes[p.id]}</span>
              </button>
            );
          })}
        </div>

        <div className="creators-lab__barra-bandeja">
          <button
            type="button"
            className="creators-lab__barra-botao"
            onClick={() => aoAbrir('conquistas')}
            aria-label={`${nomes.conquistas}: ${desbloqueadas.size} de ${CONQUISTAS.length}`}
            title={nomes.conquistas}
          >
            <Icone id="conquistas" />
            <span className="creators-lab__mono">{desbloqueadas.size}/{CONQUISTAS.length}</span>
          </button>

          <button
            type="button"
            className="creators-lab__barra-botao"
            onClick={alternarMovimento}
            aria-label={movimentoReduzido ? 'Ligar animações' : 'Reduzir animações'}
            aria-pressed={movimentoReduzido}
            title={movimentoReduzido
              ? 'Animações reduzidas — clique para ligar'
              : 'Animações ligadas — clique para reduzir'}
          >
            {movimentoReduzido ? '◐' : '◉'}
          </button>

          <Relogio segundos={tokens.barra.segundos} />
        </div>
      </nav>
    </>
  );
}
