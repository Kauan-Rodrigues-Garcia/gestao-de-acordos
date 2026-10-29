/**
 * SireneOverlay — a sirene tocando: a luz girando no alto da tela, as bordas
 * piscando na cor e o som.
 *
 * Montado no `Layout`, fora das rotas, como o jumpscare. Marca o timer pela
 * hora do banco para o próximo horário do MEU setor e para o toque solto
 * («Tocar agora»); na hora, toca sem perguntar nada ao servidor.
 *
 *   - cada toque (`chave`) toca uma vez por aba;
 *   - com várias abas abertas, a luz aparece em todas e o SOM em uma só
 *     (a primeira que marcar a chave no `localStorage`);
 *   - nunca presa: some pelo timer da duração, por um vigia com o teto de
 *     60 s, e no «Silenciar». A camada não pega clique, só o botão.
 *
 * ## Leve de desenhar (29/10/2026)
 *
 * A primeira versão girava fachos do tamanho da tela misturados com o fundo
 * (`mix-blend-mode`) e piscava as bordas com sombra borrada: em computador sem
 * placa de vídeo o processador não dava conta e a luz ficava PARADA. Agora o
 * giro é a luz dentro da cúpula (pequena), e as bordas piscam trocando a
 * opacidade de duas camadas — o que o navegador faz sem redesenhar. Os fachos
 * grandes só aparecem em máquina com placa de vídeo e fora do modo leve; no
 * modo leve a sirene continua girando e piscando (ver `sirene.css`).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useEmpresa } from '@/hooks/useEmpresa';
import { DURACAO_MAX_S, TOLERANCIA_MS, corDaSirene, proximoToque, type CorDaSirene } from './horario';
import { agoraDoServidor, ouvirTeste, useMinhaSirene } from './sirene';
import { destravarNoPrimeiroGesto, tocarSom } from './som';
import { semPlacaDeVideo } from '@/components/Halloween/aguenta';
import './sirene.css';

/** O maior atraso que o `setTimeout` aceita (~24,8 dias). */
const TIMER_MAX_MS = 2_147_483_000;
const CHAVE_SOM = 'sirene:som:';

interface NaTela { chave: string; cor: CorDaSirene; duracaoMs: number; texto: string | null; volume: number }

/** Esta aba fica com o som deste toque? A primeira a marcar fica. */
function ficarComOSom(chave: string): boolean {
  try {
    const k = CHAVE_SOM + chave;
    if (localStorage.getItem(k)) return false;
    localStorage.setItem(k, String(Date.now()));
    // Limpa as marcas velhas (mais de um dia).
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const outra = localStorage.key(i);
      if (outra?.startsWith(CHAVE_SOM) && Date.now() - Number(localStorage.getItem(outra)) > 86_400_000) {
        localStorage.removeItem(outra);
      }
    }
    return true;
  } catch {
    return true;
  }
}

export function SireneOverlay() {
  const { empresa } = useEmpresa();
  const { agendamentos, toque } = useMinhaSirene(empresa?.id);
  const [naTela, setNaTela] = useState<NaTela | null>(null);
  const [saindo, setSaindo] = useState(false);
  /** O que já tocou nesta aba. */
  const tocados = useRef(new Set<string>());
  /** Depois de tocar um horário, recalcula o próximo. */
  const [rodada, setRodada] = useState(0);
  const pararSom = useRef<() => void>(() => undefined);

  useEffect(() => { destravarNoPrimeiroGesto(); }, []);

  function tocar(t: NaTela, comSom: boolean) {
    pararSom.current();
    pararSom.current = comSom ? tocarSom(t.duracaoMs, t.volume) : () => undefined;
    setSaindo(false);
    setNaTela(t);
  }

  // ── Os horários do meu setor ──
  useEffect(() => {
    const prox = proximoToque(agendamentos, agoraDoServidor(), tocados.current);
    if (!prox) return;
    const falta = prox.quando - agoraDoServidor();
    if (falta > TIMER_MAX_MS) return;
    const id = setTimeout(() => {
      const atraso = agoraDoServidor() - prox.quando;
      tocados.current.add(prox.chave);
      if (atraso <= TOLERANCIA_MS) {
        tocar({ chave: prox.chave, cor: prox.cor, duracaoMs: prox.duracaoMs, texto: prox.descricao, volume: prox.volume }, ficarComOSom(prox.chave));
      }
      setRodada(r => r + 1);
    }, Math.max(0, falta));
    return () => clearTimeout(id);
  }, [agendamentos, rodada]);

  // ── O toque solto («Tocar agora») ──
  useEffect(() => {
    if (!toque || tocados.current.has(toque.id)) return;
    const falta = toque.tocaEm - agoraDoServidor();
    if (falta < -TOLERANCIA_MS) return;
    const id = setTimeout(() => {
      tocados.current.add(toque.id);
      tocar({ chave: toque.id, cor: toque.cor, duracaoMs: toque.duracaoMs, texto: null, volume: toque.volume }, ficarComOSom(toque.id));
    }, Math.max(0, falta));
    return () => clearTimeout(id);
  }, [toque]);

  // ── O teste: só nesta aba ──
  useEffect(() => ouvirTeste(p => tocar({ chave: `teste:${Date.now()}`, cor: p.cor, duracaoMs: p.duracaoMs, texto: 'Teste da sirene', volume: p.volume }, true)), []);

  // ── As saídas: a duração e o vigia ──
  useEffect(() => {
    if (!naTela) return;
    const sair = () => setSaindo(true);
    const t1 = setTimeout(sair, naTela.duracaoMs);
    const vigia = setTimeout(sair, DURACAO_MAX_S * 1000 + 1000);
    return () => { clearTimeout(t1); clearTimeout(vigia); };
  }, [naTela]);

  // Saindo: a animação some com a camada; se ela não terminar (aba escondida
  // não anima), o timer tira do mesmo jeito — nunca fica um botão invisível.
  useEffect(() => {
    if (!saindo) return;
    const id = setTimeout(() => { pararSom.current(); setNaTela(null); setSaindo(false); }, 600);
    return () => clearTimeout(id);
  }, [saindo]);

  useEffect(() => () => pararSom.current(), []);

  if (!naTela) return null;
  const cor = corDaSirene(naTela.cor);
  const silenciar = () => { pararSom.current(); setSaindo(true); };

  return createPortal(
    <div
      className={`sirene-camada${saindo ? ' saindo' : ''}${semPlacaDeVideo() ? ' sem-placa' : ''}`}
      style={{ '--luz': cor.luz, '--luz2': cor.luz2 } as CSSProperties}
      data-testid="sirene"
    >
      <div className="sirene-borda sirene-borda-a" aria-hidden />
      <div className="sirene-borda sirene-borda-b" aria-hidden />
      <div className="sirene-fachos" aria-hidden />
      <div className="sirene-peca" aria-hidden>
        <div className="sirene-cupula">
          <div className="sirene-farol" />
        </div>
        <div className="sirene-anel" />
        <div className="sirene-base" />
      </div>
      <div className="sirene-rotulo" role="alert">
        {naTela.texto && <span className="sirene-texto">{naTela.texto}</span>}
        <button type="button" className="sirene-silenciar" onClick={silenciar}>Silenciar</button>
      </div>
    </div>,
    document.body,
  );
}
