/**
 * Os balões de parabéns que sobem pelas laterais.
 *
 * São peças soltas, como o confete do palco: entram direto na caixa e animam
 * por WAAPI, sem redesenhar o palco a cada um. No ensaio (`parabens.ensaio`)
 * o clique fica nesta tela e os colegas são de mentira; no show de verdade
 * (`parabens.aoVivo`) os balões vão e vêm pela cidade (`parabensAoVivo.ts`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Destaque } from './diretor';
import {
  ENTRE_COLEGAS_MS, RECARGA_DO_BOTAO_MS, TETO_DE_BALOES, colegaDoEnsaio, frasesDoEspetaculo, sortearOutraFrase,
  type BalaoDeParabens, type ParabensDoPalco,
} from './regrasDosParabens';
import { ESPALHAR_ENTRADA_MS, ESPERA_MAXIMA_MS, deveTentar, mandarParabens, ouvirParabens } from './parabensAoVivo';
import { nomeCurto } from './dados';
import { tocarSom } from './sons';

const PRIMEIRO_COLEGA_MS = 1_200;
const SUBIDA_PX = 170;
const DURACAO_MS = 5_200;
// Os meus sobem mais rápido: clicando sem parar, um não cobre o outro.
const SUBIDA_DO_MEU_PX = 300;
const DURACAO_DO_MEU_MS = 3_500;

function montarBalao({ nome, foto, frase, meu }: BalaoDeParabens): HTMLElement {
  const balao = document.createElement('i');
  balao.className = cn('qn-parabens-balao', meu && 'meu');

  const rosto = document.createElement('span');
  rosto.className = 'qn-parabens-foto';
  const inicial = nome.trim().charAt(0).toUpperCase();
  if (foto) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.onerror = () => { img.remove(); rosto.textContent = inicial; };
    img.src = foto;
    rosto.appendChild(img);
  } else {
    rosto.textContent = inicial;
  }

  const texto = document.createElement('span');
  texto.className = 'qn-parabens-texto';
  const quem = document.createElement('b');
  quem.textContent = nome;
  const disse = document.createElement('span');
  disse.textContent = frase;
  texto.append(quem, disse);

  balao.append(rosto, texto);
  return balao;
}

export function useParabensDoPalco({ parabens, destaques, noAr, quadrinho, mini }: {
  parabens: ParabensDoPalco | undefined;
  destaques: readonly Destaque[];
  noAr: boolean;
  quadrinho: boolean;
  mini: boolean;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [jaEnviou, setJaEnviou] = useState(false);
  const [recarregando, setRecarregando] = useState(false);
  const travado = useRef(false);
  const recarga = useRef(0);
  const ultimaFrase = useRef<string | null>(null);
  const lado = useRef(0);
  const opcoes = useRef({ quadrinho, mini });
  opcoes.current = { quadrinho, mini };
  const quantos = destaques.length;

  const soltar = useCallback((b: BalaoDeParabens) => {
    const c = caixa.current;
    if (!c) return;
    // Cada um conta os seus: quem clica sem parar não tira os colegas da tela.
    // Em quadrinhos o balão não sobe, então o meu novo fica no lugar do anterior.
    const meu = !!b.meu;
    const teto = meu && opcoes.current.quadrinho ? 1 : TETO_DE_BALOES;
    const mesmos = [...c.children].filter(el => el.classList.contains('meu') === meu);
    while (mesmos.length >= teto) mesmos.shift()?.remove();
    const balao = montarBalao(b);
    // O meu sobe numa coluna própria (`.meu`, no CSS), para não cair em cima de um colega.
    // No palco pequeno os cartões ocupam a direita: os balões ficam todos na esquerda.
    balao.dataset.lado = b.meu || opcoes.current.mini || lado.current++ % 2 === 0 ? 'e' : 'd';
    c.appendChild(balao);
    const subida = meu ? SUBIDA_DO_MEU_PX : SUBIDA_PX;
    const quadros: Keyframe[] = opcoes.current.quadrinho
      ? [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }]
      : [
        { transform: 'translateY(18px) scale(.86)', opacity: 0 },
        { transform: 'translateY(0) scale(1)', opacity: 1, offset: 0.08 },
        { transform: `translateY(${-subida * 0.8}px) scale(1)`, opacity: 1, offset: 0.8 },
        { transform: `translateY(${-subida}px) scale(1)`, opacity: 0 },
      ];
    const duracao = opcoes.current.quadrinho ? 3_600 : meu ? DURACAO_DO_MEU_MS : DURACAO_MS;
    const anim = balao.animate(quadros, { duration: duracao, easing: 'linear', fill: 'both' });
    anim.onfinish = () => balao.remove();
    anim.oncancel = () => balao.remove();
  }, []);

  const ensaio = !!parabens?.ensaio;
  useEffect(() => {
    if (!noAr || !ensaio) return;
    let vez = Math.floor(Math.random() * 8);
    let relogio = 0;
    const chegar = () => {
      soltar(colegaDoEnsaio(vez++, quantos));
      relogio = window.setTimeout(chegar, ENTRE_COLEGAS_MS);
    };
    relogio = window.setTimeout(chegar, PRIMEIRO_COLEGA_MS);
    return () => window.clearTimeout(relogio);
  }, [noAr, ensaio, quantos, soltar]);

  // Ao vivo: os balões dos colegas da cidade. A entrada no canal se espalha
  // por uns segundos (o palco nasce antes dos cartões), para a cidade não
  // entrar toda no mesmo segundo.
  const aoVivo = parabens?.aoVivo;
  const noArAgora = useRef(noAr);
  noArAgora.current = noAr;
  const ultimoColega = useRef(0);
  const ultimaTentativa = useRef(0);
  const tentativa = useRef(0);
  const chaveAoVivo = aoVivo ? `${aoVivo.cidade}|${aoVivo.chave}|${aoVivo.pessoaId}|${aoVivo.superAdmin}` : '';
  const aoVivoAtual = useRef(aoVivo);
  aoVivoAtual.current = aoVivo;
  useEffect(() => {
    const av = aoVivoAtual.current;
    if (!av) return;
    let cancelar: (() => void) | null = null;
    const entrada = window.setTimeout(() => {
      cancelar = ouvirParabens(av, p => {
        ultimoColega.current = Date.now();
        if (!noArAgora.current) return;
        const lista = frasesDoEspetaculo(quantos);
        soltar({ nome: nomeCurto(p.nome), foto: p.foto, frase: lista[p.frase] ?? lista[0] });
      });
    }, Math.random() * ESPALHAR_ENTRADA_MS);
    return () => { window.clearTimeout(entrada); cancelar?.(); };
  }, [chaveAoVivo, quantos, soltar]);

  useEffect(() => () => { window.clearTimeout(recarga.current); window.clearTimeout(tentativa.current); }, []);

  const foto = parabens?.eu.foto ?? null;
  const enviar = useCallback(() => {
    if (travado.current) return;
    travado.current = true;
    setJaEnviou(true);
    setRecarregando(true);
    const frase = sortearOutraFrase(quantos, ultimaFrase.current);
    ultimaFrase.current = frase;
    soltar({ nome: 'Você', foto, frase, meu: true });
    tocarSom('palmas', { dur: 0.34 });
    recarga.current = window.setTimeout(() => {
      travado.current = false;
      setRecarregando(false);
    }, RECARGA_DO_BOTAO_MS);
    // Para os colegas: espera um sorteio e só chama o banco se a cidade estiver quieta.
    if (aoVivoAtual.current && !tentativa.current) {
      tentativa.current = window.setTimeout(() => {
        tentativa.current = 0;
        const av = aoVivoAtual.current;
        const agora = Date.now();
        if (!av || !deveTentar({ agora, ultimoColega: ultimoColega.current, ultimaTentativa: ultimaTentativa.current })) return;
        ultimaTentativa.current = agora;
        const indice = Math.max(0, frasesDoEspetaculo(quantos).indexOf(ultimaFrase.current ?? ''));
        void mandarParabens(av, indice);
      }, Math.random() * ESPERA_MAXIMA_MS);
    }
  }, [foto, quantos, soltar]);

  return { caixa, jaEnviou, recarregando, enviar };
}
