/**
 * PalcoCorrida — a tela cheia onde se assiste à corrida: o lobby (o estádio),
 * a contagem, a caixa dos mapas, a corrida e a festa de quem venceu.
 *
 * Este arquivo só existe no pacote quando alguém abre a corrida (ver
 * `index.tsx`). Quem desenha é o motor (`motor/motor.js`); aqui ficam o que é
 * HTML: o cabeçalho, o player da música, as reações, o placar e a narração.
 *
 * O mesmo palco serve à corrida de verdade (`PalcoAoVivo`, com o banco) e ao
 * teste do super admin (`TesteCorrida`, sem banco): quem usa passa a corrida,
 * as pessoas e o relógio.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Heart, Minus, PartyPopper, Plus, Hand, Megaphone, Volume2, VolumeX, X, Crosshair, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { criarMotor, type Gravacao, type Motor, type Painel, type VideosDaFesta } from './motor/motor';
import { bichinhoDe, thumb } from './motor/bichinhos';
import { segundos, type CorridaJson, type PessoaJson } from './banco';
import { NOME_CORRIDA, SONS, audioDestravado } from './nome';
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
  /** Os botões do teste do super admin (só no teste). */
  barraTeste?: ReactNode;
  /** Recebe o motor quando ele nasce (o teste usa para gravar). */
  aoMotor?: (motor: Motor | null) => void;
}

const FONTES = ['Racing Sans One', 'Saira Condensed', 'Rubik', 'IBM Plex Mono', 'Pirata One', 'Orbitron', 'Cinzel Decorative', 'Metal Mania', 'Press Start 2P'];
const BARRAS_EQ = 14;
const fmtMs = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

export function PalcoCorrida({ corrida, pessoas, eu, agora, gravacao, videos, onFechar, barraTeste, aoMotor }: PalcoProps) {
  const pistaRef = useRef<HTMLCanvasElement>(null);
  const cerimoniaRef = useRef<HTMLCanvasElement>(null);
  const festaRef = useRef<HTMLVideoElement>(null);
  const loopRef = useRef<HTMLVideoElement>(null);
  const eqRef = useRef<HTMLSpanElement>(null);
  const motorRef = useRef<Motor | null>(null);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [seguindo, setSeguindo] = useState(false);
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

  useEffect(() => {
    motorRef.current?.setPessoas(pessoas.map(p => ({
      id: p.usuario, nome: p.nome, setor: p.setor, foto: p.foto, corre: p.corre, assiste: p.assiste,
      est: p.corre ? bichinhoDe(corrida.id, p.usuario, p.escolha) : null,
      entrouEm: segundos(p.entrou_em), escolhidaEm: null as number | null,
    })));
  }, [pessoas, corrida.id]);

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
  const euCorro = useMemo(() => pessoas.some(p => p.usuario === eu && p.corre), [pessoas, eu]);
  const naCorrida = tela === 'corrida' || tela === 'festa' || tela === 'video';
  const noLobby = pessoas.filter(p => p.entrou_em).length;
  const chegaram = useMemo(() => pessoas.filter(p => p.entrou_em).sort((a, b) => (b.entrou_em ?? '').localeCompare(a.entrou_em ?? '')).slice(0, 8), [pessoas]);

  const status = (() => {
    if (corrida.estado === 'cancelada') return 'A corrida foi cancelada';
    if (tela === 'lobby') {
      const p = corrida.aberta_em ? agora() - (segundos(corrida.aberta_em) ?? 0) : 0;
      return corrida.inicia_em ? 'Largada em instantes' : p < 15 ? 'Lobby aberto · a música já vai começar' : 'Lobby aberto · esperando a largada';
    }
    if (tela === 'show') return painel?.show?.fase === 'contagem' ? 'Contagem para o sorteio do mapa' : 'Sorteio do mapa';
    if (tela === 'carregando') return 'Carregando a corrida';
    if (tela === 'corrida') return `Ao vivo · ${fmtMs(painel?.tempo ?? 0)}`;
    if (tela === 'festa' || tela === 'video') return painel?.vencedor ? `${painel.vencedor.nome} venceu!` : 'Chegada';
    return '';
  })();

  const mus = painel?.musica;
  const vol = painel?.volume ?? { max: 0.2, mudo: false };
  const mostraPlayer = tela === 'lobby' || tela === 'show' || tela === 'festa' || tela === 'video';
  const ajusta = (max: number, mudo: boolean) => motorRef.current?.volume(Math.round(max * 100) / 100, mudo);

  return (
    <div className="cds-palco fixed inset-0 z-[90] flex items-center justify-center bg-[#04060d]/85 p-2 sm:p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={NOME_CORRIDA}>
      <div className="cds-entra flex h-[min(920px,calc(100dvh-16px))] w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b1022] text-[#e8eefc] shadow-2xl">
        {/* cabeçalho */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 px-4 py-2.5">
          <span className="cds-xadrez h-5 w-7 shrink-0 rounded-sm" aria-hidden="true" />
          <h2 className="cds-titulo text-xl -skew-x-6 text-[#fff6e6] [text-shadow:2px_2px_0_#e2343f]">{NOME_CORRIDA}</h2>
          {corrida.premio && (
            <span className="flex items-center gap-1 rounded-full bg-gradient-to-b from-[#ffe68a] to-[#e0a92a] px-2.5 py-0.5 text-[13px] font-bold text-[#2a1a02]">
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> Prêmio: {corrida.premio}
            </span>
          )}
          <span className="flex items-center gap-1.5 text-[13px] text-[#9fb0d8]">
            {(tela === 'corrida' || tela === 'lobby') && <i className="cds-ao-vivo inline-block h-2 w-2 rounded-full bg-[#ff4d5e]" aria-hidden="true" />}
            {status}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {euCorro && naCorrida && (
              <button type="button" onClick={() => setSeguindo(s => !s)} aria-pressed={seguindo}
                className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors', seguindo ? 'border-[#ffd84d] bg-[#ffd84d] text-[#1b1405]' : 'border-white/20 hover:border-[#ffd84d]')}>
                <Crosshair className="h-3.5 w-3.5" aria-hidden="true" /> {seguindo ? 'Seguindo o meu' : 'Seguir o meu bichinho'}
              </button>
            )}
            <button type="button" onClick={onFechar} className="rounded-full p-1.5 text-[#9fb0d8] hover:bg-white/10 hover:text-white" aria-label="Fechar a corrida">
              <X className="h-5 w-5" />
            </button>
          </span>
        </div>
        {barraTeste}

        <div className="flex min-h-0 flex-1">
          {/* o palco */}
          <div className="relative min-h-[320px] min-w-0 flex-1 bg-[#070a16]">
            <canvas ref={pistaRef} className="absolute inset-0 h-full w-full" aria-label="A pista da corrida" />
            <video ref={festaRef} className="cds-video" muted playsInline preload="auto" hidden aria-label="O replay da chegada e a festa de quem venceu" />
            <video ref={loopRef} className="cds-video" muted playsInline preload="auto" loop hidden aria-hidden="true" />
            <canvas ref={cerimoniaRef} className="absolute inset-0 h-full w-full" aria-label="O lobby, a contagem e o sorteio do mapa" />

            {tela === 'lobby' && (
              <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
                {([['palmas', 'Aplaudir', Hand], ['torcer', 'Torcer', Megaphone], ['coracao', 'Coração', Heart], ['ola', 'Puxar a ola', PartyPopper]] as const).map(([tipo, rotulo, Icone]) => (
                  <button key={tipo} type="button" onClick={() => motorRef.current?.reagir(tipo)} aria-label={rotulo} title={rotulo}
                    className="flex items-center gap-1.5 rounded-full border border-[#a0b4e6]/30 bg-[#0a0e1c]/90 px-3 py-1.5 text-[14px] font-semibold tracking-wide hover:border-[#ffd84d] hover:text-[#ffd84d]">
                    <Icone className="h-3.5 w-3.5" aria-hidden="true" /> <span className="max-[480px]:hidden">{rotulo}</span>
                  </button>
                ))}
              </div>
            )}

            <div className={cn('absolute bottom-3 right-3 flex max-w-[calc(100%-24px)] items-center gap-1.5 rounded-full border border-[#a0b4e6]/30 bg-[#0a0e1c]/90 py-1 pl-3 pr-1 text-[13px] font-semibold tracking-wide',
              !mostraPlayer && 'hidden', tela === 'lobby' && 'max-[640px]:bottom-14')}>
              <span className="text-[15px] text-[#ffd84d]" aria-hidden="true">♪</span>
              <span className="truncate uppercase max-[420px]:hidden">{mus?.qual === 'vitoria' ? 'Tema da Vitória' : 'Música do lobby'}</span>
              <span ref={eqRef} className="cds-eq mx-1" aria-hidden="true">
                {Array.from({ length: BARRAS_EQ }, (_, i) => <i key={i} />)}
              </span>
              <button type="button" className="grid h-7 w-7 place-items-center rounded-full bg-[#24304e] hover:bg-[#30406a] disabled:opacity-40" aria-label="Diminuir o volume"
                disabled={vol.max <= 0} onClick={() => ajusta(Math.max(0, vol.max - 0.02), false)}><Minus className="h-3.5 w-3.5" /></button>
              <span className="min-w-[38px] text-center tabular-nums" aria-live="polite">{vol.mudo ? 'mudo' : `${Math.round((mus?.tocando ? mus.pct : vol.max) * 100)}%`}</span>
              <button type="button" className="grid h-7 w-7 place-items-center rounded-full bg-[#24304e] hover:bg-[#30406a] disabled:opacity-40" aria-label="Aumentar o volume"
                disabled={vol.max >= 0.2 && !vol.mudo} onClick={() => ajusta(Math.min(0.2, vol.max + 0.02), false)}><Plus className="h-3.5 w-3.5" /></button>
              <button type="button" aria-pressed={vol.mudo} onClick={() => ajusta(vol.max, !vol.mudo)}
                className={cn('flex h-7 items-center gap-1 rounded-full px-2.5', vol.mudo ? 'bg-[#ffd84d] text-[#1b1405]' : 'bg-[#24304e] hover:bg-[#30406a]')}>
                {vol.mudo ? <VolumeX className="h-3.5 w-3.5" aria-hidden="true" /> : <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />} Mudo
              </button>
            </div>
          </div>

          {/* o lado: quem chegou (no lobby), o placar e a narração (na corrida) */}
          <aside className="hidden w-[280px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/10 p-3 lg:flex">
            {!naCorrida ? (
              <>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg border border-white/10 py-2"><div className="text-xl font-bold tabular-nums">{noLobby}</div><div className="text-[11px] uppercase tracking-wider text-[#9fb0d8]">no lobby</div></div>
                  <div className="rounded-lg border border-white/10 py-2"><div className="text-xl font-bold tabular-nums">{pessoas.filter(p => p.corre).length}</div><div className="text-[11px] uppercase tracking-wider text-[#9fb0d8]">correndo</div></div>
                </div>
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#9fb0d8]">Chegando no lobby</h3>
                <ul className="space-y-1.5">
                  {chegaram.map(p => (
                    <li key={p.usuario} className="flex items-center gap-2 text-sm">
                      <Rosto pessoa={p} />
                      <span className="min-w-0 truncate">{p.usuario === eu ? 'Você' : p.nome}<small className="block truncate text-[11px] text-[#9fb0d8]">{p.setor ?? 'Sem setor'}</small></span>
                    </li>
                  ))}
                  {chegaram.length === 0 && <li className="text-sm text-[#9fb0d8]">Ninguém entrou ainda.</li>}
                </ul>
              </>
            ) : (
              <>
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#9fb0d8]">Ao vivo</h3>
                <ol className="space-y-1">
                  {(painel?.placar ?? []).map(l => (
                    <li key={l.pos} className={cn('flex items-center gap-2 rounded-md px-1.5 py-1 text-sm', l.voce && 'bg-[#ffd84d]/10 ring-1 ring-[#ffd84d]/40')}>
                      <span className="w-4 text-right font-bold tabular-nums text-[#9fb0d8]">{l.pos}</span>
                      <img src={thumb(l.est, 28)} alt="" className="h-7 w-7" />
                      <span className="min-w-0 truncate">{l.voce ? 'Você' : l.nome}<small className="block truncate text-[11px] text-[#9fb0d8]">{l.setor} · {l.onde}</small></span>
                    </li>
                  ))}
                </ol>
                <h3 className="mt-1 text-[11px] font-bold uppercase tracking-widest text-[#9fb0d8]">Narração</h3>
                <ul className="space-y-1.5 text-[13px] leading-snug">
                  {(painel?.narracao ?? []).map((n, i) => (
                    <li key={`${n.t}-${i}`} className={cn(i === 0 && 'text-white')}><span className="mr-1.5 tabular-nums text-[#9fb0d8]">{fmtMs(n.t)}</span>{n.txt}</li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Rosto({ pessoa }: { pessoa: PessoaJson }) {
  const [erro, setErro] = useState(false);
  const ini = pessoa.nome.split(/\s+/).filter(Boolean).map(s => s[0]).slice(0, 2).join('').toUpperCase();
  return pessoa.foto && !erro
    ? <img src={pessoa.foto} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" onError={() => setErro(true)} />
    : <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#24304e] text-[11px] font-bold">{ini || '?'}</span>;
}
