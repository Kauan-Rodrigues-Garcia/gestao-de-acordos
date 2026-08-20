/**
 * PorCargo — a permissão que vale para todo mundo daquele cargo.
 *
 * ## O que mudou em relação à tela antiga
 *
 * 1. **Os oito cargos aparecem.** `ouvidoria` era invisível: `CARGOS_EDITAVEIS`
 *    listava cinco. O cargo existe, tem linha no banco e está em
 *    `PERFIS_LIDER` — só não havia como configurá-lo.
 * 2. **`administrador` e `super_admin` aparecem em leitura**, com a explicação
 *    de por que não são editáveis. Antes sumiam sem motivo aparente, e a
 *    pergunta "por que não posso configurar o administrador?" já foi feita.
 * 3. **O catálogo é recortado pela operação.** Quem entra pela BookPlay não vê
 *    toggle de Ouvidoria, e vice-versa.
 */
import { useMemo, useState } from 'react';
import { Save, RotateCcw, Loader2, LockKeyhole } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabase';
import { PERFIL_LABELS } from '@/lib/index';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import {
  CARGOS_CONFIGURAVEIS, catalogoDoTenant, gruposDoTenant,
  normalizarDependencias, permissoesPadraoDoCargo,
} from '@/lib/permissoes-catalogo';
import { cn } from '@/lib/utils';
import { GrupoPermissoes } from './GrupoPermissoes';
import { useRascunho } from './useRascunho';

export function PorCargo({ podeEditar }: { podeEditar: boolean }) {
  const { empresa, tenantSlug } = useEmpresa();
  const { todasPermissoes, refresh } = useCargoPermissoes();

  const [cargo, setCargo] = useState<string>('operador');
  const [salvando, setSalvando] = useState(false);
  const rascunho = useRascunho<boolean>();

  const catalogo = useMemo(() => catalogoDoTenant(tenantSlug), [tenantSlug]);
  const grupos   = useMemo(() => gruposDoTenant(tenantSlug), [tenantSlug]);

  /**
   * O valor gravado. Depois da migration `20260815154058` toda chave existe em
   * todo cargo; o `permissoesPadraoDoCargo` só cobre a janela entre o deploy do
   * frontend e a aplicação da migration.
   */
  const salvo = useMemo(() => {
    const doBanco = todasPermissoes.find(r => r.cargo === cargo)?.permissoes;
    return doBanco && Object.keys(doBanco).length > 0
      ? doBanco
      : permissoesPadraoDoCargo(cargo);
  }, [todasPermissoes, cargo]);

  const valorDe = (key: string): boolean =>
    key in rascunho.alteracoes ? rascunho.alteracoes[key] : !!salvo[key];

  function trocarCargo(novo: string) {
    if (rascunho.sujo && !confirm('Descartar as alterações não salvas?')) return;
    rascunho.descartar();
    setCargo(novo);
  }

  function alternar(key: string) {
    if (!podeEditar) return;
    const atual = Object.fromEntries(catalogo.map(p => [p.key, valorDe(p.key)]));
    const proximo = normalizarDependencias(atual, key, !valorDe(key));
    rascunho.definirVarios(proximo);
    rascunho.podar(k => !!salvo[k]);
  }

  function ligarGrupo(grupo: string, ligar: boolean) {
    if (!podeEditar) return;
    let proximo = Object.fromEntries(catalogo.map(p => [p.key, valorDe(p.key)]));
    for (const p of catalogo.filter(p => p.grupo === grupo)) {
      proximo = normalizarDependencias(proximo, p.key, ligar);
    }
    rascunho.definirVarios(proximo);
    rascunho.podar(k => !!salvo[k]);
  }

  async function salvar() {
    if (!podeEditar || !empresa?.id || !rascunho.sujo) return;
    setSalvando(true);
    try {
      // Grava o mapa INTEIRO, nunca só o que mudou: chave ausente era
      // exatamente o defeito que esta versão veio corrigir.
      const completo = normalizarDependencias(Object.fromEntries(
        catalogo.map(p => [p.key, valorDe(p.key)]),
      ));
      const { error } = await supabase
        .from('cargos_permissoes')
        .upsert(
          { empresa_id: empresa.id, cargo, permissoes: completo },
          { onConflict: 'empresa_id,cargo' },
        );
      if (error) throw error;
      toast.success(`Permissões de ${PERFIL_LABELS[cargo] ?? cargo} salvas.`);
      rascunho.descartar();
      await refresh();
    } catch (e) {
      toast.error('Não foi possível salvar. ' + (e instanceof Error ? e.message : ''));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Seletor de cargo */}
      <div className="flex flex-wrap gap-1.5">
        {CARGOS_CONFIGURAVEIS.map(c => {
          return (
            <button
              key={c}
              onClick={() => trocarCargo(c)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                cargo === c
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground',
              )}
            >
              {PERFIL_LABELS[c] ?? c}
            </button>
          );
        })}
      </div>

      {!podeEditar && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <LockKeyhole className="w-3.5 h-3.5" /> Somente leitura. A permissão “Editar permissões” controla o salvamento.
        </div>
      )}
      <>
          {rascunho.sujo && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                {rascunho.total} alteração{rascunho.total !== 1 ? 'ões' : ''} não salva
                {rascunho.total !== 1 ? 's' : ''}
              </span>
              <div className="ml-auto flex gap-1.5">
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
                  onClick={rascunho.descartar}>
                  <RotateCcw className="w-3.5 h-3.5" /> Descartar
                </Button>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={salvar} disabled={salvando}>
                  {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Salvar
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {grupos.map(g => {
              const doGrupo = catalogo.filter(p => p.grupo === g);
              return (
                <GrupoPermissoes
                  key={g}
                  grupo={g}
                  permissoes={doGrupo}
                  concedidas={doGrupo.filter(p => valorDe(p.key)).length}
                  alterada={p => p.key in rascunho.alteracoes}
                  acoes={
                    <>
                      <button onClick={() => ligarGrupo(g, true)}
                        className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded">
                        Ligar tudo
                      </button>
                      <button onClick={() => ligarGrupo(g, false)}
                        className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded">
                        Desligar tudo
                      </button>
                    </>
                  }
                  renderControle={p => (
                    <Switch
                      checked={valorDe(p.key)}
                      onCheckedChange={() => alternar(p.key)}
                      disabled={!podeEditar || (p.requer ?? []).some(pai => !valorDe(pai))}
                      aria-label={p.label}
                    />
                  )}
                />
              );
            })}
          </div>
        </>
    </div>
  );
}
