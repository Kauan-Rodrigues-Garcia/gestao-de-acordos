/**
 * PalcoCorrida — a janelinha onde se assiste à corrida: o lobby, a contagem, a
 * caixa dos mapas, a corrida e a festa de quem venceu. Fica no canto da tela,
 * sem tampar o sistema; o botão de ampliar deixa grande quando a pessoa quer.
 *
 * Este arquivo só existe no pacote quando alguém abre a corrida (ver
 * `index.tsx`). Quem desenha é o motor (`motor/motor.js`); no lobby, com um
 * tema novo (`lobbies/`), o cenário é do `LobbyNovo` e o motor só toca a
 * música. Aqui ficam a barrinha de cima, as reações e o volume.
 *
 * O mesmo palco serve à corrida de verdade (`PalcoAoVivo`, com o banco) e ao
 * teste do super admin (`TesteCorrida`, sem banco): quem usa passa a corrida,
 * as pessoas e o relógio.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Crosshair, Maximize2, Minimize2, Volume2, VolumeX, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { criarMotor, type Gravacao, type Motor, type Painel, type VideosDaFesta } from './motor/motor';
import { bichinhoDe } from './motor/bichinhos';
import { segundos, type CorridaJson, type PessoaJson } from './banco';
import { NOME_CORRIDA, SONS, audioDestravado } from './nome';
import LobbyNovo from './lobbies/LobbyNovo';
import type { Cena, Palpite, TemaLobby } from './lobbies/cena';
import './corrida.css';

export interface PalcoProps {
  corrida: CorridaJson;
  pessoas: PessoaJson[];
  eu: string | null;
  /** O relógio do banco, em segundos. */
  agora: () => number;
  gravacao: { rec: Gravacao; faixa: string[]; parada: number } | null;
  videos: VideosDaFesta | null;
  onFechar: () => void;
  /** Os botões do teste do super admin (só no teste): ficam fora da janela. */
  barraTeste?: ReactNode;
  /** Recebe o motor quando ele nasce (o teste usa para gravar). */
  aoMotor?: (motor: Motor | null) => void;
  /** O cenário do lobby (ver `lobbies/`); sem ele, o estádio de hoje. */
  tema?: TemaLobby;
  /** O palpite no vencedor (sem ele, não aparece). */
  palpite?: Palpite;
  onPalpite?: (id: string) => void;
}

const FONTES = ['Racing Sans One', 'Saira Condensed', 'Rubik', 'IBM Plex Mono', 'Pirata One', 'Orbitron', 'Cinzel Decorative', 'Metal Mania', 'Press Start 2P'];
const BARRAS_EQ = 10;
type Reacao = 'palmas' | 'torcer' | 'coracao' | 'ola';
const REACOES: ReadonlyArray<readonly [Reacao, string, string, string]> = [
  ['palmas', 'Aplaudir', '👏', 'linear-gradient(145deg,#ffd84d,#ff9f1a)'],
  ['torcer', 'Torcer', '📣', 'linear-gradient(145deg,#4cc9ff,#2f6bff)'],
  ['coracao', 'Coração', '❤️', 'linear-gradient(145deg,#ff7aa8,#e8174f)'],
  ['ola', 'Festa', '🎉', 'linear-gradient(145deg,#a98bff,#6a3df0)'],
];
const ESPERA_REACAO = 1500;
const VOL_TETO = 0.2; // o teto do volume no motor (20% do som cheio)
const SEM_PALPITE: Palpite = { ativo: false, meu: null, votos: {} };
const fmtMs = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

export function PalcoCorrida({ corrida, pessoas, eu, agora, gravacao, videos, onFechar, barraTeste, aoMotor, tema = 'atual', palpite = SEM_PALPITE, onPalpite }: PalcoProps) {
  const pistaRef = useRef<HTMLCanvasElement>(null);
  const cerimoniaRef = useRef<HTMLCanvasElement>(null);
  const festaRef = useRef<HTMLVideoElement>(null);
  const loopRef = useRef<HTMLVideoElement>(null);
  const eqRef = useRef<HTMLSpanElement>(null);
  const motorRef = useRef<Motor | null>(null);
  const cenaRef = useRef<Cena | null>(null);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [seguindo, setSeguindo] = useState(false);
  const [grande, setGrande] = useState(false);
  const agoraRef = useRef(agora);
  agoraRef.current = agora;

  // O motor nasce uma vez por palco.
  useEffect(() => {
    if (!pistaRef.current || !cerimoniaRef.current) return;
    const m = criarMotor({
      pista: pistaRef.current, cerimonia: cerimoniaRef.current,
      videoFesta: festaRef.current, videoLoop: loopRef.current,
      sons: SONS, audio: audioDestravado(),
      aoPainel: setPainel,
    });
    m.setRelogio(() => agoraRef.current());
    // O palco só abre depois de um clique («Assistir», «Testar»): o som já pode tocar.
    m.entrar();
    motorRef.current = m;
    if (eqRef.current) m.ligarEq(eqRef.current.children as unknown as ArrayLike<HTMLElement>);
    aoMotor?.(m);
    // As fontes do motor vêm do próprio app: quando chegam, o que foi desenhado com a provisória é refeito.
    let vivo = true;
    if (document.fonts?.load) {
      void Promise.allSettled(FONTES.map(f => document.fonts.load(`20px "${f}"`))).then(() => { if (vivo) m.fontesProntas(); });
    }
    return () => { vivo = false; aoMotor?.(null); m.destruir(); motorRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- o motor é um só por palco; o resto entra pelos efeitos abaixo
  }, []);

  useEffect(() => { motorRef.current?.setEu(eu); }, [eu]);

  useEffect(() => {
    motorRef.current?.setCorrida({
      id: corrida.id, premio: corrida.premio, estado: corrida.estado,
      abertaEm: segundos(corrida.aberta_em), iniciaEm: segundos(corrida.inicia_em),
    });
  }, [corrida.id, corrida.premio, corrida.estado, corrida.aberta_em, corrida.inicia_em]);

  // Antes da gravação, só quem já escolheu o bichinho fica no grid; quem ainda
  // escolhe espera na plateia. O aleatório é da gravação (ou do «preencher»).
  const gravada = !!corrida.gravada_em;
  const noGrid = useMemo(() => pessoas.map(p => {
    const corre = p.corre && (gravada || p.escolha != null);
    return corre === p.corre ? p : { ...p, corre, assiste: true };
  }), [pessoas, gravada]);
  useEffect(() => {
    motorRef.current?.setPessoas(noGrid.map(p => ({
      id: p.usuario, nome: p.nome, setor: p.setor, foto: p.foto, corre: p.corre, assiste: p.assiste,
      est: p.corre ? bichinhoDe(corrida.id, p.usuario, p.escolha) : null,
      entrouEm: segundos(p.entrou_em), escolhidaEm: null as number | null,
    })));
  }, [noGrid, corrida.id]);

  useEffect(() => { motorRef.current?.setGravacao(gravacao?.rec ?? null, gravacao ? { faixa: gravacao.faixa, parada: gravacao.parada } : undefined); }, [gravacao]);
  useEffect(() => { motorRef.current?.setVideos(videos); }, [videos]);

  // Esc fecha; o motor segue a câmera pedida.
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onFechar]);
  useEffect(() => { motorRef.current?.seguir(seguindo ? eu : null); }, [seguindo, eu, gravacao]);

  const tela = painel?.tela ?? 'lobby';
  const novo = tema !== 'atual' && tela === 'lobby';
  useEffect(() => { motorRef.current?.setLobbyVisivel(!novo); }, [novo]);
  const euCorro = useMemo(() => pessoas.some(p => p.usuario === eu && p.corre), [pessoas, eu]);
  const naCorrida = tela === 'corrida' || tela === 'festa' || tela === 'video';
  const noLobby = useMemo(() => pessoas.filter(p => p.entrou_em).length, [pessoas]);

  const status = (() => {
    if (corrida.estado === 'cancelada') return 'A corrida foi cancelada';
    if (tela === 'lobby') return corrida.inicia_em ? 'Largada!' : `Lobby · ${noLobby} aguardando`;
    if (tela === 'show') return 'Sorteio do mapa';
    if (tela === 'carregando') return 'Carregando';
    if (tela === 'corrida') return `Ao vivo · ${fmtMs(painel?.tempo ?? 0)}`;
    if (tela === 'festa' || tela === 'video') return painel?.vencedor ? `${painel.vencedor.nome} venceu!` : 'Chegada';
    return '';
  })();

  const vol = painel?.volume ?? { max: VOL_TETO, mudo: false };
  const volPct = vol.mudo ? 0 : Math.round((vol.max / VOL_TETO) * 100);
  const ajusta = (max: number, mudo: boolean) => motorRef.current?.volume(Math.round(max * 1000) / 1000, mudo);
  // As reações: uma a cada 1,5 s por pessoa (clicar sem parar enchia a tela de emoji e derrubava o FPS).
  const [recarga, setRecarga] = useState(0);
  useEffect(() => { if (!recarga) return; const id = window.setTimeout(() => setRecarga(0), ESPERA_REACAO); return () => window.clearTimeout(id); }, [recarga]);
  const reagir = (tipo: Reacao) => {
    if (recarga) return;
    setRecarga(Date.now());
    if (novo) cenaRef.current?.reagir(tipo); else motorRef.current?.reagir(tipo);
  };
  const icone = 'grid h-7 w-7 place-items-center rounded-full text-white/80 hover:bg-white/15 hover:text-white';

  return (
    <>
      {barraTeste && <div className="cds-palco fixed left-1/2 top-2 z-[92] max-w-[calc(100vw-16px)] -translate-x-1/2 overflow-hidden rounded-xl border border-[#ffd84d]/30 bg-[#0b1022]/95 text-[#e8eefc] shadow-xl">{barraTeste}</div>}
      {grande && <div className="fixed inset-0 z-[89] bg-black/55" onClick={() => setGrande(false)} aria-hidden="true" />}
      <div className={cn('cds-palco cds-entra fixed z-[90]',
          grande
            ? 'left-1/2 top-1/2 h-[min(780px,calc(100dvh-24px))] w-[min(1280px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl'
            : 'bottom-3 right-3 h-[min(450px,calc(100dvh-24px))] w-[min(760px,calc(100vw-24px))] rounded-2xl max-sm:bottom-0 max-sm:right-0 max-sm:h-[58dvh] max-sm:w-full max-sm:rounded-b-none')}>
      {/* as reações, do lado de fora da janela, para chamar o clique */}
      {tela === 'lobby' && (
        <div className="absolute bottom-4 right-full mr-3 flex flex-col gap-2.5 max-sm:bottom-full max-sm:left-3 max-sm:right-auto max-sm:mb-2 max-sm:mr-0 max-sm:flex-row">
          {REACOES.map(([tipo, rotulo, emoji, cor]) => (
            <button key={tipo} type="button" onClick={() => reagir(tipo)} aria-label={rotulo} title={rotulo} aria-disabled={!!recarga}
              className={cn('cds-reacao relative grid h-14 w-14 place-items-center overflow-hidden rounded-full text-[26px] shadow-[0_8px_22px_rgba(0,0,0,.45)] ring-2 ring-white/70 transition-transform hover:scale-110 active:scale-90 max-sm:h-12 max-sm:w-12', recarga && 'opacity-60')}
              style={{ background: cor }}>
              <span aria-hidden="true">{emoji}</span>
              {recarga > 0 && <i key={recarga} className="cds-recarga pointer-events-none absolute inset-0 bg-black/45" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
      <div role="dialog" aria-label={NOME_CORRIDA}
        className={cn('flex h-full w-full flex-col overflow-hidden border border-white/15 bg-[#070a16] text-[#e8eefc] shadow-[0_18px_50px_rgba(0,0,0,.55)]', grande ? 'rounded-2xl' : 'rounded-2xl max-sm:rounded-b-none')}>
        {/* a barrinha de cima: só o essencial */}
        <div className="flex h-10 shrink-0 items-center gap-2 bg-black/70 pl-3 pr-1.5 text-[13px] font-semibold tracking-wide">
          <i className="cds-ao-vivo inline-block h-2 w-2 shrink-0 rounded-full bg-[#ff4d5e]" aria-hidden="true" />
          <span className="min-w-0 truncate uppercase">{status}</span>
          <span className="ml-auto flex items-center gap-0.5">
            {/* o volume: arrastar a barra (0% é sem som); 100% aqui é o teto do motor (VOL_TETO, 20% do som cheio) */}
            <span className="mx-1 flex items-center gap-2 rounded-full bg-white/10 py-1 pl-2.5 pr-3 text-[12px]">
              <span ref={eqRef} className="cds-eq max-sm:hidden" aria-hidden="true">
                {Array.from({ length: BARRAS_EQ }, (_, i) => <i key={i} />)}
              </span>
              {volPct === 0 ? <VolumeX className="h-3.5 w-3.5 shrink-0 text-white/70" aria-hidden="true" /> : <Volume2 className="h-3.5 w-3.5 shrink-0 text-white/70" aria-hidden="true" />}
              <input type="range" min={0} max={100} step={1} value={volPct} aria-label="Volume" className="cds-volume"
                style={{ ['--v' as string]: `${volPct}%` }}
                onChange={ev => { const v = Number(ev.target.value); ajusta((v / 100) * VOL_TETO, v === 0); }} />
              <span className="w-8 text-right tabular-nums">{volPct}%</span>
            </span>
            {euCorro && naCorrida && (
              <button type="button" onClick={() => setSeguindo(s => !s)} aria-pressed={seguindo} title={seguindo ? 'Seguindo o meu' : 'Seguir o meu bichinho'}
                className={cn(icone, seguindo && 'bg-[#ffd84d] text-[#1b1405] hover:bg-[#ffd84d] hover:text-[#1b1405]')}>
                <Crosshair className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <button type="button" className={cn(icone, 'max-sm:hidden')} onClick={() => setGrande(g => !g)} title={grande ? 'Diminuir' : 'Ampliar'}>
              {grande ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button type="button" className={icone} onClick={onFechar} title="Fechar" aria-label="Fechar a corrida"><X className="h-4 w-4" /></button>
          </span>
        </div>

        {/* o palco */}
        <div className="relative min-h-0 flex-1 bg-[#070a16]">
          <canvas ref={pistaRef} className="absolute inset-0 h-full w-full" aria-label="A pista da corrida" />
          <video ref={festaRef} className="cds-video" muted playsInline preload="auto" hidden aria-label="O replay da chegada e a festa de quem venceu" />
          <video ref={loopRef} className="cds-video" muted playsInline preload="auto" loop hidden aria-hidden="true" />
          <canvas ref={cerimoniaRef} className={cn('absolute inset-0 h-full w-full', novo && 'invisible')} aria-label="O lobby, a contagem e o sorteio do mapa" />
          {novo && (
            <LobbyNovo tema={tema as Exclude<TemaLobby, 'atual'>} corridaId={corrida.id} pessoas={noGrid} eu={eu} premio={corrida.premio}
              iniciaEm={segundos(corrida.inicia_em)} agora={agora} palpite={palpite} onPalpite={id => onPalpite?.(id)}
              aoCena={c => { cenaRef.current = c; }} />
          )}
        </div>
      </div>
      </div>
    </>
  );
}
