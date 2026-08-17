/**
 * SeletorEmpresa — troca de empresa no cabeçalho, só para super_admin.
 *
 * `bookplay` e `pagueplay` são deploys separados, cada um com `VITE_TENANT_SLUG`
 * fixo no build. Um super_admin atende as duas, e até aqui trocar significava
 * trocar de domínio — embora a RLS já permitisse: `fn_can_access_empresa` deixa
 * super_admin passar por qualquer `empresa_id`.
 *
 * A escolha muda a empresa E o tenant (nome, cores, `isPaguePlay`), porque
 * `getTenantRuntimeConfig` passa a preferir o slug da empresa escolhida — a
 * mesma regra que a impersonação já usava.
 *
 * ## Por que recarrega a página
 *
 * Trocar de empresa invalida TUDO o que está em memória: resumos do analítico,
 * listas de operadores, metas, permissões de cargo, assinaturas de realtime
 * filtradas por `empresa_id`. `refresh()` do provider trocaria só a empresa e
 * deixaria o resto apontando para a anterior — um estado misto muito pior que
 * meio segundo de recarga. Impersonação, que tem o mesmo problema, faz igual.
 */

import { useState } from 'react';
import { Building2, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { fetchEmpresas } from '@/services/empresas.service';
import { definirEmpresaEscolhida } from '@/services/empresaAtiva.service';
import { getImpersonacaoAtiva } from '@/services/impersonacao.service';
import { cn } from '@/lib/utils';

import type { Empresa } from '@/lib/supabase';

export function SeletorEmpresa() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [trocando, setTrocando]     = useState<string | null>(null);

  // Durante impersonação a empresa é a do usuário impersonado, e trocá-la
  // deixaria a sessão apontando para uma empresa que a pessoa impersonada não
  // tem — dois "de quem é esta tela?" ao mesmo tempo.
  if (perfil?.perfil !== 'super_admin' || getImpersonacaoAtiva()) return null;

  async function abrir(aberto: boolean) {
    if (!aberto || empresas || carregando) return;
    setCarregando(true);
    try {
      setEmpresas(await fetchEmpresas());
    } finally {
      setCarregando(false);
    }
  }

  function trocar(alvo: Empresa) {
    if (alvo.id === empresa?.id) return;
    setTrocando(alvo.id);
    definirEmpresaEscolhida(alvo.id);
    // Ver o cabeçalho: recarrega em vez de `refresh()` para nada em memória
    // continuar apontando para a empresa anterior.
    window.location.reload();
  }

  // Uma empresa só (ou nenhuma carregada ainda) não justifica um seletor, mas o
  // botão precisa existir antes de saber disso — é o clique que carrega a lista.
  const soUma = empresas !== null && empresas.length <= 1;

  return (
    <DropdownMenu onOpenChange={abrir}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost" size="sm"
          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          title="Trocar de empresa"
        >
          <Building2 className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline max-w-[120px] truncate">
            {empresa?.nome ?? 'Empresa'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">Empresa</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {carregando && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
          </div>
        )}
        {soUma && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Só há uma empresa ativa.
          </div>
        )}
        {(empresas ?? []).map(e => {
          const atual = e.id === empresa?.id;
          return (
            <DropdownMenuItem
              key={e.id}
              onSelect={() => trocar(e)}
              disabled={atual || trocando !== null}
              className={cn('text-xs gap-2', atual && 'font-semibold')}
            >
              {trocando === e.id
                ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                : <Check className={cn('w-3.5 h-3.5 shrink-0', !atual && 'opacity-0')} />}
              <span className="truncate">{e.nome}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
