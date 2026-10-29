/**
 * Mural.tsx — outubro no Gestão numa parede só (pedido de 27/10/2026: «não
 * quero que seja uma apresentação de PowerPoint, quero um mural cheio de
 * itens»). Tudo de uma vez, numa tela inteira: o quadro de investigação de
 * Derry, com as peças do Gestão pregadas e o fio vermelho ligando as
 * gincanas na ordem do mês.
 *
 *   no alto    o título, as cinco insígnias penduradas numa corda (como
 *              no topo do Gestão, balançando), o letreiro de lâmpadas de
 *              Derry e um cacho de balões vermelhos
 *   1ª fileira as cinco gincanas, cada uma numa foto com a medalha
 *   embaixo    o recorte do jornal, os números do mês em cartão do
 *              Dashboard, o ranking (a tabela do Gestão), o pôster das
 *              Lendas de Outubro (o top 3 com as medalhas) e o prêmio delas,
 *              a garrafa (a roleta abre por cima), e o chat do que também
 *              teve no mês
 *   no canto   a porta, com a Coisa no escuro atrás do balão e o bilhete
 *              pregado; no alto, o fone do player de música que se foi (o F)
 *   por cima   a aranha, as abóboras, as teias e os morcegos; e, quando o
 *              mouse passa na foto dos zumbis ou das bruxas, eles invadem
 *              (`Invasao.tsx`)
 *
 * Na primeira vez o mural entra puxado pela Coisa, que dançou antes dele
 * (`puxando`: arrastado por ela, sem pregar as peças de novo; o baque da
 * chegada é dela, em `coisa/Puxando.tsx`). Ela fica no canto olhando o mouse e dá o bote se ele parar
 * (`coisa/NoMural.tsx`).
 *
 * A parede é desenhada em 1920 × 1080 e encolhe ou cresce para caber na tela;
 * a cortiça continua até a borda. Tudo de `dados.ts` (congelado).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { Gift, Maximize2, Medal, Trophy, Users, X } from 'lucide-react';
import { INSIGNIAS, type Conquista, type IdInsignia } from '@/components/Insignias/insignias';
import { Medalha } from '@/components/Insignias/Medalha';
import '@/components/Insignias/insignias.css';
import { PodioDasLendas } from '@/components/Insignias/lendas/Lendas';
import { DATA_DO_RETRATO, GINCANAS, GOLPE_FINAL, LENDAS, PESSOAL, PREMIO_DAS_LENDAS, TAMBEM_TEVE, TOP10, insigniasDe, type Pessoa } from './dados';
import { fecharTela, useVelocidadeDoMural } from './estado';
import { ACoisaNoMural } from './coisa/NoMural';
import { calarSom, prepararSonsDaCoisa, tocarSomDaCoisa } from './coisa/trilha';
import { ArteDaGincana, ArteGarrafa } from './Artes';
import { Foco, PremioDasLendas } from './Sorteios';
import { Rosto } from './Rosto';
import { BALAO, BARCO, PALETA_DO_BALAO, PALETA_DO_BARCO } from './coisa/arte';
import { Pixel } from './Bueiro';
import { Abobora, Aranha, DesenhoDaAbobora, Morcegos, Teia } from './Enfeites';
import { Aranha as AranhaDoTema } from '@/components/Halloween/Aranha';
import { Fone } from './Fone';
import { Invasao, type Invasor } from './Invasao';
import './mural.css';

const LARGURA = 1920;
const ALTURA = 1080;

/** O que a medalha lê: só o desenho (o primeiro zumbi e a primeira bruxa). */
const CONQUISTA: Conquista = {
  vezes: 1, primeiraEm: '', ultimaEm: '', desenho: 0, headshots: 0, melhorMs: null, golpeFinal: false, maiorDano: 0,
};
const FITA = Object.fromEntries(INSIGNIAS.map(i => [i.id, i.fita])) as Record<IdInsignia, string>;

/** Quando cada gincana começou (o que está nas próprias artes e no código). */
const DATA: Readonly<Record<IdInsignia, string>> = {
  zumbi: '07/10', reiDoPop: '09/10', bruxas: '14/10', pantano: '16/10', guerra: '23/10',
};

// ── As fotos das gincanas: onde fica cada uma ───────────────────────────────

const FOTOS: readonly { id: IdInsignia; x: number; y: number; giro: number }[] = [
  { id: 'zumbi', x: 48, y: 178, giro: -3 },
  { id: 'reiDoPop', x: 418, y: 196, giro: 2 },
  { id: 'bruxas', x: 790, y: 196, giro: -1.5 },
  { id: 'pantano', x: 1162, y: 192, giro: 2.5 },
  { id: 'guerra', x: 1534, y: 176, giro: -2 },
];
const LARGURA_DA_FOTO = 330;
/** O alfinete de cada foto (o fio vermelho passa por eles). */
const ALFINETES = FOTOS.map(f => [f.x + LARGURA_DA_FOTO / 2, f.y + 10] as const);

/** Um pedaço pregado na parede: posição, giro e a vez de entrar. */
function Peca({ x, y, l, giro, vez, preso = 'alfinete', className = '', aoPassar, children }: {
  x: number; y: number; l: number; giro: number; vez: number;
  preso?: 'alfinete' | 'fita' | 'nada'; className?: string; aoPassar?: () => void; children: ReactNode;
}) {
  return (
    <div
      className={`mural-peca ${className}`}
      onMouseEnter={aoPassar}
      style={{ left: x, top: y, width: l, ['--giro' as string]: `${giro}deg`, ['--vez' as string]: vez } as CSSProperties}
    >
      {preso === 'alfinete' && <span className="mural-alfinete" aria-hidden />}
      {preso === 'fita' && <span className="mural-fita" aria-hidden />}
      {children}
    </div>
  );
}

/**
 * As medalhas penduradas numa corda, como no topo do Gestão: a fita presa na
 * corda, cada uma balançando no seu tempo, o brilho passando no disco e o
 * balanço do app quando o mouse passa. A corda cai no meio (`queda`) e cada
 * fita desce até ela; os comprimentos variam um pouco para não ficar régua.
 */
function VaralNaCorda({ tam, largura, queda, ids = INSIGNIAS.map(i => i.id), nova = false }: {
  tam: number; largura: number; queda: number; ids?: readonly IdInsignia[]; nova?: boolean;
}) {
  const n = INSIGNIAS.length;
  const passo = largura / n;
  const fios = [0.45, 0.8, 0.6, 0.9, 0.5];
  return (
    <div className="mural-corda" style={{ width: largura, height: queda + tam * 1.9 }}>
      <svg className="mural-corda-fio" viewBox={`0 0 ${largura} ${queda + 8}`} width={largura} height={queda + 8} aria-hidden>
        <path d={`M0 4 Q${largura / 2} ${queda * 2 + 4} ${largura} 4`} />
      </svg>
      {INSIGNIAS.map((ins, i) => {
        const t = (i + 0.5) / n;
        const naCorda = 4 + queda * 4 * t * (1 - t);
        return (
          <Medalha
            key={ins.id}
            insignia={ins}
            conquista={ids.includes(ins.id) ? CONQUISTA : undefined}
            tam={tam}
            pendurada
            nova={nova}
            className="mural-medalha-viva"
            style={{
              left: passo * i + passo / 2 - tam / 2,
              top: naCorda,
              ['--fio' as string]: `${Math.round(tam * 0.32 * fios[i])}px`,
              ['--atraso' as string]: `${-i * 0.7}s`,
            } as CSSProperties}
          />
        );
      })}
    </div>
  );
}

/** As gincanas que voltam quando o mouse passa na foto delas. */
const INVADE: Partial<Record<IdInsignia, Invasor>> = { zumbi: 'zumbi', bruxas: 'bruxa' };

function FotoDaGincana({ id, x, y, giro, vez, invadir }: {
  id: IdInsignia; x: number; y: number; giro: number; vez: number; invadir: (t: Invasor) => void;
}) {
  const g = GINCANAS.find(o => o.id === id)!;
  const ins = INSIGNIAS.find(i => i.id === id)!;
  const invasor = INVADE[id];
  return (
    <Peca x={x} y={y} l={LARGURA_DA_FOTO} giro={giro} vez={vez} className="mural-foto" aoPassar={invasor && (() => invadir(invasor))}>
      <div className="mural-foto-quadro" style={{ ['--fita' as string]: FITA[id] } as CSSProperties}>
        <ArteDaGincana id={id} fator={0.62} />
        <span className="mural-foto-data">{DATA[id]}</span>
        {invasor && <span className="mural-foto-carimbo">Não passe o mouse</span>}
      </div>
      <div className="mural-foto-legenda">
        <Medalha insignia={ins} conquista={CONQUISTA} tam={46} />
        <div>
          <p className="mural-foto-titulo">{g.titulo}</p>
          <p className="mural-foto-frase">{g.frase}</p>
        </div>
      </div>
      {g.fatos.length > 0 && <ul className="mural-foto-fatos">{g.fatos.map(f => <li key={f}>{f}</li>)}</ul>}
    </Peca>
  );
}

/** Um cartão do Dashboard do Gestão: o rótulo, o número grande, a linha de baixo. */
function Indicador({ x, y, giro, vez, icone, rotulo, valor, sub }: {
  x: number; y: number; giro: number; vez: number; icone: ReactNode; rotulo: string; valor: string; sub: string;
}) {
  return (
    <Peca x={x} y={y} l={196} giro={giro} vez={vez} preso="fita" className="mural-cartao mural-indicador">
      <p className="mural-indicador-rotulo">{icone}{rotulo}</p>
      <p className="mural-indicador-valor">{valor}</p>
      <p className="mural-indicador-sub">{sub}</p>
    </Peca>
  );
}

/**
 * As insígnias de uma linha do ranking: as medalhas de verdade, em miniatura
 * (a que falta em silhueta), quando se sabe quais; senão, a contagem.
 */
function InsigniasDaLinha({ p }: { p: Pessoa }) {
  const ids = insigniasDe(p);
  if (!ids) {
    return (
      <span className="portal-bolinhas" aria-label={`${p.insignias} de 5 insígnias`}>
        {INSIGNIAS.map((ins, i) => <span key={ins.id} className={i < p.insignias ? 'portal-bolinha-tem' : ''} />)}
      </span>
    );
  }
  return (
    <span className="mural-ranking-medalhas" aria-label={`${p.insignias} de 5 insígnias`}>
      {INSIGNIAS.map(ins => <Medalha key={ins.id} insignia={ins} conquista={ids.includes(ins.id) ? CONQUISTA : undefined} tam={17} />)}
    </span>
  );
}

/** O letreiro da entrada da cidade, de lâmpadas, com uma letra falhando. */
function LetreiroDeDerry() {
  const l = 470, a = 132, passo = 22;
  const lampadas: [number, number][] = [];
  for (let x = 12; x <= l - 12; x += passo) { lampadas.push([x, 10]); lampadas.push([x, a - 10]); }
  for (let y = 10 + passo; y < a - 10; y += passo) { lampadas.push([12, y]); lampadas.push([l - 12, y]); }
  return (
    <div className="mural-derry" style={{ width: l, height: a }}>
      <span className="mural-derry-corrente mural-derry-corrente-e" aria-hidden />
      <span className="mural-derry-corrente mural-derry-corrente-d" aria-hidden />
      <div className="mural-derry-placa">
        {lampadas.map(([x, y], i) => (
          <span key={i} className={`mural-lampada${i % 2 ? ' mural-lampada-b' : ''}${i === 7 ? ' mural-lampada-queimada' : ''}`} style={{ left: x, top: y }} />
        ))}
        <p className="mural-derry-boas">Bem-vindos a</p>
        <p className="mural-derry-nome">
          {[...'DERRY'].map((c, i) => <span key={i} className={i === 3 ? 'mural-derry-falha' : ''}>{c}</span>)}
        </p>
        <p className="mural-derry-sub">Maine</p>
      </div>
    </div>
  );
}

/** Um cacho de balões vermelhos amarrado no alfinete da foto do Cavalo. */
function CachoDeBaloes() {
  const baloes = [
    { x: 0, y: 26, giro: -8, atraso: 0 },
    { x: 58, y: 0, giro: 3, atraso: -1.2 },
    { x: 112, y: 34, giro: 10, atraso: -2.1 },
  ];
  return (
    <div className="mural-cacho" aria-hidden>
      <svg className="mural-cacho-fios" viewBox="0 0 180 200" width={180} height={200}>
        {baloes.map((b, i) => <path key={i} d={`M${b.x + 36} ${b.y + 84} Q${(b.x + 36 + 92) / 2 + (i - 1) * 6} ${b.y + 140} 92 196`} />)}
      </svg>
      {baloes.map((b, i) => (
        <div key={i} className="mural-cacho-balao" style={{ left: b.x, top: b.y, ['--giro' as string]: `${b.giro}deg`, ['--atraso' as string]: `${b.atraso}s` } as CSSProperties}>
          <Pixel linhas={BALAO} paleta={PALETA_DO_BALAO} tam={6} />
        </div>
      ))}
    </div>
  );
}

/**
 * O chat do mês (pedido de 28/10: o que teve além do que já está no mural):
 * o Gestão mandando as mensagens uma a uma, com o «digitando…» antes de
 * cada. A teia no canto e a aranha nela.
 */
function ChatDoMes({ x, y, vez, v }: { x: number; y: number; vez: number; v: number }) {
  const [vistas, setVistas] = useState(0);
  const [digitando, setDigitando] = useState(false);
  const vRef = useRef(v);
  vRef.current = v;
  useEffect(() => {
    const ts: number[] = [];
    const proxima = (i: number, espera: number) => {
      if (i >= TAMBEM_TEVE.length) return;
      ts.push(window.setTimeout(() => {
        setDigitando(true);
        ts.push(window.setTimeout(() => { setDigitando(false); setVistas(i + 1); proxima(i + 1, 700); }, 1300 / vRef.current));
      }, espera / vRef.current));
    };
    proxima(0, 2600);
    return () => ts.forEach(t => window.clearTimeout(t));
  }, []);
  return (
    <Peca x={x} y={y} l={214} giro={1.5} vez={vez} preso="fita" className="mural-chat">
      <div className="mural-chat-topo">
        <span className="mural-chat-avatar"><DesenhoDaAbobora tam={30} /></span>
        <span className="mural-chat-quem">
          <span className="mural-chat-nome">Gestão</span>
          <span className="mural-chat-status">{digitando ? 'digitando…' : 'online'}</span>
        </span>
      </div>
      <div className="mural-chat-corpo">
        <p className="mural-chat-dia">Também teve</p>
        {TAMBEM_TEVE.slice(0, vistas).map(m => (
          <p key={m.texto} className="mural-chat-msg">
            <span className="mural-chat-quando">{m.quando}</span>
            {m.texto}
          </p>
        ))}
        {digitando && <p className="mural-chat-msg mural-chat-digitando" aria-label="digitando"><span /><span /><span /></p>}
      </div>
      <Teia x={214} y={50} tam={66} canto="sd" />
      <Aranha x={180} y={50} fio={40} tam={24} atraso={-1.4} />
    </Peca>
  );
}

/** O pôster das Lendas de Outubro (a arte de 26/10, `PodioDasLendas`) pregado na parede; o mouse aproxima. */
const ESCALA_DO_POSTER = 0.28125;

/**
 * Cada invasão volta só depois de 5 minutos (pedido de 28/10), contados da
 * hora em que ela acabou; zumbis e bruxas, cada um no seu tempo. Fica fora
 * do componente: fechar e abrir o mural não zera.
 */
const INTERVALO_DA_INVASAO_MS = 5 * 60_000;
const acabouAInvasao: Partial<Record<Invasor, number>> = {};

/** O pôster das Lendas grande, para ler as medalhas (abre no botão, não no mouse). */
function PosterAmpliado() {
  const [escala, setEscala] = useState(0.5);
  useEffect(() => {
    const medir = () => setEscala(Math.min((window.innerWidth - 120) / 1920, (window.innerHeight - 140) / 1080));
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);
  return (
    <div className="mural-poster-grande" style={{ width: 1920 * escala, height: 1080 * escala }}>
      <div style={{ width: 1920, height: 1080, transform: `scale(${escala})`, transformOrigin: '0 0' }}>
        <PodioDasLendas fotos={FOTOS_DAS_LENDAS} />
      </div>
    </div>
  );
}
const FOTOS_DAS_LENDAS = Object.fromEntries(LENDAS.map(l => [l.posicao, l.foto ?? undefined])) as Partial<Record<1 | 2 | 3, string>>;

/** O fio vermelho entre dois alfinetes, caído no meio. */
function fio([x0, y0]: readonly [number, number], [x1, y1]: readonly [number, number], queda = 34): string {
  const mx = (x0 + x1) / 2, my = Math.max(y0, y1) + queda;
  return `M${x0} ${y0} Q${mx} ${my} ${x1} ${y1}`;
}

export function Mural({ leve = false, puxando = false, semEntrada = false, raiz }: {
  leve?: boolean;
  /** Entrando arrastado pela Coisa (o fim da cena). */
  puxando?: boolean;
  /** As peças já estão pregadas (o mural que volta puxado). */
  semEntrada?: boolean;
  raiz?: Ref<HTMLDivElement>;
}) {
  const v = useVelocidadeDoMural();
  const [escala, setEscala] = useState(1);
  const [foco, setFoco] = useState<null | 'premio' | 'lendas'>(null);
  const focoRef = useRef(foco);
  focoRef.current = foco;
  const [invasao, setInvasao] = useState<{ tipo: Invasor; id: number } | null>(null);
  const invadir = (tipo: Invasor) => {
    if (invasao || foco || puxando) return;
    const acabou = acabouAInvasao[tipo];
    if (acabou != null && Date.now() - acabou < INTERVALO_DA_INVASAO_MS / v) return;
    setInvasao({ tipo, id: Date.now() });
  };

  useEffect(() => {
    const medir = () => setEscala(Math.min(window.innerWidth / LARGURA, window.innerHeight / ALTURA));
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);

  // O tema da Coisa em laço enquanto o mural está aberto (pedido de
  // 29/10/2026: «no mural deixar tocando o tema do It»); puxado, entra quando
  // ela acaba de puxar. Espera o trecho decodificar para o laço emendar.
  useEffect(() => {
    if (puxando) return;
    let vivo = true, tema: ReturnType<typeof tocarSomDaCoisa> = null;
    void prepararSonsDaCoisa().then(() => { if (vivo) tema = tocarSomDaCoisa('tema'); });
    return () => { vivo = false; calarSom(tema, 600); };
  }, [puxando]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !focoRef.current) fecharTela(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  const insignias = useMemo(() => PESSOAL.reduce((s, p) => s + p.insignias, 0), []);

  const fios = useMemo(() => ALFINETES.slice(1).map((p, i) => fio(ALFINETES[i], p, 28)), []);

  return (
    <div
      ref={raiz}
      className={`mural${leve ? ' portal-leve' : ''}${puxando ? ' mural-puxado' : ''}${semEntrada ? ' mural-sem-entrada' : ''}`}
      style={{ ['--v' as string]: v } as CSSProperties}
      role="dialog"
      aria-label="Mural de outubro"
      data-portal-anima
    >
      <div className="mural-caixa" style={{ width: LARGURA, height: ALTURA, transform: `translate(-50%, -50%) scale(${escala})` }}>
        <header className="mural-titulo">
          <p className="portal-selo">O mural de outubro · 2026</p>
          <h1 className="portal-titulo">Outubro no Gestão</h1>
        </header>
        <div className="mural-varal"><VaralNaCorda tam={50} largura={600} queda={10} nova /></div>
        <div className="mural-canto-derry"><LetreiroDeDerry /></div>
        <div className="mural-canto-cacho"><CachoDeBaloes /></div>

        <Fone x={1286} y={0} tam={3} pausado={!!foco} />
        {/* A aranha do tema, a de verdade: puxa, estica o fio, arrebenta e joga (pedido de 28/10: «tem que ser puxada»). */}
        <div className="mural-aranha"><AranhaDoTema claro={false} palcoNoAlto fogeDoMouse={false} /></div>
        <Teia x={1920} y={0} tam={170} canto="sd" />
        <Teia x={0} y={1080} tam={150} canto="ie" />

        {FOTOS.map((f, i) => <FotoDaGincana key={f.id} {...f} vez={i + 1} invadir={invadir} />)}
        <Teia x={50} y={180} tam={74} canto="se" />

        {/* O recorte do jornal. */}
        <Peca x={44} y={590} l={340} giro={-2.5} vez={6} preso="fita" className="mural-jornal">
          <p className="mural-jornal-nome">Diário do Gestão</p>
          <p className="mural-jornal-data">Edição de Halloween · 30 de outubro de 2026</p>
          <p className="mural-jornal-manchete">Bruxa do Pântano cai diante de 74 caçadores</p>
          <p className="mural-jornal-texto">Ela jogou poção, embaralhou a tela e se escondeu atrás do totem. O golpe final foi de Eduardo Naia, do Play 3.</p>
          <p className="mural-jornal-manchete mural-jornal-menor">Cavalo da Guerra estoura a janela</p>
          <p className="mural-jornal-texto">A corrida virou guerra, e ele brigou na página do Gestão.</p>
        </Peca>

        <Indicador x={60} y={918} giro={2} vez={7} icone={<Users />} rotulo="Com insígnia" valor={String(PESSOAL.length)} sub="pessoas no álbum" />
        <Indicador x={278} y={930} giro={-2} vez={8} icone={<Medal />} rotulo="Insígnias" valor={String(insignias)} sub="entregues em outubro" />

        {/* O ranking: a tabela do Gestão. */}
        <Peca x={504} y={566} l={420} giro={-1.2} vez={9} className="mural-cartao mural-ranking">
          <p className="mural-cartao-topo"><Trophy />Ranking das medalhas<span>top 10</span></p>
          <ol>
            {TOP10.map(p => (
              <li key={p.nome} className={p.posicao <= 3 ? `portal-lugar-${p.posicao}` : ''}>
                <span className="mural-ranking-pos">{p.posicao}</span>
                <Rosto p={p} />
                <span className="mural-ranking-quem">
                  <span className="mural-ranking-nome">{p.nome}</span>
                  <span className="mural-ranking-setor">{p.setor ?? 'sem setor'}{GOLPE_FINAL.has(p.nome) && <em> · golpe final</em>}</span>
                </span>
                <InsigniasDaLinha p={p} />
                <span className="mural-ranking-pts">{p.pontos}</span>
              </li>
            ))}
          </ol>
          <p className="mural-cartao-rodape">100 por insígnia · 5 por zumbi ou bruxa · 10 na cabeça · 20 por chefe · 50 golpe final · retrato de {DATA_DO_RETRATO}</p>
        </Peca>

        {/* As Lendas de Outubro: o pôster do top 3 com as medalhas, e o prêmio (a garrafa). */}
        <Peca x={944} y={566} l={556} giro={1} vez={10} className="mural-poster">
          <div className="mural-poster-quadro" style={{ width: 1920 * ESCALA_DO_POSTER, height: 1080 * ESCALA_DO_POSTER }}>
            <div style={{ width: 1920, height: 1080, transform: `scale(${ESCALA_DO_POSTER})`, transformOrigin: '0 0' }}>
              <PodioDasLendas fotos={FOTOS_DAS_LENDAS} />
            </div>
          </div>
          <div className="mural-poster-legenda">
            <Trophy />Top 3 das medalhas
            <button type="button" className="mural-poster-ampliar" onClick={() => setFoco('lendas')}><Maximize2 />Ampliar</button>
          </div>
        </Peca>
        <Abobora x={904} y={508} tam={74} giro={-6} />

        <Peca x={986} y={940} l={476} giro={-1} vez={11} preso="fita" className="mural-cartao mural-premio">
          <div className="mural-premio-arte"><ArteGarrafa escala={4} /></div>
          <div className="mural-premio-texto">
            <p className="mural-premio-selo">O prêmio das Lendas</p>
            <p className="mural-premio-nome">{PREMIO_DAS_LENDAS.titulo}</p>
            <p className="mural-premio-regra">sorteada entre as três</p>
          </div>
          <button type="button" className="portal-botao mural-botao" onClick={() => setFoco('premio')}><Gift />Abrir</button>
        </Peca>

        <ChatDoMes x={1508} y={556} vez={12} v={v} />
        <Abobora x={1434} y={996} tam={74} giro={4} atraso={-0.7} />
        <Abobora x={316} y={538} tam={74} giro={8} atraso={-1.3} />

        {/* A porta do canto, onde ela fica. */}
        <div className="mural-porta" aria-hidden>
          <div className="mural-porta-vao" />
          <div className="mural-porta-folha" />
        </div>

        {/* O bilhete pregado na porta. */}
        <Peca x={1764} y={594} l={124} giro={6} vez={14} preso="fita" className="mural-bilhete">
          Você também vai flutuar.
        </Peca>
        <div className="mural-barco" style={{ ['--vez' as string]: 16 } as CSSProperties}>
          <Pixel linhas={BARCO} paleta={PALETA_DO_BARCO} tam={5} />
        </div>

        <svg className="mural-fios" viewBox={`0 0 ${LARGURA} ${ALTURA}`} aria-hidden>
          {fios.map((d, i) => <path key={i} d={d} style={{ ['--vez' as string]: 17 + i } as CSSProperties} />)}
        </svg>

      </div>

      {!leve && <Morcegos v={v} />}

      {invasao && (
        <Invasao
          key={invasao.id}
          tipo={invasao.tipo}
          v={v}
          leve={leve}
          aoAcabar={() => { acabouAInvasao[invasao.tipo] = Date.now(); setInvasao(null); }}
        />
      )}

      {foco && (
        <Foco aoFechar={() => setFoco(null)} largo={foco === 'lendas'}>
          {foco === 'lendas' ? <PosterAmpliado /> : <PremioDasLendas />}
        </Foco>
      )}

      {!puxando && <ACoisaNoMural escala={escala} v={v} pausada={!!foco} leve={leve} />}

      <button type="button" className="portal-fechar" onClick={fecharTela} aria-label="Fechar o mural"><X /></button>
    </div>
  );
}
