/**
 * usePetEstado — estado do pet no banco (moedas, roupa, sono) + recompensa
 * disponível a partir do recebimento diário.
 *
 * Degradação graciosa: se a migration ainda não foi aplicada (RPCs ausentes),
 * `dbAtiva` fica false e a persistência de roupa/sono cai para o localStorage —
 * o pet segue funcionando exatamente como antes, só sem moedas.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { petStorageKey, ROUPAS_VALIDAS, type PetRoupa } from './petConfig';
import {
  getPetEstado, getRecompensaDisponivel, resgatarRecompensa, salvarVisualPet, gastarMoedas,
  type RecompensaDisponivel, type ResultadoResgate,
} from '@/services/pet/petEstado.service';

function coerceRoupa(v: string | null | undefined): PetRoupa {
  return ROUPAS_VALIDAS.includes(v as PetRoupa) ? (v as PetRoupa) : 'nenhuma';
}

/** Intervalo do poll de recompensa disponível (recebimento chega ao longo do dia). */
const POLL_DISPONIVEL_MS = 60_000;

interface PetEstadoLocal { roupa?: PetRoupa; dormindo?: boolean }

export interface UsePetEstado {
  carregado: boolean;
  dbAtiva: boolean;
  moedas: number;
  /** Inventário permanente (ids de itens comprados na loja mensal). */
  itens: string[];
  roupaInicial: PetRoupa;
  dormindoInicial: boolean;
  disponivel: RecompensaDisponivel;
  salvarVisual: (roupa: PetRoupa, dormindo: boolean) => void;
  resgatar: () => Promise<ResultadoResgate | null>;
  /** Gasta moedas (com item = compra na loja; sem item = consumível). true se deu. */
  comprar: (preco: number, item?: string) => Promise<boolean>;
  refetchDisponivel: () => void;
}

export function usePetEstado(ativo: boolean): UsePetEstado {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const storageKey  = petStorageKey(empresa?.id, perfil?.id);

  const [carregado, setCarregado]     = useState(false);
  const [dbAtiva, setDbAtiva]         = useState(false);
  const [moedas, setMoedas]           = useState(0);
  const [itens, setItens]             = useState<string[]>([]);
  const [roupaInicial, setRoupaInic]  = useState<PetRoupa>('nenhuma');
  const [dormindoInic, setDormindoIn] = useState(false);
  const [disponivel, setDisponivel]   = useState<RecompensaDisponivel>({ valor: 0, moedas: 0 });
  const dbAtivaRef = useRef(false);

  // ── Carga inicial ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!ativo || !perfil?.id) { setCarregado(true); return; }
    let vivo = true;

    (async () => {
      const estado = await getPetEstado();
      if (!vivo) return;

      if (estado) {
        dbAtivaRef.current = true;
        setDbAtiva(true);
        setMoedas(estado.moedas);
        setItens(Array.isArray(estado.itens_desbloqueados)
          ? (estado.itens_desbloqueados as unknown[]).map(String)
          : []);
        setRoupaInic(coerceRoupa(estado.roupa_equipada));
        setDormindoIn(!!estado.dormindo);
        const disp = await getRecompensaDisponivel();
        if (vivo && disp) setDisponivel(disp);
      } else {
        // Sem banco (migration ainda não aplicada) → localStorage
        dbAtivaRef.current = false;
        setDbAtiva(false);
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const s = JSON.parse(raw) as PetEstadoLocal;
            if (s.roupa)    setRoupaInic(coerceRoupa(s.roupa));
            if (s.dormindo) setDormindoIn(true);
          }
        } catch { /* noop */ }
      }
      if (vivo) setCarregado(true);
    })();

    return () => { vivo = false; };
  }, [ativo, perfil?.id, storageKey]);

  // ── Realtime: saldo atualiza entre as abas do próprio usuário ───────────
  useEffect(() => {
    if (!ativo || !dbAtiva || !perfil?.id) return;
    const channel = supabase
      .channel(`pet-estado-${perfil.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pet_estado', filter: `usuario_id=eq.${perfil.id}` },
        (payload) => {
          const nova = payload.new as { moedas?: number } | null;
          if (typeof nova?.moedas === 'number') setMoedas(nova.moedas);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [ativo, dbAtiva, perfil?.id]);

  // ── Poll da recompensa disponível ──────────────────────────────────────
  const refetchDisponivel = useCallback(() => {
    if (!dbAtivaRef.current) return;
    getRecompensaDisponivel().then(d => { if (d) setDisponivel(d); });
  }, []);

  useEffect(() => {
    if (!ativo || !dbAtiva) return;
    const t = setInterval(refetchDisponivel, POLL_DISPONIVEL_MS);
    return () => clearInterval(t);
  }, [ativo, dbAtiva, refetchDisponivel]);

  // ── Ações ──────────────────────────────────────────────────────────────
  const salvarVisual = useCallback((roupa: PetRoupa, dormindo: boolean) => {
    // Cache local sempre (fallback + carga rápida na próxima vez)
    try { localStorage.setItem(storageKey, JSON.stringify({ roupa, dormindo })); } catch { /* noop */ }
    if (dbAtivaRef.current) void salvarVisualPet(roupa, dormindo);
  }, [storageKey]);

  const resgatar = useCallback(async (): Promise<ResultadoResgate | null> => {
    if (!dbAtivaRef.current) return null;
    const r = await resgatarRecompensa();
    if (r) {
      setMoedas(r.moedasTotal);
      setDisponivel({ valor: 0, moedas: 0 });
    }
    return r;
  }, []);

  // Compra na loja (com item → entra no inventário permanente no servidor)
  // ou consumível (sem item, ex.: comida). O saldo é validado no servidor.
  const comprar = useCallback(async (preco: number, item?: string): Promise<boolean> => {
    if (!dbAtivaRef.current || preco <= 0) return false;
    const novoSaldo = await gastarMoedas(preco, item);
    if (novoSaldo === null) return false;
    setMoedas(novoSaldo);
    if (item) setItens(prev => (prev.includes(item) ? prev : [...prev, item]));
    return true;
  }, []);

  return {
    carregado,
    dbAtiva,
    moedas,
    itens,
    roupaInicial,
    dormindoInicial: dormindoInic,
    disponivel,
    salvarVisual,
    resgatar,
    comprar,
    refetchDisponivel,
  };
}
