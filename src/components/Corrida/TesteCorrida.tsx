/**
 * TesteCorrida — o teste do super admin: uma corrida inteira só na tela dele,
 * sem banco e sem ninguém mais ver (como o teste da chefona da Caça). Pessoas
 * de mentira entram no lobby, ele grava, larga e vê a festa, com a música e
 * tudo. A gravação aqui é a mesma do botão de verdade, só não sobe.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FastForward, Flag, Music, Play, RotateCcw, Video } from 'lucide-react';
import { useAuthOpcional } from '@/hooks/useAuth';
import { PalcoCorrida } from './PalcoCorrida';
import { bichinhoDe } from './motor/bichinhos';
import type { Gravacao, Motor, VideosDaFesta } from './motor/motor';
import type { CorridaJson, PessoaJson } from './banco';
import type { Palpite, TemaLobby } from './lobbies/cena';

const NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elaine', 'Felipe', 'Gabriela', 'Hugo', 'Isabela', 'João', 'Larissa', 'Marcos', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Sabrina', 'Thiago', 'Vanessa', 'Wesley', 'Yasmin', 'Caio', 'Débora', 'Fábio', 'Helena', 'Igor', 'Juliana', 'Lucas'];
const SETORES = ['Recuperação', 'Receptivo', 'Cartões', 'Veículos', 'Conecta Play'];
const agoraLocal = () => Date.now() / 1000;
const iso = (s: number) => new Date(s * 1000).toISOString();

interface Props {
  premio: string; onFechar: () => void;
  /** Só no laboratório: o cenário, se você corre ou só assiste, e o palpite de mentira. */
  tema?: TemaLobby; visao?: 'corredor' | 'torcida'; palpiteDemo?: boolean;
}

export default function TesteCorrida({ premio, onFechar, tema, visao = 'corredor', palpiteDemo }: Props) {
  const auth = useAuthOpcional();
  const eu = auth?.user?.id ?? 'eu-no-teste';
  const meuNome = (auth?.perfil as { nome?: string } | null | undefined)?.nome ?? 'Você';
  const minhaFoto = (auth?.perfil as { foto_url?: string | null } | null | undefined)?.foto_url ?? null;
  const motorRef = useRef<Motor | null>(null);
  const [abertaEm, setAbertaEm] = useState(() => agoraLocal());
  const [iniciaEm, setIniciaEm] = useState<number | null>(null);
  const [gravacao, setGravacao] = useState<{ rec: Gravacao; faixa: string[]; parada: number } | null>(null);
  const [videos, setVideos] = useState<VideosDaFesta | null>(null);
  const [gravando, setGravando] = useState<number | null>(null);
  const [, tique] = useState(0);
  const ID = -1;

  // Pessoas de mentira (e você, correndo), entrando no lobby aos poucos.
  const base = useMemo<PessoaJson[]>(() => {
    const lista: PessoaJson[] = NOMES.map((nome, i) => ({
      usuario: `teste-${i}`, nome: `${nome} ${String.fromCharCode(65 + (i * 7) % 26)}.`, setor: SETORES[i % SETORES.length], foto: null as string | null,
      corre: i % 3 !== 2, assiste: true, escolha: i % 3, entrou_em: null as string | null,
    }));
    // e uma torcida maior, só assistindo
    NOMES.forEach((nome, i) => lista.push({
      usuario: `torcida-${i}`, nome: `${nome} ${String.fromCharCode(66 + (i * 5) % 24)}.`, setor: SETORES[(i + 2) % SETORES.length], foto: null,
      corre: false, assiste: true, escolha: null, entrou_em: null,
    }));
    lista.unshift({ usuario: eu, nome: meuNome, setor: SETORES[0], foto: minhaFoto, corre: visao === 'corredor', assiste: true, escolha: 0, entrou_em: null });
    return lista;
  }, [eu, meuNome, minhaFoto, visao]);
  const atrasos = useMemo(() => base.map((p, i) => (p.usuario === eu ? 0 : 1 + ((i * 2.7) % 22))), [base, eu]);
  useEffect(() => { const id = window.setInterval(() => tique(n => n + 1), 1000); return () => window.clearInterval(id); }, []);
  const agora = agoraLocal();
  // Um em cada quatro corredores só escolhe o bichinho 6 s depois de entrar: o grid enche aos poucos.
  const pessoas = base.map((p, i) => {
    const t = agora - abertaEm - atrasos[i];
    if (t < 0) return p.corre && i % 4 === 3 ? { ...p, escolha: null } : p;
    return { ...p, entrou_em: iso(abertaEm + atrasos[i]), escolha: p.corre && i % 4 === 3 && t < 6 ? null : p.escolha };
  });

  const corrida: CorridaJson = {
    id: ID, nome: 'Teste', premio: premio || null, estado: iniciaEm ? 'correndo' : 'aberta', versao: 1,
    criada_em: iso(abertaEm), aberta_em: iso(abertaEm), gravada_em: gravacao ? iso(abertaEm) : null, inicia_em: iniciaEm ? iso(iniciaEm) : null,
    encerrada_em: null, gravacao: null, vencedor: null, vencedor_nome: null,
    corredores: base.filter(p => p.corre).length, chamados: base.length, escolheram: pessoas.filter(p => p.corre && p.escolha != null).length, no_lobby: pessoas.filter(p => p.entrou_em).length,
  };

  // O palpite de mentira: votos que vão chegando sozinhos, e o seu clique.
  const [palpite, setPalpite] = useState<Palpite>({ ativo: !!palpiteDemo, meu: null, votos: {} });
  useEffect(() => {
    setPalpite(p => ({ ...p, ativo: !!palpiteDemo }));
    if (!palpiteDemo) return;
    const id = window.setInterval(() => setPalpite(p => {
      const ids = base.filter(x => x.corre).map(x => x.usuario), alvo = ids[Math.floor(Math.random() * ids.length)];
      return alvo ? { ...p, votos: { ...p.votos, [alvo]: (p.votos[alvo] ?? 0) + 1 } } : p;
    }), 1400);
    return () => window.clearInterval(id);
  }, [palpiteDemo, base]);
  const apostar = (id: string) => setPalpite(p => {
    if (p.meu === id) return p;
    const votos = { ...p.votos, [id]: (p.votos[id] ?? 0) + 1 };
    if (p.meu) votos[p.meu] = Math.max(0, (votos[p.meu] ?? 1) - 1);
    return { ...p, meu: id, votos };
  });

  const limparVideos = useCallback(() => { setVideos(v => { if (v) { URL.revokeObjectURL(v.festa); URL.revokeObjectURL(v.loop); } return null; }); }, []);
  useEffect(() => () => limparVideos(), [limparVideos]);

  const gravar = async () => {
    const m = motorRef.current; if (!m) return;
    setGravando(0); limparVideos(); setGravacao(null); setIniciaEm(null);
    try {
      const r = await m.gravar({
        pessoas: base.filter(p => p.corre).map(p => ({ id: p.usuario, nome: p.nome, setor: p.setor, foto: p.foto, est: bichinhoDe(ID, p.usuario, p.escolha) })),
        premio: premio || null, aoProgresso: f => setGravando(f),
      });
      if (!r) return;
      setGravacao({ rec: r.rec, faixa: r.faixa, parada: r.parada });
      if (r.video) setVideos({ festa: URL.createObjectURL(r.video.festa), loop: URL.createObjectURL(r.video.loop), cues: r.video.cues, dur: r.video.dur });
    } finally { setGravando(null); }
  };

  const durShow = 7.2 + 1.9 + 3.8 + 0.55; // a caixa, o pouso, a abertura e a saída (sem contagem: ver DUR no motor)
  const btn = 'flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-[13px] font-semibold hover:border-[#ffd84d] disabled:opacity-40';
  const barra = (
    <div className="flex flex-wrap items-center gap-2 border-b border-[#ffd84d]/30 bg-[#ffd84d]/10 px-4 py-2 text-[13px]">
      <span className="font-bold uppercase tracking-wider text-[#ffd84d]">Teste · só na sua tela</span>
      <button type="button" className={btn} onClick={() => { setAbertaEm(agoraLocal()); setIniciaEm(null); }}><RotateCcw className="h-3.5 w-3.5" /> Lobby do zero</button>
      <button type="button" className={btn} disabled={!!iniciaEm} onClick={() => setAbertaEm(agoraLocal() - 15)}><Music className="h-3.5 w-3.5" /> Música agora</button>
      <button type="button" className={btn} disabled={gravando != null} onClick={() => void gravar()}><Video className="h-3.5 w-3.5" /> {gravando != null ? `Gravando ${Math.round(gravando * 100)}%` : gravacao ? 'Gravar de novo' : 'Gravar'}</button>
      <button type="button" className={btn} disabled={!gravacao || gravando != null} onClick={() => setIniciaEm(agoraLocal() + 3)}><Play className="h-3.5 w-3.5" /> Largar</button>
      <button type="button" className={btn} disabled={!gravacao || gravando != null} onClick={() => setIniciaEm(agoraLocal() - durShow - Math.max(0, (gravacao?.rec.tVenc ?? 10) - 6))}><FastForward className="h-3.5 w-3.5" /> Ir para a chegada</button>
      <button type="button" className={btn} disabled={!gravacao || gravando != null} onClick={() => setIniciaEm(agoraLocal() - durShow)}><Flag className="h-3.5 w-3.5" /> Pular a abertura</button>
    </div>
  );

  return (
    <PalcoCorrida corrida={corrida} pessoas={pessoas} eu={eu} agora={agoraLocal}
      gravacao={gravacao} videos={videos} onFechar={onFechar} barraTeste={barra}
      aoMotor={m => { motorRef.current = m; }} tema={tema} palpite={palpite} onPalpite={apostar} />
  );
}
