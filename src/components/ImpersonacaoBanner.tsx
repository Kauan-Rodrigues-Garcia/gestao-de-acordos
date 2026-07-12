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
    <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-amber-950 shadow-md">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-3 px-4 py-1.5 text-xs sm:text-sm">
        <span className="flex items-center gap-2 font-medium min-w-0">
          <UserCog className="w-4 h-4 shrink-0" />
          <span className="truncate">
            Você está logado como <strong>{ativa.alvoNome}</strong> (impersonação por {ativa.adminNome})
          </span>
        </span>
        <button
          type="button"
          onClick={sair}
          disabled={saindo}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-amber-950/90 text-amber-50 px-2.5 py-1 font-semibold hover:bg-amber-950 transition-colors disabled:opacity-60"
        >
          {saindo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
          {saindo ? 'Saindo…' : 'Sair da impersonação'}
        </button>
      </div>
    </div>
  );
}
