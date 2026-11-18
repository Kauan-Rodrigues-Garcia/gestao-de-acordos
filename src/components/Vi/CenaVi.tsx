import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { ninguemOlhando } from '@/lib/atencao';
import { EVENTO_ACORDO_SALVO } from '@/components/Natal/tema';
import { ARTES, EVENTO_MISSAO, TROCA_MS, indiceDaArte } from './tema';
import { ContagemVi } from './ContagemVi';
import './vi.css';

/*
 * As camadas do tema do GTA VI (18 e 19/11/2026), nos mesmos lugares das do Natal
 * (`Natal/CenaNatal.tsx`), em TODAS as abas:
 *
 *   FundoVi        — atrás do `<main>` transparente: a arte oficial no alto,
 *                    sumindo na cor do tema, trocando sozinha (carrossel).
 *                    O conteúdo rola por cima.
 *   FaixaVi        — dentro do `<main>`, antes da página: abre o espaço da
 *                    arte e leva o logo e, no canto de cima à direita, a data
 *                    em neon com a contagem até o lançamento embaixo. Rola junto.
 *   SobreposicaoVi — por cima do conteúdo: «Missão cumprida» ao salvar acordo.
 *
 * Tudo com `pointer-events: none`. Nenhuma camada lê nem grava dado.
 */

/**
 * O carrossel. Quem diz a arte é o relógio (`indiceDaArte`), então a troca cai
 * na mesma hora para todo mundo e não recomeça ao mudar de aba.
 *
 * A arte nova só entra depois de baixada — senão a anterior apagaria para um
 * buraco. Na tela ficam no máximo duas imagens, e só durante a troca: a de
 * agora, que entra por cima, e a anterior, que sai quando a entrada acaba. Com ninguém
 * olhando (`lib/atencao.ts`) nada é baixado nem trocado.
 */
/** A duração de `vi-arte-entra` (`vi.css`). */
const ENTRADA_MS = 1600;

export function FundoVi() {
  const [par, setPar] = useState(() => ({ atual: indiceDaArte(), anterior: null as number | null }));

  useEffect(() => {
    let vivo = true;
    let relogio = 0;
    // Um tico depois da virada, para o relógio já apontar a arte seguinte.
    const agendar = () => { relogio = window.setTimeout(trocar, TROCA_MS - (Date.now() % TROCA_MS) + 60); };
    const trocar = () => {
      if (!vivo) return;
      if (ninguemOlhando()) { agendar(); return; }
      const proximo = indiceDaArte();
      const imagem = new Image();
      imagem.onload = () => {
        if (!vivo) return;
        setPar(p => (p.atual === proximo ? p : { atual: proximo, anterior: p.atual }));
        agendar();
      };
      // Não baixou: fica a que está, e tenta de novo na próxima virada.
      imagem.onerror = () => { if (vivo) agendar(); };
      imagem.src = ARTES[proximo].src;
    };
    agendar();
    return () => { vivo = false; window.clearTimeout(relogio); };
  }, []);

  // Terminada a entrada, a anterior sai da tela: fica uma imagem só na memória.
  useEffect(() => {
    if (par.anterior === null) return;
    const tirar = window.setTimeout(() => setPar(p => ({ ...p, anterior: null })), ENTRADA_MS + 300);
    return () => window.clearTimeout(tirar);
  }, [par.anterior, par.atual]);

  // A chave é a arte: a que era «atual» vira «anterior» sem ser montada de novo.
  const camadas = par.anterior === null ? [par.atual] : [par.anterior, par.atual];
  return (
    <div className="vi-fundo" aria-hidden="true">
      <div className="vi-fundo-artes">
        {camadas.map(i => (
          <img
            key={i}
            className={cn('vi-fundo-arte', i === par.atual && 'vi-fundo-entra')}
            src={ARTES[i].src}
            alt=""
            decoding="async"
            style={{ objectPosition: ARTES[i].foco }}
          />
        ))}
      </div>
    </div>
  );
}

export function FaixaVi({ lancamento }: { lancamento?: number }) {
  return (
    <div className="vi-faixa">
      <img className="vi-faixa-logo" src="/vi/logo-gta-vi.webp" alt="" decoding="async" />
      <div className="vi-faixa-canto">
        <p className="vi-faixa-data" aria-hidden="true">19 · 11 · 2026</p>
        <ContagemVi lancamento={lancamento} />
      </div>
    </div>
  );
}

/** Quanto a faixa fica na tela, e quanto antes do fim ela começa a apagar. */
const MISSAO_MS = 2600;
const SAIDA_MS = 450;

/**
 * «Missão cumprida», a cada acordo salvo (o aviso é o mesmo que a festa do
 * Natal escuta: `avisarAcordoSalvo`). Quem tira a faixa é o relógio, não o fim
 * da animação — no modo leve a animação acaba na hora e a faixa continua lá
 * pelo mesmo tempo.
 */
export function SobreposicaoVi() {
  // `vez` muda a cada acordo: a faixa nasce de novo e a entrada toca outra vez.
  const [vez, setVez] = useState(0);
  const [fase, setFase] = useState<'fora' | 'dentro' | 'saindo'>('fora');

  useEffect(() => {
    const mostrar = () => { setVez(v => v + 1); setFase('dentro'); };
    window.addEventListener(EVENTO_ACORDO_SALVO, mostrar);
    window.addEventListener(EVENTO_MISSAO, mostrar);
    return () => {
      window.removeEventListener(EVENTO_ACORDO_SALVO, mostrar);
      window.removeEventListener(EVENTO_MISSAO, mostrar);
    };
  }, []);

  useEffect(() => {
    if (vez === 0) return;
    const apagar = window.setTimeout(() => setFase('saindo'), MISSAO_MS - SAIDA_MS);
    const tirar = window.setTimeout(() => setFase('fora'), MISSAO_MS);
    return () => { window.clearTimeout(apagar); window.clearTimeout(tirar); };
  }, [vez]);

  return (
    <div className="vi-sobre" aria-hidden="true">
      {fase !== 'fora' && (
        <div key={vez} className={cn('vi-missao', fase === 'saindo' && 'vi-saindo')}>
          <p className="vi-missao-titulo">Missão cumprida</p>
          <p className="vi-missao-sub">Acordo salvo · <b>Respeito +</b></p>
        </div>
      )}
    </div>
  );
}
