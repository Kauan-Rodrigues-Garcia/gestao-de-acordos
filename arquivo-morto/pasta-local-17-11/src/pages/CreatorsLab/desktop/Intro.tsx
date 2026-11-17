/**
 * Intro — o computador fictício ligando.
 * ─────────────────────────────────────────────────────────────────────────────
 * Vem logo depois do escurecimento do Gestão, que termina em preto. Esta tela
 * é preta do primeiro ao último quadro, e é isso que deixa a emenda invisível:
 * a pessoa não vê uma página trocar, vê uma máquina acender.
 *
 * QUAL sequência roda não é decidido aqui: é `lib/intro.ts`, função pura e
 * testada nas quatro combinações (primeira visita ou repetida, movimento
 * completo ou reduzido). Este arquivo só desenha o passo da vez e anda o
 * relógio.
 *
 *   primeira visita → preto, autoteste, escolha do sistema, marca, entrada
 *   visita repetida → preto, marca, entrada — poucos segundos, e dá para pular
 *   reduzido        → um cartão parado (com a escolha antes, se for a primeira)
 *
 * ## O roteiro é fixado na montagem
 *
 * `primeiraVisita` e `movimentoReduzido` são lidos uma vez. Se o roteiro fosse
 * recalculado a cada render, escolher a aparência (que muda o tema) trocaria a
 * sequência no meio dela.
 *
 * ## Pular
 *
 * Clique, Esc, Enter ou espaço. Na primeira visita, pular leva ATÉ a escolha
 * do sistema, nunca através dela — a escolha não tem resposta padrão.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  PASSO_LINHA_MS, aoPular, proximoPasso, roteiroDaIntro,
} from '../lib/intro';
import { useCreators } from '../theme/CreatorsProvider';
import type { TemaCreators } from '../theme/themes';
import { EscolhaAparencia } from './EscolhaAparencia';

/**
 * O autoteste da primeira visita.
 *
 * É neutro de propósito: nesse ponto ninguém escolheu sistema ainda, então a
 * máquina não pode se apresentar com a marca de um deles. Ele termina como um
 * gerenciador de inicialização terminaria — avisando que há três sistemas e
 * nenhum padrão —, e a tela seguinte é a escolha.
 */
const AUTOTESTE_NEUTRO = [
  'AUTOTESTE DE INICIALIZACAO',
  'processador ........................ ok',
  'memoria ............................ ok',
  'disco .............................. ok',
  'sistemas instalados ................ 3',
  'sistema padrao ..................... nenhum',
];

/** Quanto tempo a tela leva para sumir e mostrar a área de trabalho. */
const SAIDA_MS = 450;

function iniciais(nome: string): string {
  return nome.trim().split(/\s+/).slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase() || '?';
}

export function Intro({
  aoRevelar, aoTerminar,
}: {
  /** A área de trabalho já pode ser montada por baixo. */
  aoRevelar: () => void;
  /** A inicialização acabou e pode ser desmontada. */
  aoTerminar: () => void;
}) {
  const { tokens, tema, trocarTema, temaJaEscolhido, movimentoReduzido } = useCreators();
  const { perfil } = useAuth();

  const [roteiro] = useState(() => roteiroDaIntro({
    primeiraVisita: !temaJaEscolhido,
    movimentoReduzido,
    linhasAutoteste: AUTOTESTE_NEUTRO.length,
  }));
  const [indice, setIndice] = useState(0);
  const [linhas, setLinhas] = useState(0);
  const [saindo, setSaindo] = useState(false);
  /** Na primeira visita, o tema só conta como escolhido depois do clique. */
  const [escolhido, setEscolhido] = useState<TemaCreators | null>(temaJaEscolhido ? tema : null);

  const passo = roteiro[indice];
  const etapa = passo.etapa;

  const revelarRef = useRef(aoRevelar);
  const terminarRef = useRef(aoTerminar);
  revelarRef.current = aoRevelar;
  terminarRef.current = aoTerminar;

  // Trava em ref, não em estado: clique e relógio podem chegar no mesmo
  // instante, e a área de trabalho só pode ser revelada uma vez.
  const encerrouRef = useRef(false);
  const encerrar = useCallback(() => {
    if (encerrouRef.current) return;
    encerrouRef.current = true;
    setSaindo(true);
    revelarRef.current();
    // Com movimento reduzido não há o que esperar sumir.
    window.setTimeout(() => terminarRef.current(), movimentoReduzido ? 0 : SAIDA_MS);
  }, [movimentoReduzido]);

  const irPara = useCallback((proximo: number | null) => {
    if (proximo === null) encerrar();
    else setIndice(proximo);
  }, [encerrar]);

  // O relógio do passo. Passo que espera a pessoa não arma nada.
  useEffect(() => {
    if (saindo || passo.duracaoMs === null) return;
    const t = setTimeout(() => irPara(proximoPasso(roteiro, indice)), passo.duracaoMs);
    return () => clearTimeout(t);
  }, [indice, passo, roteiro, irPara, saindo]);

  // As linhas do autoteste, uma de cada vez.
  useEffect(() => {
    if (etapa !== 'autoteste' || linhas >= AUTOTESTE_NEUTRO.length) return;
    const t = setTimeout(() => setLinhas(l => l + 1), PASSO_LINHA_MS);
    return () => clearTimeout(t);
  }, [etapa, linhas]);

  const pular = useCallback(() => irPara(aoPular(roteiro, indice)), [irPara, roteiro, indice]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter' && e.key !== ' ') return;
      // Na escolha, Enter e espaço são do cartão em foco, não do "pular".
      if (etapa === 'aparencia') return;
      e.preventDefault();
      pular();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [pular, etapa]);

  const escolher = useCallback((id: TemaCreators) => {
    trocarTema(id);
    setEscolhido(id);
    irPara(proximoPasso(roteiro, indice));
  }, [trocarTema, irPara, roteiro, indice]);

  const nome = perfil?.nome?.trim() || 'visitante';
  const foto = perfil?.foto_url ?? null;
  const esperaPessoa = passo.duracaoMs === null;

  const retrato = foto
    ? <img className="creators-lab__entrada-foto" src={foto} alt="" />
    : <span className="creators-lab__entrada-foto" aria-hidden="true">{iniciais(nome)}</span>;

  return (
    <div
      className={`creators-lab__intro${saindo ? ' creators-lab__intro-sai' : ''}`}
      data-estilo={tokens.intro.estilo}
      data-agitado={passo.agitado && etapa === 'marca'}
      data-etapa={etapa}
      onClick={esperaPessoa ? undefined : pular}
      role="status"
      aria-live="polite"
    >
      {etapa === 'autoteste' && (
        <div className="creators-lab__intro-autoteste">
          {AUTOTESTE_NEUTRO.slice(0, linhas).map((l, i) => <p key={i}>{l}</p>)}
          <p><span className="creators-lab__intro-cursor" /></p>
        </div>
      )}

      {etapa === 'aparencia' && (
        <>
          <div style={{ textAlign: 'center' }}>
            <p className="creators-lab__intro-lema">nenhum sistema padrão definido</p>
            <h1
              style={{
                marginTop: '.6rem',
                fontFamily: 'ui-monospace, Consolas, monospace',
                fontSize: 'clamp(1.1rem, 4.5vw, 1.8rem)',
                color: '#fff',
              }}
            >
              Escolha o sistema para iniciar
            </h1>
            <p className="creators-lab__intro-lema" style={{ marginTop: '.5rem', letterSpacing: '.08em', textTransform: 'none' }}>
              mesmos programas, três aparências — dá para trocar depois, em Configurações
            </p>
          </div>
          <EscolhaAparencia atual={escolhido} aoEscolher={escolher} />
        </>
      )}

      {etapa === 'marca' && (
        <>
          <h1 className="creators-lab__intro-marca">{tokens.intro.marca}</h1>
          <p className="creators-lab__intro-lema">{tokens.intro.lema}</p>
          <div
            className="creators-lab__intro-progresso"
            style={{ '--creator-progresso-ms': `${Math.max((passo.duracaoMs ?? 1200) - 250, 300)}ms` } as React.CSSProperties}
          >
            <span />
          </div>
          <div className="creators-lab__intro-autoteste" style={{ opacity: .45, textAlign: 'center' }}>
            <p>{tokens.intro.autoteste[tokens.intro.autoteste.length - 1]}</p>
          </div>
        </>
      )}

      {etapa === 'entrada' && (
        <div className="creators-lab__entrada">
          <p className="creators-lab__intro-lema">{tokens.intro.boasVindas}</p>
          {retrato}
          <p className="creators-lab__entrada-nome">{nome}</p>
          <button
            type="button"
            className="creators-lab__btn"
            onClick={e => { e.stopPropagation(); encerrar(); }}
            autoFocus
          >
            {tokens.intro.entrar}
          </button>
        </div>
      )}

      {etapa === 'passagem' && (
        // Movimento reduzido: um cartão parado, sem nada que pisque ou varra.
        <div className="creators-lab__entrada" style={{ animation: 'none' }}>
          <h1 className="creators-lab__intro-marca" style={{ animation: 'none', textShadow: 'none' }}>
            {tokens.intro.marca}
          </h1>
          {retrato}
          <p className="creators-lab__entrada-nome">{nome}</p>
          <button
            type="button"
            className="creators-lab__btn"
            onClick={e => { e.stopPropagation(); encerrar(); }}
            autoFocus
          >
            {tokens.intro.entrar}
          </button>
        </div>
      )}

      {!esperaPessoa && !saindo && (
        <p className="creators-lab__intro-pular">clique, Esc ou espaço para pular</p>
      )}
    </div>
  );
}
