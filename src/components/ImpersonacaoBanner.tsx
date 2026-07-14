/**
 * Faixa fixa exibida enquanto um super_admin está impersonando outro usuário.
 * Sempre visível (topo, z alto) com saída em 1 clique.
 */
import { useEffect, useState } from 'react';
import { UserCog, LogOut, Loader2 } from 'lucide-react';
import {
  getImpersonacaoAtiva,
  sairImpersonacao,
  IMPERSONACAO_EVENT,
  type ImpersonacaoAtiva,
} from '@/services/impersonacao.service';

export function ImpersonacaoBanner() {
  const [ativa, setAtiva] = useState<ImpersonacaoAtiva | null>(null);
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    const sync = () => setAtiva(getImpersonacaoAtiva());
    sync();
    window.addEventListener(IMPERSONACAO_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(IMPERSONACAO_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (!ativa) return null;

  async function sair() {
    setSaindo(true);
    try {
      await sairImpersonacao();
    } catch {
      setSaindo(false);
    }
  }

  return (
    <div className="fixed top-1.5 right-1.5 z-[100]">
      <div className="flex items-center gap-1.5 rounded-full bg-amber-500 text-amber-950 shadow-md pl-2.5 pr-1 py-1 text-[11px] max-w-[70vw]">
        <UserCog className="w-3 h-3 shrink-0" />
        <span className="truncate">
          Como <strong>{ativa.alvoNome}</strong>
        </span>
        <button
          type="button"
          onClick={sair}
          disabled={saindo}
          title="Sair da impersonação"
          className="shrink-0 inline-flex items-center justify-center rounded-full bg-amber-950/90 text-amber-50 w-5 h-5 hover:bg-amber-950 transition-colors disabled:opacity-60"
        >
          {saindo ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}
