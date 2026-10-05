/**
 * cena.tsx — o que a Caça à Abóbora desenha: a abóbora escondida, o recado
 * de quem clicou e a faixa com o nome de quem achou.
 *
 * Baixado só quando há o que mostrar (ver `index.tsx`): quem passa o dia sem
 * abóbora não paga por este pedaço.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { carregarFontesDoCartaz } from '@/components/Halloween/fonte';
import { DesenhoAbobora } from './DesenhoAbobora';
import { acharEsconderijo, areaVisivel, caixaLivre } from './esconderijo';
import { formatarTempo, nomeCurto, pegarAbobora, type RodadaAbobora } from './caca';
import './caca.css';

/** O lado do botão. O desenho tem 34 px; a sobra é a área de toque. */
const LADO = 40;
/** De quanto em quanto tempo a abóbora confere se o lugar continua livre. */
const CONFERE_MS = 1_500;

function palco(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-palco-abobora]');
}

// ── O recado de quem clicou ──────────────────────────────────────────────────

type Recado =
  | { tipo: 'ganhou'; ms: number | null; rapida: boolean }
  | { tipo: 'perdeu'; nome: string | null; sumiu: boolean };

function RecadoDoClique({ recado }: { recado: Recado }) {
  return createPortal(
    <div className="cacab-recado" role="status">
      <DesenhoAbobora className="cacab-recado-abobora" />
      {recado.tipo === 'ganhou' ? (
        <div>
          <b>Você achou a abóbora!</b>
          <span>
            em <span className="cacab-mono">{formatarTempo(recado.ms)}</span> · seu nome está passando na faixa para todo mundo
          </span>
          {recado.rapida && <span className="cacab-recado-rapida">⚡ A mais rápida do dia!</span>}
        </div>
      ) : (
        <div>
          <b>{recado.sumiu ? 'Ela já tinha sumido…' : 'Por pouco!'}</b>
          <span>
            {recado.sumiu || !recado.nome
              ? 'Fique de olho: a próxima aparece mais tarde.'
              : <><b className="cacab-recado-nome">{nomeCurto(recado.nome)}</b> achou primeiro.</>}
          </span>
        </div>
      )}
    </div>,
    document.body,
  );
}

function estouro(x: number, y: number) {
  const caixa = document.createElement('div');
  caixa.className = 'cacab-estouro';
  caixa.style.left = `${x}px`;
  caixa.style.top = `${y}px`;
  for (let i = 0; i < 16; i++) {
    const p = document.createElement('i');
    const ang = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
    const d = 26 + Math.random() * 30;
    p.style.setProperty('--x', `${Math.cos(ang) * d}px`);
    p.style.setProperty('--y', `${Math.sin(ang) * d}px`);
    if (i % 3 === 0) p.className = 'brilho';
    caixa.appendChild(p);
  }
  document.body.appendChild(caixa);
  setTimeout(() => caixa.remove(), 900);
}

// ── A abóbora escondida ──────────────────────────────────────────────────────

interface Lugar { x: number; y: number; visivel: boolean }

function AboboraEscondida({ rodada, aoClicar }: { rodada: RodadaAbobora; aoClicar: (r: Recado) => void }) {
  const [lugar, setLugar] = useState<Lugar | null>(null);
  const [pegando, setPegando] = useState(false);
  // Muda a cada troca de lugar: remonta o botão e a chegada anima de novo.
  const [vez, setVez] = useState(0);
  const botaoRef = useRef<HTMLButtonElement>(null);
  // Onde ela foi posta, e a rolagem do palco naquela hora: rolar a página leva
  // a abóbora junto, como se estivesse desenhada no conteúdo.
  const ancora = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const tentativa = useRef(0);
  const { pathname } = useLocation();

  const colocar = useCallback((avancar: boolean) => {
    const p = palco();
    if (!p) { ancora.current = null; setLugar(null); return; }
    if (avancar) tentativa.current += 1;
    const achado = acharEsconderijo(p, rodada.semente, LADO, tentativa.current, botaoRef.current);
    if (!achado) { ancora.current = null; setLugar(null); return; }
    ancora.current = { ...achado, sx: p.scrollLeft, sy: p.scrollTop };
    setLugar({ ...achado, visivel: true });
    setVez(v => v + 1);
  }, [rodada.semente]);

  // Onde ela está agora, pela rolagem.
  const acompanhar = useCallback(() => {
    const p = palco();
    const a = ancora.current;
    if (!p || !a) return;
    const x = a.x - (p.scrollLeft - a.sx);
    const y = a.y - (p.scrollTop - a.sy);
    const area = areaVisivel(p, 0);
    const visivel = !!area && x >= area.left && y >= area.top && x + LADO <= area.right && y + LADO <= area.bottom;
    setLugar(l => (l && l.x === x && l.y === y && l.visivel === visivel ? l : { x, y, visivel }));
  }, []);

  // Chega meio segundo depois do aviso: a tela termina de assentar.
  useEffect(() => {
    const t = setTimeout(() => colocar(false), 450);
    return () => clearTimeout(t);
  }, [colocar]);

  // Trocou de tela: espera a nova carregar e procura outro canto.
  const primeiraRota = useRef(true);
  useEffect(() => {
    if (primeiraRota.current) { primeiraRota.current = false; return; }
    const t = setTimeout(() => colocar(true), 900);
    return () => clearTimeout(t);
  }, [pathname, colocar]);

  useEffect(() => {
    const p = palco();
    let quadro = 0;
    const aoRolar = () => { cancelAnimationFrame(quadro); quadro = requestAnimationFrame(acompanhar); };
    let espera: ReturnType<typeof setTimeout> | undefined;
    const aoRedimensionar = () => { clearTimeout(espera); espera = setTimeout(() => colocar(true), 300); };
    p?.addEventListener('scroll', aoRolar, { passive: true });
    window.addEventListener('resize', aoRedimensionar);
    return () => {
      cancelAnimationFrame(quadro);
      clearTimeout(espera);
      p?.removeEventListener('scroll', aoRolar);
      window.removeEventListener('resize', aoRedimensionar);
    };
  }, [acompanhar, colocar]);

  // A tela mudou por baixo dela (lista carregou, menu abriu): chegou algo
  // clicável perto, ela muda de canto. Saiu da vista pela rolagem: volta
  // para a parte visível.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'hidden' || pegando) return;
      const p = palco();
      const l = lugar;
      if (!p) return;
      if (!l || !l.visivel) { colocar(!!l); return; }
      if (!caixaLivre({ x: l.x, y: l.y, lado: LADO }, p, botaoRef.current)) colocar(true);
    }, CONFERE_MS);
    return () => clearInterval(t);
  }, [lugar, pegando, colocar]);

  async function pegar(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (pegando) return;
    setPegando(true);
    const r = e.currentTarget.getBoundingClientRect();
    estouro(r.left + r.width / 2, r.top + r.height / 2);
    const res = await pegarAbobora(rodada.id);
    if (res.erro) {
      setPegando(false);
      toast.error('Não deu para pegar a abóbora', { description: res.erro });
      return;
    }
    aoClicar(res.ganhou
      ? { tipo: 'ganhou', ms: res.rodada?.ms ?? null, rapida: !!res.rodada?.mais_rapida_do_dia }
      : { tipo: 'perdeu', nome: res.rodada?.achada_por_nome ?? null, sumiu: res.rodada?.situacao !== 'achada' });
  }

  if (!lugar) return null;
  return createPortal(
    <button
      key={vez}
      ref={botaoRef}
      type="button"
      // Caça é de olho: a tecla Tab não entrega o esconderijo.
      tabIndex={-1}
      className={pegando ? 'cacab-abobora pega' : 'cacab-abobora'}
      style={{ left: lugar.x, top: lugar.y, visibility: lugar.visivel ? 'visible' : 'hidden' }}
      aria-label="Uma abóbora escondida! Clique para pegar"
      title="Achou! Clique para pegar"
      onClick={pegar}
    >
      <span className="cacab-espia"><DesenhoAbobora className="cacab-desenho" /></span>
    </button>,
    document.body,
  );
}

/**
 * A abóbora (quando há uma solta) e o recado de quem clicou — o recado
 * sobrevive à abóbora: ela some no clique, ele fica alguns segundos.
 */
export function CenaCaca({ rodada }: { rodada: RodadaAbobora | null }) {
  const [recado, setRecado] = useState<Recado | null>(null);
  useEffect(() => {
    if (!recado) return;
    const t = setTimeout(() => setRecado(null), 4_200);
    return () => clearTimeout(t);
  }, [recado]);
  return (
    <>
      {rodada && <AboboraEscondida key={rodada.id} rodada={rodada} aoClicar={setRecado} />}
      {recado && <RecadoDoClique recado={recado} />}
    </>
  );
}

// ── A faixa ──────────────────────────────────────────────────────────────────

/** Velocidade da faixa, em px por segundo. */
const VELOCIDADE = 70;

function UmRecado({ rodada }: { rodada: RodadaAbobora }) {
  const [semFoto, setSemFoto] = useState(false);
  const foto = rodada.achada_por_foto && !semFoto ? rodada.achada_por_foto : null;
  return (
    <span className="cacab-faixa-recado">
      <DesenhoAbobora className="cacab-faixa-abobora" />
      <span>A abóbora foi encontrada por</span>
      {foto && (
        <img src={foto} alt="" className="cacab-faixa-foto" loading="eager" onError={() => setSemFoto(true)} />
      )}
      <span className="cacab-faixa-nome">{nomeCurto(rodada.achada_por_nome)}</span>
      <span>em</span>
      <span className="cacab-faixa-tempo">{formatarTempo(rodada.ms)}</span>
      {rodada.mais_rapida_do_dia && <span className="cacab-faixa-rapida">⚡ a mais rápida do dia!</span>}
      <span className="cacab-faixa-estrela" aria-hidden="true">✦</span>
    </span>
  );
}

/**
 * O letreiro: o recado passa sem parar enquanto a faixa estiver aberta (4 min,
 * ver `FAIXA_MS`). Dois grupos iguais, um atrás do outro, correndo meia volta:
 * quando o primeiro sai inteiro, o segundo está exatamente onde ele começou, e
 * o laço não tem emenda. Cada grupo tem cópias bastantes para cobrir a largura
 * da janela.
 */
export function FaixaAbobora({ rodada }: { rodada: RodadaAbobora }) {
  const grupoRef = useRef<HTMLDivElement>(null);
  const [copias, setCopias] = useState(3);
  const [duracao, setDuracao] = useState(30);

  useEffect(() => { carregarFontesDoCartaz(); }, []);

  useLayoutEffect(() => {
    const medir = () => {
      const g = grupoRef.current;
      const um = g?.firstElementChild as HTMLElement | null;
      if (!g || !um || um.offsetWidth === 0) return;
      const precisa = Math.max(2, Math.ceil(window.innerWidth / um.offsetWidth) + 1);
      if (precisa !== copias) { setCopias(precisa); return; }
      setDuracao(Math.max(12, g.offsetWidth / VELOCIDADE));
    };
    medir();
    // A fonte do nome chega depois e muda a largura.
    void document.fonts?.ready.then(medir);
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [copias, rodada]);

  const grupo = (ref?: Ref<HTMLDivElement>) => (
    <div className="cacab-faixa-grupo" ref={ref}>
      {Array.from({ length: copias }, (_, i) => <UmRecado key={i} rodada={rodada} />)}
    </div>
  );

  const frase = `A abóbora foi encontrada por ${rodada.achada_por_nome ?? 'alguém'} em ${formatarTempo(rodada.ms)}`
    + (rodada.mais_rapida_do_dia ? ', a mais rápida do dia!' : '.');

  return (
    <div className="cacab-faixa">
      <span className="sr-only" role="status">{frase}</span>
      <div className="cacab-faixa-trilho" aria-hidden="true" style={{ '--cacab-dur': `${duracao}s` } as CSSProperties}>
        {grupo(grupoRef)}
        {grupo()}
      </div>
      {/* Quem pede menos movimento lê parado. */}
      <div className="cacab-faixa-parada" aria-hidden="true"><UmRecado rodada={rodada} /></div>
    </div>
  );
}
