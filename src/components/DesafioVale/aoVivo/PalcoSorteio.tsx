/**
 * O palco do sorteio ao vivo (26/11/2026): a mesma cena, no mesmo segundo,
 * para toda a plateia. A cena sai de `cenaDoShow` (estado do banco + relógio
 * do banco); aqui é só desenho e som.
 *
 * Nada de `prefers-reduced-motion` de propósito: os PCs da operação vêm com
 * «reduzir animações» ligado no Windows (a mesma decisão da Corrida).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dices, Eye, Minus, PartyPopper, Play, Square, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { agoraBanco } from '@/components/Corrida/banco';
import { HotDog } from '@/components/DesafioVale/HotDog';
import { cenaDoShow, ganhadoresMostrados, type Cena, type PessoaDoShow, type ShowJson } from './linhaDoTempo';
import { comecarSorteio, encerrarSorteio, mensagemDoErro, vigiarRevelacao } from './banco';
import { gravarMudo, lerMudo, tocar } from './som';
import './sorteio-ao-vivo.css';

interface Props {
  show: ShowJson;
  eu: string | null;
  superAdmin: boolean;
  onMinimizar: () => void;
}

const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const primeiroNome = (nome: string) => nome.split(/\s+/)[0] ?? nome;

/** O relógio da cena: rápido enquanto algo se mexe, devagar parado. */
function useAgora(rapido: boolean): number {
  const [agora, setAgora] = useState(agoraBanco);
  useEffect(() => {
    const id = window.setInterval(() => setAgora(agoraBanco()), rapido ? 40 : 400);
    return () => window.clearInterval(id);
  }, [rapido]);
  return agora;
}

const emMovimento = (c: Cena) => c.fase === 'preparando' || c.fase === 'contagem' || c.fase === 'sorteando' || (c.fase === 'revelando' && !c.parado);

export default function PalcoSorteio({ show, eu, superAdmin, onMinimizar }: Props) {
  const [rapido, setRapido] = useState(true);
  const agora = useAgora(rapido);
  const cena = cenaDoShow(show, agora);
  const movendo = emMovimento(cena);
  useEffect(() => { setRapido(movendo || show.estado === 'contagem'); }, [movendo, show.estado]);

  // Quem pede o resultado: o super_admin na hora; os outros, se o aviso não vier.
  useEffect(() => vigiarRevelacao(show, superAdmin), [show, superAdmin]);

  const [mudo, setMudo] = useState(lerMudo);
  useSons(cena);

  const mostrados = ganhadoresMostrados(show, cena);
  const ganhei = !!eu && mostrados.some(g => g.perfil_id === eu);
  const fotos = useMemo(() => new Map(show.concorrentes.map(c => [c.perfil_id, c.foto ?? null])), [show.concorrentes]);

  return (
    <div className="sav-fundo" role="dialog" aria-modal="true" aria-label={`Sorteio ao vivo do ${show.setor_nome ?? 'setor'}`}>
      <div className={cn('sav-palco', ganhei && 'sav-ganhei')}>
        <header className="sav-topo">
          <span className="sav-aovivo"><i aria-hidden /> AO VIVO</span>
          <strong className="sav-titulo">Sorteio do {show.premio} · {show.setor_nome}</strong>
          <span className="sav-plateia" title="Assistindo agora (quem foi chamado)"><Eye size={14} aria-hidden /> {Math.max(0, show.plateia - 1)}</span>
          <button type="button" className="sav-icone" onClick={() => { const v = !mudo; setMudo(v); gravarMudo(v); }} aria-label={mudo ? 'Ligar o som' : 'Tirar o som'}>
            {mudo ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button type="button" className="sav-icone" onClick={onMinimizar} aria-label="Minimizar"><Minus size={16} /></button>
        </header>

        {superAdmin && <ControlesDoSuperAdmin show={show} />}

        <div className="sav-cena">
          <Centro show={show} cena={cena} eu={eu} fotos={fotos} />
        </div>

        {mostrados.length > 0 && cena.fase !== 'final' && (
          <ol className="sav-ja">
            {mostrados.map(g => (
              <li key={g.perfil_id} className={cn(g.perfil_id === eu && 'eu')}><b>{g.posicao}º</b> {g.nome}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Centro({ show, cena, eu, fotos }: { show: ShowJson; cena: Cena; eu: string | null; fotos: Map<string, string | null> }) {
  const n = show.qtd;
  if (cena.fase === 'aguardando' || cena.fase === 'preparando') {
    return (
      <div className="sav-espera">
        <HotDog className="sav-hotdog" />
        <p className="sav-grande">{cena.fase === 'preparando' ? 'Prepare-se!' : `${n} ${n === 1 ? 'ganhador' : 'ganhadores'}`}</p>
        <p className="sav-sub">{cena.fase === 'preparando' ? 'O sorteio vai começar…' : 'Aguardando o sorteio começar'}<span className="sav-reticencias" aria-hidden /></p>
        <Concorrentes lista={show.concorrentes} eu={eu} />
      </div>
    );
  }
  if (cena.fase === 'contagem') {
    const r = 54, volta = 2 * Math.PI * r;
    return (
      <div className="sav-contagem">
        <svg viewBox="0 0 120 120" className="sav-anel" aria-hidden>
          <circle cx="60" cy="60" r={r} className="sav-anel-fundo" />
          <circle cx="60" cy="60" r={r} className="sav-anel-frente" strokeDasharray={volta} strokeDashoffset={volta * (1 - cena.fracao)} />
        </svg>
        <span key={cena.numero} className="sav-numero">{cena.numero}</span>
        <p className="sav-sub">Valendo {show.premio} no {show.setor_nome}!</p>
      </div>
    );
  }
  if (cena.fase === 'sorteando' || (cena.fase === 'revelando' && !cena.parado)) {
    const posicao = cena.fase === 'revelando' ? cena.indice + 1 : (show.ganhadores?.length ? 1 : null);
    return (
      <div className="sav-rolo-caixa">
        <p className="sav-sub"><Dices size={16} aria-hidden /> Sorteando{posicao ? ` o ${posicao}º ganhador` : ''}…</p>
        <div className="sav-rolo">
          <span key={cena.nome ?? ''} className="sav-rolo-nome">{cena.nome ?? '…'}</span>
        </div>
      </div>
    );
  }
  if (cena.fase === 'revelando') {
    const g = show.ganhadores![cena.indice];
    const sou = g.perfil_id === eu;
    return <Vencedor nome={g.nome} posicao={g.posicao} foto={g.foto ?? fotos.get(g.perfil_id) ?? null} sou={sou} premio={show.premio} />;
  }
  // final
  const g = show.ganhadores ?? [];
  const ganhei = g.some(x => x.perfil_id === eu);
  return (
    <div className="sav-final">
      {ganhei && <p className="sav-voce"><PartyPopper size={22} aria-hidden /> Você ganhou o {show.premio}!</p>}
      <p className="sav-grande">Ganhadores do {show.setor_nome}</p>
      <ol className="sav-podio">
        {g.map(x => (
          <li key={x.perfil_id} className={cn(x.perfil_id === eu && 'eu')}>
            <Rosto nome={x.nome} foto={x.foto ?? fotos.get(x.perfil_id) ?? null} />
            <b>{x.posicao}º</b> <span>{x.nome}</span>
          </li>
        ))}
      </ol>
      {g.length === 0 && <p className="sav-sub">Ninguém concorrendo.</p>}
      <Confete />
    </div>
  );
}

function Vencedor({ nome, posicao, foto, sou, premio }: { nome: string; posicao: number; foto: string | null; sou: boolean; premio: string }) {
  return (
    <div className="sav-vencedor" key={nome}>
      <div className="sav-raios" aria-hidden />
      <Rosto nome={nome} foto={foto} grande />
      <p className="sav-pos">{posicao}º ganhador</p>
      <p className="sav-nome-vencedor">{nome}</p>
      <p className="sav-sub">{sou ? <strong className="sav-voce-curto">É VOCÊ! 🎉</strong> : <>Leva o {premio}! 🎉</>}</p>
      <Confete />
    </div>
  );
}

function Rosto({ nome, foto, grande }: { nome: string; foto: string | null; grande?: boolean }) {
  const [erro, setErro] = useState(false);
  return foto && !erro
    ? <img src={foto} alt="" className={cn('sav-rosto', grande && 'grande')} onError={() => setErro(true)} />
    : <span className={cn('sav-rosto sav-iniciais', grande && 'grande')}>{iniciais(nome)}</span>;
}

/** Quem concorre: um holofote passeia pelos nomes (não quer dizer nada — o ganhador nem existe ainda). */
function Concorrentes({ lista, eu }: { lista: PessoaDoShow[]; eu: string | null }) {
  const [luz, setLuz] = useState(0);
  useEffect(() => {
    if (lista.length < 2) return;
    const id = window.setInterval(() => setLuz(i => (i + 1) % lista.length), 650);
    return () => window.clearInterval(id);
  }, [lista.length]);
  if (!lista.length) return <p className="sav-sub">Ninguém com cupom ainda.</p>;
  return (
    <>
      <p className="sav-mini">{lista.length} concorrendo</p>
      <ul className="sav-lista">
        {lista.map((c, i) => (
          <li key={c.perfil_id} className={cn(i === luz && 'luz', c.perfil_id === eu && 'eu')} title={c.nome}>
            <Rosto nome={c.nome} foto={c.foto ?? null} /> {primeiroNome(c.nome)}{c.perfil_id === eu ? ' (você)' : ''}
          </li>
        ))}
      </ul>
    </>
  );
}

const CORES = ['#f97316', '#facc15', '#ef4444', '#22c55e', '#3b82f6', '#ec4899'];
function Confete() {
  const pecas = useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    x: Math.random() * 100, d: Math.random() * 0.6, t: 1.6 + Math.random() * 1.4, r: Math.random() * 360, c: CORES[i % CORES.length],
  })), []);
  return (
    <div className="sav-confete" aria-hidden>
      {pecas.map((p, i) => (
        <i key={i} style={{ left: `${p.x}%`, background: p.c, animationDelay: `${p.d}s`, animationDuration: `${p.t}s`, transform: `rotate(${p.r}deg)` }} />
      ))}
    </div>
  );
}

function ControlesDoSuperAdmin({ show }: { show: ShowJson }) {
  const [ocupado, setOcupado] = useState(false);
  const fazer = async (f: () => Promise<void>) => {
    setOcupado(true);
    try { await f(); } catch (e) { toast.error(mensagemDoErro(e)); } finally { setOcupado(false); }
  };
  return (
    <div className="sav-controles">
      <span>Só você vê estes botões.</span>
      {show.estado === 'aberto' && (
        <button type="button" className="sav-botao sav-botao-vai" disabled={ocupado || !show.concorrentes.length} onClick={() => fazer(() => comecarSorteio(show.id))}>
          <Play size={14} aria-hidden /> Começar a contagem
        </button>
      )}
      <button type="button" className="sav-botao" disabled={ocupado} onClick={() => fazer(() => encerrarSorteio(show.id))}>
        <Square size={13} aria-hidden /> {show.estado === 'revelado' ? 'Encerrar (fecha para todos)' : 'Cancelar o sorteio'}
      </button>
    </div>
  );
}

/** Os sons acompanham a cena: um bipe por número, o tique do rolo, a festa ao parar. */
function useSons(cena: Cena) {
  const ultimo = useRef<string>('');
  const chave = cena.fase === 'contagem' ? `c${cena.numero}`
    : cena.fase === 'sorteando' ? `s${cena.nome}`
      : cena.fase === 'revelando' ? `r${cena.indice}${cena.parado ? 'p' : cena.nome}` : cena.fase;
  useEffect(() => {
    const antes = ultimo.current;
    ultimo.current = chave;
    if (!antes || antes === chave) return;
    if (cena.fase === 'contagem') tocar('conta');
    else if (cena.fase === 'sorteando') tocar(antes.startsWith('c') ? 'vai' : 'rolo');
    else if (cena.fase === 'revelando') tocar(cena.parado ? 'ganhou' : 'rolo');
  }, [chave, cena]);
}
