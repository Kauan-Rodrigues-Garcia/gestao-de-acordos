/**
 * PetWidget — o mascote no canto inferior direito da tela.
 * Micro-animações alternadas quando parado; clique abre o quartinho.
 * Fase de teste: visível apenas para administrador/super_admin
 * (usePetHabilitado). Estado local em localStorage — zero banco.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import './pet.css';
import {
  usePetHabilitado, usePetDoTenant, petStorageKey,
  type PetHumor, type PetRoupa,
} from './petConfig';
import { PetAura } from './PetAura';
import { PetRolo } from './PetRolo';
import { PetQuartinho } from './PetQuartinho';

interface PetEstadoLocal { roupa?: PetRoupa; dormindo?: boolean }

export function PetWidget() {
  const habilitado  = usePetHabilitado();
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const pet         = usePetDoTenant();
  const storageKey  = petStorageKey(empresa?.id, perfil?.id);

  const [aberto, setAberto] = useState(false);
  const [humor,  setHumor]  = useState<PetHumor>('idle');
  const [micro,  setMicro]  = useState<'none' | 'pulinho'>('none');
  const [roupa,  setRoupa]  = useState<PetRoupa>('nenhuma');

  // Restaura roupa/sono persistidos
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const s = JSON.parse(raw) as PetEstadoLocal;
      if (s.roupa)    setRoupa(s.roupa);
      if (s.dormindo) setHumor('dormindo');
    } catch { /* noop */ }
  }, [storageKey]);

  function persistir(estado: PetEstadoLocal) {
    try { localStorage.setItem(storageKey, JSON.stringify(estado)); } catch { /* noop */ }
  }

  // Micro-animação alternada: pulinho ocasional enquanto está "de boa"
  useEffect(() => {
    if (humor !== 'idle') return;
    let dentro: ReturnType<typeof setTimeout> | null = null;
    const timer = setInterval(() => {
      setMicro('pulinho');
      dentro = setTimeout(() => setMicro('none'), 950);
    }, 9000 + Math.random() * 7000);
    return () => { clearInterval(timer); if (dentro) clearTimeout(dentro); };
  }, [humor]);

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

  if (!habilitado) return null;
  const PetSvg = pet.tipo === 'aura' ? PetAura : PetRolo;

  return (
    <div className="fixed bottom-2 right-3 z-40 flex flex-col items-end">
      <AnimatePresence>
        {aberto && (
          <PetQuartinho
            petNome={pet.nome}
            PetSvg={PetSvg}
            humor={humor}
            roupa={roupa}
            onAlimentar={alimentar}
            onAlternarSono={alternarSono}
            onSetRoupa={trocarRoupa}
            onClose={() => setAberto(false)}
          />
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        title={`${pet.nome} — clique para cuidar`}
        aria-label={`Abrir o quartinho de ${pet.nome}`}
        className="w-24 h-24 text-black/70 dark:text-white/60 hover:scale-105 transition-transform cursor-pointer bg-transparent border-0 p-0"
      >
        <PetSvg humor={humor} roupa={roupa} micro={micro} className="w-full h-full drop-shadow-sm" />
      </button>
    </div>
  );
}
