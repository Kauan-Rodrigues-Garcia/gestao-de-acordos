import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getTodayISO } from '@/lib';
import { ligarMusicaVi } from './musica';
import { textoDoConvite } from './tema';
import './vi.css';

/** Quanto tempo a mensagem fica aberta antes de os botões aparecerem. */
export const ESPERA_DOS_BOTOES_MS = 5000;

/**
 * O convite do tema do GTA VI (Cleber, 16/11/2026). Em 18 e 19/11 o tema não liga
 * sozinho: aparece esta mensagem, FECHADA, já com a cara do jogo, num canto da
 * tela — sem o tema em volta, ela chama a atenção. Quem clica:
 *
 *   1. a mensagem abre e a música começa, bem baixinho, subindo (`musica.ts`);
 *   2. por 5 segundos só dá para ler e ouvir — os botões ainda não existem
 *      (nada de botão cinza com contagem: eles simplesmente entram depois,
 *      com uma animação), e Esc ou clique fora não fecham;
 *   3. «Ativar o tema»: o tema entra no lugar do Natal e a música continua,
 *      agora no botão do alto da tela. «Agora não»: a mensagem fecha e a
 *      música some aos poucos. Depois dos 5 s, Esc e clique fora valem «não».
 *
 * A resposta é gravada por quem monta (`escolherVi`), e aí o convite sai da
 * tela. Quem recusou liga depois no menu de temas.
 */
export function ConviteVi({ aoAtivar, aoRecusar, hoje }: { aoAtivar: () => void; aoRecusar: () => void; hoje?: string }) {
  const texto = textoDoConvite(hoje ?? getTodayISO());
  const [aberto, setAberto] = useState(false);
  const [botoes, setBotoes] = useState(false);
  const principal = useRef<HTMLButtonElement>(null);

  const abrir = () => {
    setAberto(true);
    // O clique que abre é o gesto que o navegador exige para tocar som.
    ligarMusicaVi(true);
  };
  const recusar = () => { ligarMusicaVi(false); aoRecusar(); };

  // Os botões entram 5 s depois de abrir. É o relógio que manda, não a
  // animação: no modo leve ela acaba na hora, e a espera continua igual.
  useEffect(() => {
    if (!aberto) return;
    const relogio = window.setTimeout(() => setBotoes(true), ESPERA_DOS_BOTOES_MS);
    return () => window.clearTimeout(relogio);
  }, [aberto]);

  useEffect(() => { if (botoes) principal.current?.focus(); }, [botoes]);

  useEffect(() => {
    if (!aberto || !botoes) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { ligarMusicaVi(false); aoRecusar(); } };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberto, botoes, aoRecusar]);

  if (!aberto) {
    return createPortal(
      <button type="button" className="vi-convite-fechado" onClick={abrir} aria-label="Novidade de hoje: clique para abrir">
        <span className="vi-convite-fechado-brilho" aria-hidden="true" />
        <img className="vi-convite-fechado-logo" src="/vi/logo-vi.webp" alt="" />
        <span className="vi-convite-fechado-texto">
          <span className="vi-convite-etiqueta">Novidade de hoje</span>
          <span className="vi-convite-fechado-titulo">Tem surpresa no sistema</span>
          <span className="vi-convite-fechado-dica">Clique para abrir</span>
        </span>
      </button>,
      document.body,
    );
  }

  return createPortal(
    <div className="vi-convite-veu" onClick={botoes ? recusar : undefined}>
      <div
        className="vi-convite"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vi-convite-titulo"
        onClick={e => e.stopPropagation()}
      >
        <div className="vi-convite-arte">
          <img src="/vi/arte-carro.webp" alt="" />
          <img className="vi-convite-logo" src="/vi/logo-gta-vi.webp" alt="Grand Theft Auto VI" />
          <span className="vi-convite-data" aria-hidden="true">19 · 11 · 2026</span>
        </div>
        <div className="vi-convite-corpo">
          <p className="vi-convite-etiqueta">Novidade de hoje</p>
          <h2 id="vi-convite-titulo" className="vi-convite-titulo">{texto.titulo}</h2>
          <p className="vi-convite-texto">
            {texto.abertura} as artes oficiais de Vice City no alto das páginas, luzes de neon e
            trilha sonora.
          </p>
          <p className="vi-convite-texto">
            Quer ativar? Dá para ligar ou desligar quando quiser no botão de temas, no alto da tela.
            {' '}{texto.fim}
          </p>
          <p className="vi-convite-musica">
            <span className="vi-musica-eq" aria-hidden="true"><span /><span /><span /></span>
            Love Is a Long Road · Tom Petty
          </p>
          {/* A altura dos botões já está reservada: a mensagem não pula quando eles entram. */}
          <div className="vi-convite-acoes">
            {botoes && (
              <>
                <button type="button" className="vi-convite-botao" onClick={recusar}>Agora não</button>
                <button ref={principal} type="button" className="vi-convite-botao vi-convite-principal" onClick={aoAtivar}>
                  Ativar o tema
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
