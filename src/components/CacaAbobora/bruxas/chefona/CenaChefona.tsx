/**
 * CenaChefona.tsx — a chefona das bruxas (a Bruxa do Pântano) na caça de
 * verdade: o palco dela ligado à vida do banco, os tiros em lote, o placar do
 * time, os botões do super_admin e o ranking no fim.
 *
 * Baixada só quando há chefona (ver `../../index.tsx`), e cedo, na abertura do
 * app, junto com os outros pedaços da caça. A regra está em `banco.ts` e na
 * migration 20261015230000; o desenho e a luta, em `palcoChefona.ts`.
 *
 * ## O que é de cada tela
 *
 * O voo, as poções que ela joga na página, os desvios e a fúria são desta
 * tela, como a dança do Rei do Pop. A vida, a Poção de Cura, o Totem e o
 * ranking são do banco: o palco lê a vida a cada quadro (`FonteDoBanco`), e
 * esta cena manda o palco beber, estourar o totem, cair ou fugir quando o
 * banco diz.
 *
 * ## Fora do `#root`
 *
 * O palco mora num elemento direto do `<body>`: as poções pintam e distorcem
 * o `#root` (a página), e a bruxa não pode se distorcer junto.
 *
 * ## Sob carga (o mesmo cuidado do Rei do Pop, `../../cenaChefao.tsx`)
 *
 * Cada aba começa o lote num ponto sorteado do segundo, só há um lote no ar
 * por vez, e a releitura «quieta» é uma só por silêncio, nunca na contagem.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { carregarFontesPixel } from '@/components/Halloween/fonte';
import { criarDetector, type Detector } from '../../autoclick';
import { volumeDoChefao } from '../../sons';
import { nomeCurto } from '../../caca';
import { RANKING_MS, desligarChefao, type Golpeador, type MeuPlacar } from '../../chefao';
import { canvasDaImagem } from '../pixels';
import { cabecaMC } from './arte';
import { PalcoChefona, type EventoChefona, type FonteDoBanco } from './palcoChefona';
import {
  BEBER_MS, LOTE_MS, MAX_ACERTOS_POR_LOTE, chefonaChegando, curarChefona, enviarLoteChefona, lerChefona,
  motivoDoErroDaChefona, protegerChefona, situacaoDaChefona, vidaPorAparecer,
  type ResultadoLoteChefona, type RodadaChefona,
} from './banco';
import '../../caca.css';
import './chefona.css';

/**
 * Sem aviso do banco há tanto tempo (mais um sorteio do mesmo tamanho), com
 * ela na tela: relê UMA vez — o freio dos avisos pode ter engolido o último.
 */
const RELER_QUIETO_MS = 5_000;
/** O aviso do banco chega um pouco depois: até aqui, a cena (beber, erguer o totem, estourar) ainda roda. */
const CENA_ATRASADA_MS = 4_000;
/** Depois que ela cai: o ranking espera o tombo e o «puf»; o palco fica até os drops sumirem. */
const RANKING_DEPOIS_DA_QUEDA_MS = 2_600;
const PALCO_DEPOIS_DA_QUEDA_MS = 13_000;

// ── O placar do time ────────────────────────────────────────────────────────

function Time({ host, rodada, eu, meuDano, minhaPosicao, superAdmin }: {
  host: HTMLElement;
  rodada: RodadaChefona;
  eu: string | null;
  meuDano: number;
  minhaPosicao: number;
  superAdmin: boolean;
}) {
  const [pedindo, setPedindo] = useState<'cura' | 'totem' | null>(null);
  async function pedir(qual: 'cura' | 'totem') {
    setPedindo(qual);
    const { erro } = qual === 'cura' ? await curarChefona(rodada.id) : await protegerChefona(rodada.id);
    setPedindo(null);
    if (erro) {
      toast.error(qual === 'cura' ? 'Ela não bebeu a poção' : 'Ela não ergueu o totem', { description: motivoDoErroDaChefona(erro) });
    }
  }
  const agora = Date.now();
  const bebendo = !!rodada.cura_em && agora - Date.parse(rodada.cura_em) < 3_000;
  const top = rodada.ranking.slice(0, 3);
  return createPortal(
    <div className="bxc-time" role="status" aria-live="off">
      <div className="bxc-time-linha">
        {rodada.participantes > 0 ? `${rodada.participantes} na caçada` : 'Atire nela!'}
        {meuDano > 0 && <> · você: <b>{meuDano}</b>{minhaPosicao > 0 ? ` (${minhaPosicao}º)` : ''}</>}
      </div>
      {top.length > 0 && (
        <ol className="bxc-time-top">
          {top.map((g, i) => (
            <li key={g.usuario} className={g.usuario === eu ? 'eu' : undefined}>
              <span className="pos">{i + 1}º</span>
              <span className="nome">{nomeCurto(g.nome)}</span>
              <span className="dano">{g.dano}</span>
            </li>
          ))}
        </ol>
      )}
      {superAdmin && (
        <div className="bxc-time-botoes">
          <button
            type="button"
            className="bxc-time-btn cura"
            onClick={() => { void pedir('cura'); }}
            disabled={pedindo !== null || bebendo || rodada.vida >= rodada.vida_max}
            title="Ela para e bebe a Poção de Cura: recupera 22% da vida máxima na tela de todos (só você vê este botão)"
          >
            {bebendo ? 'BEBENDO…' : pedindo === 'cura' ? '…' : 'POÇÃO DE CURA'}
          </button>
          <button
            type="button"
            className="bxc-time-btn totem"
            onClick={() => { void pedir('totem'); }}
            disabled={pedindo !== null || rodada.protegida}
            title="Feitiço de proteção: o golpe que a derrubaria estoura o Totem da Imortalidade e ela volta com 1 de vida, Absorção e Regeneração (só você vê este botão)"
          >
            {rodada.protegida ? 'COM O TOTEM' : pedindo === 'totem' ? '…' : 'TOTEM'}
          </button>
        </div>
      )}
    </div>,
    host,
  );
}

// ── O botão de esconder ─────────────────────────────────────────────────────

/**
 * «Esconder» ao lado da barra de corações (15/10/2026). Antes era só o X no
 * meio da barra do topo do Gestão, que ficava atrás da barra de vida dela, e
 * centrado na barra do app (não na tela). Agora mora no palco, por cima do
 * escudo, sempre no mesmo lugar — na contagem e na luta. Escondida, o palco
 * desmonta (as poções e o escudo vão junto) e o X do topo volta para mostrar.
 */
function BotaoEsconder({ host, perfilId }: { host: HTMLElement; perfilId: string }) {
  function esconder() {
    desligarChefao(perfilId, true);
    toast('Chefona escondida', {
      description: 'Você não vê nem ouve a Bruxa do Pântano, e o Gestão volta a funcionar. Clique no X no topo para voltar.',
    });
  }
  return createPortal(
    <button type="button" className="bxc-esconder" onClick={esconder} title="Esconder a chefona e voltar a usar o Gestão">
      <svg viewBox="0 0 10 10" width={10} height={10} shapeRendering="crispEdges" aria-hidden="true">
        <g fill="currentColor">
          {[0, 1, 2, 3, 4].map(i => <rect key={`a${i}`} x={i * 2} y={i * 2} width={2} height={2} />)}
          {[0, 1, 2, 3, 4].map(i => <rect key={`b${i}`} x={8 - i * 2} y={i * 2} width={2} height={2} />)}
        </g>
      </svg>
      Esconder
    </button>,
    host,
  );
}

// ── O ranking final ─────────────────────────────────────────────────────────

function Avatar({ g }: { g: Golpeador }) {
  const [semFoto, setSemFoto] = useState(false);
  if (g.foto && !semFoto) {
    return <img src={g.foto} alt="" className="zb-chefao-avatar" loading="eager" onError={() => setSemFoto(true)} />;
  }
  const iniciais = nomeCurto(g.nome).split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  return <span className="zb-chefao-avatar" aria-hidden="true">{iniciais}</span>;
}

function Cabeca() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const c = canvasDaImagem(cabecaMC(), false);
    c.style.width = `${c.width * 4}px`;
    c.style.height = `${c.height * 4}px`;
    ref.current?.appendChild(c);
    return () => c.remove();
  }, []);
  return <span ref={ref} className="bxc-final-cabeca" aria-hidden="true" />;
}

function RankingChefona({ rodada, eu, meu, aoFechar }: {
  rodada: RodadaChefona;
  eu: string | null;
  meu: MeuPlacar | null;
  aoFechar: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(aoFechar, RANKING_MS);
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    window.addEventListener('keydown', tecla);
    return () => { clearTimeout(t); window.removeEventListener('keydown', tecla); };
  }, [aoFechar]);

  const derrotada = rodada.situacao === 'derrotado';
  const maior = Math.max(1, ...rodada.ranking.map(g => g.dano));
  const estouNoTopo = !!eu && rodada.ranking.some(g => g.usuario === eu);
  return createPortal(
    <div className={derrotada ? 'zb-chefao-final bruxa' : 'zb-chefao-final bruxa fugiu'} role="dialog" aria-label="Ranking da chefona">
      <div className="zb-chefao-final-topo">
        <Cabeca />
        <div>
          <span className="zb-chefao-final-titulo">{derrotada ? 'A BRUXA DO PÂNTANO CAIU!' : 'ELA FUGIU PARA O PÂNTANO...'}</span>
          {derrotada ? (
            <span className="zb-chefao-final-golpe">
              Golpe final de <b>{rodada.golpe_final_por === eu ? 'você' : nomeCurto(rodada.golpe_final_nome)}</b>
            </span>
          ) : (
            <span className="zb-chefao-final-golpe">Sobrou <b>{rodada.vida}</b> de {rodada.vida_max} de vida.</span>
          )}
          {rodada.participantes > 0 && (
            <span className="zb-chefao-final-sub">
              {rodada.participantes === 1 ? '1 pessoa ajudou' : `${rodada.participantes} pessoas ajudaram`}
              {rodada.totens > 0 && ` · ${rodada.totens === 1 ? 'o totem a salvou uma vez' : `o totem a salvou ${rodada.totens} vezes`}`}
            </span>
          )}
        </div>
        <button type="button" className="zb-chefao-final-fechar" onClick={aoFechar} aria-label="Fechar o ranking">X</button>
      </div>
      {rodada.ranking.length === 0 ? (
        <p className="zb-chefao-final-vazio">Ninguém acertou nela.</p>
      ) : (
        <ol className="zb-chefao-lista">
          {rodada.ranking.map((g, i) => (
            <li key={g.usuario} className={g.usuario === eu ? 'eu' : undefined}>
              <span className="pos">{i + 1}º</span>
              <Avatar g={g} />
              <span className="quem">
                <span className="nome">
                  <span>{g.usuario === eu ? `${nomeCurto(g.nome)} (você)` : nomeCurto(g.nome)}</span>
                  {derrotada && g.usuario === rodada.golpe_final_por && <span className="zb-chefao-golpe">GOLPE FINAL</span>}
                </span>
                <span className="barra"><i style={{ width: `${(g.dano / maior) * 100}%` }} /></span>
              </span>
              <span className="numeros">
                <span className="dano">{g.dano}</span>
                <span className="detalhe">
                  {g.acertos} {g.acertos === 1 ? 'tiro' : 'tiros'}
                  {g.headshots > 0 && ` · ${g.headshots} ${g.headshots === 1 ? 'crítico' : 'críticos'}`}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {!estouNoTopo && meu && meu.dano > 0 && (
        <p className="zb-chefao-final-eu">Você: {meu.posicao}º lugar, {meu.dano} de dano.</p>
      )}
    </div>,
    document.body,
  );
}

// ── A cena ──────────────────────────────────────────────────────────────────

/**
 * A chefona de uma rodada, do começo ao fim: montada com a chave da rodada
 * (`../../index.tsx`), vive até ela cair ou fugir e o ranking ser fechado.
 */
export function CenaChefona({ rodada, eu, perfilId, superAdmin, aoAcabar }: {
  rodada: RodadaChefona;
  /** Quem está na tela (o perfil), para o «Esconder» guardar a escolha dela. */
  perfilId?: string | null;
  /** Quem está na tela, para achar a pessoa no ranking. */
  eu: string | null;
  /** O super_admin ouve inteiro e tem os botões; o operador ouve a 12% (`VOLUME_DO_OPERADOR`). */
  superAdmin: boolean;
  aoAcabar: () => void;
}) {
  const situacao = situacaoDaChefona(rodada, Date.now());
  const chegando = chefonaChegando(rodada, Date.now());
  // Só quem viu ela viva vê ela cair e o ranking: quem chega depois não.
  const viuViva = useRef(situacao === 'ativo');
  const [palcoNaTela, setPalcoNaTela] = useState(situacao === 'ativo');
  const [ranking, setRanking] = useState(false);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const palcoRef = useRef<PalcoChefona | null>(null);

  const rodadaRef = useRef(rodada);
  rodadaRef.current = rodada;
  const superAdminRef = useRef(superAdmin);
  superAdminRef.current = superAdmin;
  // Os tiros guardados até o próximo lote, e o dano que ainda não voltou do banco.
  const lote = useRef({ acertos: 0, criticos: 0, dano: 0 });
  const pendente = useRef(0);
  const [meu, setMeu] = useState<MeuPlacar | null>(null);
  const avisouErro = useRef(false);
  const detector = useRef<Detector | null>(null);
  const ultimaVersao = useRef({ versao: rodada.versao, em: Date.now(), relido: false });
  // O placar do time se redesenha sozinho (o meu dano a caminho mora num ref).
  const [, setTique] = useState(0);

  useEffect(() => { carregarFontesPixel(); }, []);
  // Antes de qualquer som tocar: o volume de quem está na tela (vale para todo som da caça).
  useLayoutEffect(() => volumeDoChefao(superAdmin), [superAdmin]);

  useLayoutEffect(() => {
    if (rodada.versao !== ultimaVersao.current.versao) ultimaVersao.current = { versao: rodada.versao, em: Date.now(), relido: false };
  }, [rodada.versao]);

  const aoEvento = useCallback((e: EventoChefona) => {
    const p = palcoRef.current;
    if (e.tipo === 'entrou') {
      // Quem chega com o totem já erguido vê ela segurando.
      p?.definirProtegida(rodadaRef.current.protegida);
    } else if (e.tipo === 'fugiu') {
      setPalcoNaTela(false);
    }
  }, []);

  // O palco: num elemento do `<body>`, fora do `#root` que as poções distorcem.
  useLayoutEffect(() => {
    const el = document.createElement('div');
    el.className = 'bxc-host';
    document.body.appendChild(el);
    const fonte: FonteDoBanco = {
      ler: () => {
        const r = rodadaRef.current;
        const agora = Date.now();
        const p = pendente.current;
        // Os meus tiros a caminho gastam primeiro a Absorção, como no banco.
        const absorcao = Math.max(0, r.absorcao - p);
        const vida = Math.max(0, r.vida - Math.max(0, p - r.absorcao) - vidaPorAparecer(r, agora));
        return { vida, vidaMax: r.vida_max, absorcao, restanteS: Math.max(0, (Date.parse(r.expira_em) - agora) / 1000) };
      },
      aoAcertar: (dano, critico) => {
        const l = lote.current;
        l.acertos += 1;
        if (critico) l.criticos += 1;
        l.dano += dano;
        pendente.current += dano;
      },
    };
    // O super_admin não tem escudo: ele comanda a luta e segue usando o Gestão.
    const palco = new PalcoChefona(el, { banco: fonte, aoEvento, escudo: !superAdminRef.current });
    palcoRef.current = palco;
    setHost(el);
    return () => {
      palco.destruir();
      el.remove();
      palcoRef.current = null;
    };
  }, [aoEvento]);

  // Ela chega: a contagem (com a hora do banco) ou direto, para quem entra no meio.
  useEffect(() => {
    const p = palcoRef.current;
    if (!p || !viuViva.current) return;
    const r = rodadaRef.current;
    const agora = Date.now();
    p.soltar({
      vida: r.vida_max,
      prazoS: Math.max(1, (Date.parse(r.expira_em) - Date.parse(r.solta_em)) / 1000),
      esperaS: Math.max(0, (Date.parse(r.solta_em) - agora) / 1000),
    });
  }, [host]);

  // A contagem segue a hora do banco, se ela mudar depois de montada.
  useEffect(() => {
    palcoRef.current?.chegarEm((Date.parse(rodada.solta_em) - Date.now()) / 1000);
  }, [rodada.solta_em]);

  // O detector de autoclick: ouve os cliques enquanto ela está na tela.
  useEffect(() => {
    if (situacao !== 'ativo' || chegando) return;
    const d = criarDetector();
    detector.current = d;
    return () => { d.parar(); if (detector.current === d) detector.current = null; };
  }, [situacao, chegando]);

  // O que o banco decide vira cena: beber, erguer o totem, o totem estourar.
  const visto = useRef({ cura: rodada.cura_em, totem: rodada.totem_em, protegida: rodada.protegida });
  useEffect(() => {
    const p = palcoRef.current;
    const v = visto.current;
    if (!p || situacao !== 'ativo') return;
    const agora = Date.now();
    if (rodada.cura_em && rodada.cura_em !== v.cura) {
      v.cura = rodada.cura_em;
      const decorrido = agora - Date.parse(rodada.cura_em);
      if (decorrido < BEBER_MS) p.curar({ total: rodada.cura_vida, decorridoS: Math.max(0, decorrido) / 1000 });
    }
    if (rodada.totem_em && rodada.totem_em !== v.totem) {
      v.totem = rodada.totem_em;
      if (agora - Date.parse(rodada.totem_em) < CENA_ATRASADA_MS) p.totemEstourou(rodada.totem_vida);
      else p.definirProtegida(false);
    }
    if (rodada.protegida !== v.protegida) {
      v.protegida = rodada.protegida;
      const recente = !!rodada.protegida_em && agora - Date.parse(rodada.protegida_em) < CENA_ATRASADA_MS;
      if (rodada.protegida && recente) p.proteger();
      else p.definirProtegida(rodada.protegida);
    }
  }, [rodada, situacao]);

  // O fim que vem do banco (ou do relógio): cai, ou foge.
  const fim = useRef<string | null>(null);
  useEffect(() => {
    if (situacao === 'ativo' || fim.current) return;
    fim.current = situacao;
    lote.current = { acertos: 0, criticos: 0, dano: 0 };
    pendente.current = 0;
    const p = palcoRef.current;
    if (!viuViva.current) { setPalcoNaTela(false); return; }
    if (situacao === 'derrotado') {
      p?.derrubar();
      const r = setTimeout(() => setRanking(true), RANKING_DEPOIS_DA_QUEDA_MS);
      const s = setTimeout(() => setPalcoNaTela(false), PALCO_DEPOIS_DA_QUEDA_MS);
      return () => { clearTimeout(r); clearTimeout(s); };
    }
    p?.fugir();
    setRanking(true);
    // A fuga avisa quando ela sai da tela (o evento `fugiu`); se não sair, o relógio tira.
    const s = setTimeout(() => setPalcoNaTela(false), 8_000);
    return () => clearTimeout(s);
  }, [situacao]);

  // O lote: a cada `LOTE_MS`, o que foi guardado vai ao banco (ver «Sob carga» no topo).
  useEffect(() => {
    if (situacao !== 'ativo') return;
    let vivo = true;
    let noAr = false;
    const chega = Date.parse(rodada.solta_em);
    const quieto = RELER_QUIETO_MS + Math.random() * RELER_QUIETO_MS;
    const tique = () => {
      setTique(n => n + 1);
      if (noAr) return;
      const { acertos, criticos, dano } = lote.current;
      if (acertos === 0) {
        const u = ultimaVersao.current;
        const agora = Date.now();
        if (rodada.id > 0 && !u.relido && agora >= chega && agora - Math.max(u.em, chega) > quieto) {
          u.relido = true;
          void lerChefona().catch((): void => undefined);
        }
        return;
      }
      // O lote leva até 12 acertos; o dano vai na proporção dos que couberam.
      const a = Math.min(acertos, MAX_ACERTOS_POR_LOTE);
      const c = Math.min(criticos, a);
      const d = acertos === a ? dano : Math.round((dano * a) / acertos);
      lote.current = { acertos: acertos - a, criticos: criticos - c, dano: dano - d };
      const colheita = detector.current?.colher() ?? { cliques: 0, suspeita: 0 };
      noAr = true;
      void enviarLoteChefona(rodada.id, a, c, d, colheita)
        .catch((e: unknown): ResultadoLoteChefona => ({ rodada: null, eu: null, erro: e instanceof Error ? e.message : String(e), freio: false }))
        .then(res => {
          noAr = false;
          if (!vivo) return;
          if (res.freio) {
            // Chegou cedo demais ao banco: os tiros voltam para o próximo lote.
            lote.current.acertos += a;
            lote.current.criticos += c;
            lote.current.dano += d;
            detector.current?.devolver(colheita);
            return;
          }
          pendente.current = Math.max(0, pendente.current - d);
          if (res.eu) setMeu(res.eu);
          if (res.erro && !avisouErro.current) {
            avisouErro.current = true;
            toast.error('Seus tiros não chegaram', { description: res.erro });
          }
        });
    };
    let t: ReturnType<typeof setInterval> | undefined;
    const inicio = setTimeout(() => { tique(); t = setInterval(tique, LOTE_MS); }, Math.random() * LOTE_MS);
    return () => { vivo = false; clearTimeout(inicio); if (t) clearInterval(t); };
  }, [situacao, rodada.id, rodada.solta_em]);

  const fecharRanking = useCallback(() => setRanking(false), []);

  useEffect(() => {
    if (!palcoNaTela && !ranking) aoAcabar();
  }, [palcoNaTela, ranking, aoAcabar]);

  const minhaPosicao = (eu ? rodada.ranking.findIndex(g => g.usuario === eu) + 1 : 0) || (meu?.posicao ?? 0);
  const doRanking = eu ? rodada.ranking.find(g => g.usuario === eu)?.dano ?? 0 : 0;
  const meuDano = Math.round(Math.max(doRanking, meu?.dano ?? 0) + pendente.current);

  return (
    <>
      {host && situacao === 'ativo' && !chegando && viuViva.current && (
        <Time host={host} rodada={rodada} eu={eu} meuDano={meuDano} minhaPosicao={minhaPosicao} superAdmin={superAdmin} />
      )}
      {host && perfilId && situacao === 'ativo' && viuViva.current && <BotaoEsconder host={host} perfilId={perfilId} />}
      {ranking && <RankingChefona rodada={rodada} eu={eu} meu={meu} aoFechar={fecharRanking} />}
    </>
  );
}
