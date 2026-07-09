/**
 * PetWidget — o mascote no canto inferior direito da tela.
 * - Admin/super_admin: pet completo — micro-animações, passeio aleatório
 *   pelo rodapé (anda, para no caminho, volta), quartinho interativo.
 * - Demais cargos: pet visível dormindo + quartinho em modo "Em breve".
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
  type PetHumor, type PetRoupa,
} from './petConfig';
import { PetAura } from './PetAura';
import { PetRolo } from './PetRolo';
import { PetQuartinho } from './PetQuartinho';

interface PetEstadoLocal { roupa?: PetRoupa; dormindo?: boolean }

/** Área do passeio: até ALCANCE px à esquerda do canto. */
const ALCANCE = 190;
/** Velocidade da caminhada em px/s. */
const VELOCIDADE = 45;

export function PetWidget() {
  const habilitado  = usePetHabilitado();
  const interativo  = usePetInterativo();
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const pet         = usePetDoTenant();
  const storageKey  = petStorageKey(empresa?.id, perfil?.id);

  const [aberto, setAberto] = useState(false);
  const [humor,  setHumor]  = useState<PetHumor>('idle');
  const [micro,  setMicro]  = useState<'none' | 'pulinho'>('none');
  const [roupa,  setRoupa]  = useState<PetRoupa>('nenhuma');

  // ── Passeio pelo rodapé ────────────────────────────────────────────────
  const [x,       setX]       = useState(0);   // deslocamento (negativo = esquerda)
  const [durMove, setDurMove] = useState(0);   // duração da transição (s)
  const [movendo, setMovendo] = useState(false);
  const [dir,     setDir]     = useState<1 | -1>(1);
  const xRef = useRef(0);

  // Restaura roupa/sono persistidos (só faz sentido no modo interativo)
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

  // Micro-animação alternada: pulinho ocasional enquanto está "de boa" parado
  useEffect(() => {
    if (!interativo || humor !== 'idle' || movendo || aberto) return;
    let dentro: ReturnType<typeof setTimeout> | null = null;
    const timer = setInterval(() => {
      setMicro('pulinho');
      dentro = setTimeout(() => setMicro('none'), 950);
    }, 9000 + Math.random() * 7000);
    return () => { clearInterval(timer); if (dentro) clearTimeout(dentro); };
  }, [interativo, humor, movendo, aberto]);

  // Passeio aleatório: anda até um ponto, para um tempinho, repete.
  useEffect(() => {
    if (!interativo || aberto || humor !== 'idle') { setMovendo(false); return; }
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
  }, [interativo, aberto, humor]);

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
  // Fora do modo interativo o pet fica só dormindo (teaser)
  const humorEfetivo: PetHumor = interativo ? humor : 'dormindo';

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

      <div style={{ transform: `translateX(${x}px)`, transition: `transform ${durMove}s linear` }}>
        <button
          type="button"
          onClick={alternarPainel}
          title={`${pet.nome} — clique para abrir`}
          aria-label={`Abrir o quartinho de ${pet.nome}`}
          className="w-24 h-24 text-black/70 dark:text-white/60 hover:scale-105 transition-transform cursor-pointer bg-transparent border-0 p-0"
        >
          {/* flip na direção da caminhada; passinhos no svg */}
          <div className="w-full h-full" style={{ transform: `scaleX(${dir})`, transition: 'transform .2s' }}>
            <PetSvg
              humor={humorEfetivo}
              roupa={roupa}
              micro={micro}
              className={cn('w-full h-full drop-shadow-sm', movendo && 'pet-anim-anda')}
            />
          </div>
        </button>
      </div>
    </div>
  );
}
