/**
 * PetWidget — o mascote no canto inferior direito da tela.
 * - Admin/super_admin: modo completo (alimentar, dormir, roupas).
 * - Demais cargos: ciclo automático de 5 min dormindo / 5 min acordado
 *   (sincronizado pelo relógio — todos veem a mesma fase) e quartinho
 *   em modo teaser ("Em breve").
 * - Acordado e de boa (qualquer cargo): passeia pelo rodapé parando em
 *   pontos aleatórios, dá pulinhos, e de vez em quando acontece um evento
 *   aleatório: videogame (~30s), borboleta passeando, moedinha caindo ou
 *   uma espreguiçada.
 * - Quando o usuário marca um acordo/parcela como pago (petEvents), a Aura
 *   comemora com confete e balãozinho — mesmo se estiver dormindo.
 * Estado local em localStorage — zero banco, zero realtime.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { cn } from '@/lib/utils';
import './pet.css';
import {
  usePetHabilitado, usePetInterativo, usePetDoTenant, petStorageKey,
  type PetHumor, type PetRoupa, type PetCena, type PetMicro,
} from './petConfig';
import { PET_EVENTO_COMEMORAR } from './petEvents';
import { PetAura } from './PetAura';
import { PetRolo } from './PetRolo';
import { PetQuartinho } from './PetQuartinho';

interface PetEstadoLocal { roupa?: PetRoupa; dormindo?: boolean }

type PetEvento = 'nenhum' | 'jogando' | 'borboleta' | 'moeda' | 'espreguica';

/** Área do passeio: até ALCANCE px à esquerda do canto. */
const ALCANCE = 190;
/** Velocidade da caminhada em px/s. */
const VELOCIDADE = 45;
/** Ciclo do teaser: 5 min acordado, 5 min dormindo (pelo relógio). */
const FASE_MS = 5 * 60_000;
/** Comemoração de acordo pago (confete + balãozinho). */
const COMEMORACAO_MS = 4_500;

/** Eventos aleatórios: duração e peso do sorteio (peso maior = mais comum). */
const EVENTOS: { tipo: Exclude<PetEvento, 'nenhum'>; duracaoMs: number; peso: number }[] = [
  { tipo: 'jogando',    duracaoMs: 30_000, peso: 3 },
  { tipo: 'borboleta',  duracaoMs: 14_000, peso: 2 },
  { tipo: 'moeda',      duracaoMs: 8_000,  peso: 2 },
  { tipo: 'espreguica', duracaoMs: 2_600,  peso: 2 },
];

function sortearEvento() {
  const total = EVENTOS.reduce((s, e) => s + e.peso, 0);
  let r = Math.random() * total;
  for (const e of EVENTOS) {
    r -= e.peso;
    if (r <= 0) return e;
  }
  return EVENTOS[0];
}

function faseAcordadaAgora(): boolean {
  return Math.floor(Date.now() / FASE_MS) % 2 === 0;
}

export function PetWidget() {
  const habilitado  = usePetHabilitado();
  const interativo  = usePetInterativo();
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const pet         = usePetDoTenant();
  const storageKey  = petStorageKey(empresa?.id, perfil?.id);

  const [aberto, setAberto] = useState(false);
  const [humor,  setHumor]  = useState<PetHumor>('idle');   // modo interativo
  const [micro,  setMicro]  = useState<PetMicro>('none');
  const [roupa,  setRoupa]  = useState<PetRoupa>('nenhuma');
  const [evento, setEvento] = useState<PetEvento>('nenhum');
  const [comemorando, setComemorando] = useState(false);
  const [acordadoTeaser, setAcordadoTeaser] = useState(faseAcordadaAgora);

  // ── Passeio pelo rodapé ────────────────────────────────────────────────
  const [x,       setX]       = useState(0);   // deslocamento (negativo = esquerda)
  const [durMove, setDurMove] = useState(0);   // duração da transição (s)
  const [movendo, setMovendo] = useState(false);
  const [dir,     setDir]     = useState<1 | -1>(1);
  const xRef       = useRef(0);
  const movendoRef = useRef(false);
  movendoRef.current = movendo;

  // Humor efetivo: interativo usa o humor manual; teaser segue o ciclo 5/5.
  // A comemoração passa por cima de tudo (até do sono — boa notícia acorda!).
  const humorBase: PetHumor = interativo
    ? humor
    : (acordadoTeaser ? 'idle' : 'dormindo');
  const humorEfetivo: PetHumor =
    comemorando ? 'comemorando'
    : humorBase === 'idle' && evento === 'jogando' ? 'jogando'
    : humorBase;
  const cena: PetCena =
    comemorando ? 'confete'
    : humorBase !== 'idle' ? 'nenhuma'
    : evento === 'borboleta' ? 'borboleta'
    : evento === 'moeda' ? 'moeda'
    : 'nenhuma';
  const microEfetivo: PetMicro =
    humorEfetivo === 'idle' && evento === 'espreguica' ? 'espreguica' : micro;
  const emEvento = evento !== 'nenhum' || comemorando;

  // Restaura roupa/sono persistidos (só no modo interativo)
  useEffect(() => {
    if (!interativo) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const s = JSON.parse(raw) as PetEstadoLocal;
      if (s.roupa)    setRoupa(s.roupa);
      if (s.dormindo) setHumor('dormindo');
    } catch { /* noop */ }
  }, [storageKey, interativo]);

  function persistir(estado: PetEstadoLocal) {
    try { localStorage.setItem(storageKey, JSON.stringify(estado)); } catch { /* noop */ }
  }

  // Ciclo 5/5 do teaser — checa a fase do relógio a cada 10s
  useEffect(() => {
    if (interativo) return;
    const t = setInterval(() => setAcordadoTeaser(faseAcordadaAgora()), 10_000);
    return () => clearInterval(t);
  }, [interativo]);

  // Comemoração: acordo/parcela marcado como pago em qualquer tela
  useEffect(() => {
    let dentro: ReturnType<typeof setTimeout> | null = null;
    const comemorar = () => {
      setComemorando(true);
      if (dentro) clearTimeout(dentro);
      dentro = setTimeout(() => setComemorando(false), COMEMORACAO_MS);
    };
    window.addEventListener(PET_EVENTO_COMEMORAR, comemorar);
    return () => {
      window.removeEventListener(PET_EVENTO_COMEMORAR, comemorar);
      if (dentro) clearTimeout(dentro);
    };
  }, []);

  // Micro-animação alternada: pulinho ocasional enquanto está "de boa" parado
  useEffect(() => {
    if (humorEfetivo !== 'idle' || movendo || aberto || emEvento) return;
    let dentro: ReturnType<typeof setTimeout> | null = null;
    const timer = setInterval(() => {
      setMicro('pulinho');
      dentro = setTimeout(() => setMicro('none'), 950);
    }, 9000 + Math.random() * 7000);
    return () => { clearInterval(timer); if (dentro) clearTimeout(dentro); };
  }, [humorEfetivo, movendo, aberto, emEvento]);

  // Passeio aleatório: anda até um ponto, para um tempinho, repete.
  useEffect(() => {
    if (aberto || humorEfetivo !== 'idle' || emEvento) { setMovendo(false); return; }
    let vivo = true;
    const ids: number[] = [];
    const agendar = (fn: () => void, ms: number) => {
      ids.push(window.setTimeout(() => { if (vivo) fn(); }, ms));
    };

    const passeio = () => {
      const alvo = -Math.round(Math.random() * ALCANCE);
      const dist = Math.abs(alvo - xRef.current);
      if (dist < 24) { agendar(passeio, 1200 + Math.random() * 3000); return; }
      const dur = dist / VELOCIDADE;
      setDir(alvo < xRef.current ? -1 : 1);
      setDurMove(dur);
      setMovendo(true);
      setX(alvo);
      xRef.current = alvo;
      // chegou → pausa aleatória (às vezes curta, "parou no meio do caminho")
      agendar(() => {
        setMovendo(false);
        agendar(passeio, 1500 + Math.random() * 6500);
      }, dur * 1000 + 80);
    };

    agendar(passeio, 2000 + Math.random() * 3000);
    return () => { vivo = false; ids.forEach(clearTimeout); };
  }, [aberto, humorEfetivo, emEvento]);

  // Eventos aleatórios: sorteia videogame / borboleta / moeda / espreguiçada.
  useEffect(() => {
    if (aberto || humorBase !== 'idle' || comemorando) { setEvento('nenhum'); return; }
    let vivo = true;
    const ids: number[] = [];
    const agendar = (fn: () => void, ms: number) => {
      ids.push(window.setTimeout(() => { if (vivo) fn(); }, ms));
    };

    const sortearSessao = () => {
      agendar(() => {
        // espera terminar o passinho atual para o evento começar parada
        if (movendoRef.current) { agendar(sortearSessao, 0); return; }
        const e = sortearEvento();
        setEvento(e.tipo);
        agendar(() => { setEvento('nenhum'); sortearSessao(); }, e.duracaoMs);
      }, 40_000 + Math.random() * 140_000);
    };

    sortearSessao();
    return () => { vivo = false; ids.forEach(clearTimeout); };
  }, [aberto, humorBase, comemorando]);

  function alimentar() {
    setHumor('feliz');
    setTimeout(() => setHumor('idle'), 1900);
  }

  function alternarSono() {
    setHumor(h => {
      const novo: PetHumor = h === 'dormindo' ? 'idle' : 'dormindo';
      persistir({ roupa, dormindo: novo === 'dormindo' });
      return novo;
    });
  }

  function trocarRoupa(r: PetRoupa) {
    setRoupa(r);
    persistir({ roupa: r, dormindo: humor === 'dormindo' });
  }

  function alternarPainel() {
    setAberto(v => {
      if (!v) {
        // Volta pro canto ao abrir o quartinho
        setDurMove(0.35);
        setMovendo(false);
        setX(0);
        xRef.current = 0;
      }
      return !v;
    });
  }

  if (!habilitado) return null;

  const PetSvg = pet.tipo === 'aura' ? PetAura : PetRolo;

  return (
    <div className="fixed bottom-2 right-3 z-40 flex flex-col items-end">
      <AnimatePresence>
        {aberto && (
          <PetQuartinho
            petNome={pet.nome}
            PetSvg={PetSvg}
            humor={humorEfetivo}
            roupa={roupa}
            modoTeaser={!interativo}
            onAlimentar={alimentar}
            onAlternarSono={alternarSono}
            onSetRoupa={trocarRoupa}
            onClose={() => setAberto(false)}
          />
        )}
      </AnimatePresence>

      <div className="relative" style={{ transform: `translateX(${x}px)`, transition: `transform ${durMove}s linear` }}>
        {/* balãozinho da comemoração */}
        {comemorando && !aberto && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-card border border-border text-foreground text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-md">
            Acordo pago! 🎉
          </div>
        )}
        <button
          type="button"
          onClick={alternarPainel}
          title={`${pet.nome} — clique para abrir`}
          aria-label={`Abrir o quartinho de ${pet.nome}`}
          className="relative w-24 h-24 text-black/70 dark:text-white/60 hover:scale-105 transition-transform cursor-pointer bg-transparent border-0 p-0"
        >
          {/* flip na direção da caminhada; passinhos no svg */}
          <div className="w-full h-full" style={{ transform: `scaleX(${dir})`, transition: 'transform .2s' }}>
            <PetSvg
              humor={humorEfetivo}
              roupa={roupa}
              micro={microEfetivo}
              cena={cena}
              className={cn('w-full h-full drop-shadow-sm', movendo && 'pet-anim-anda')}
            />
          </div>
        </button>
      </div>
    </div>
  );
}
