/**
 * AdminPermissoes — a aba Permissões de Configurações.
 *
 * Substitui `AdminCargos.tsx`, que tinha quatro defeitos medidos em produção:
 *
 *   1. a tela mostrava o toggle DESLIGADO e o sistema concedia — 25 casos,
 *      incluindo operador da BookPlay com `editar_usuarios`;
 *   2. `ouvidoria` não aparecia: `CARGOS_EDITAVEIS` listava 5 dos 8 cargos;
 *   3. dois toggles não eram consultados por nenhuma linha de código;
 *   4. salvar não propagava — a pessoa afetada só sentia ao recarregar.
 *
 * O diagnóstico completo está em
 * `docs/superpowers/specs/2026-08-15-permissoes-2-0-design.md`.
 */
import { useState } from 'react';
import { ShieldCheck, Users, Info } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { PorCargo } from './PorCargo';
import { PorPessoa } from './PorPessoa';

export default function AdminPermissoes() {
  const { isAdmin, loading } = useCargoPermissoes();
  const [aba, setAba] = useState('cargo');

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando permissões...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        Só administradores gerenciam permissões.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Permissões</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          O que cada cargo pode fazer, e as exceções de pessoas específicas.
        </p>
      </div>

      {/* O aviso de camada existe porque a confusão é fácil e cara: forçar
          `ver_acordos_gerais` num operador NÃO faz ele enxergar acordo alheio.
          A RLS continua negando — e é isso que protege o dado. */}
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/20 px-4 py-3">
        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Estas permissões controlam <strong className="text-foreground">navegação e
          interface</strong>: qual menu aparece, qual tela abre, qual botão fica
          visível. O acesso ao <strong className="text-foreground">dado</strong> é
          governado pelas políticas do banco (RLS) e não muda aqui — um operador
          com &laquo;ver acordos de outras pessoas&raquo; ligado continua sem
          enxergar acordo alheio, e isso é o correto.
        </p>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="cargo" className="gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Por cargo
          </TabsTrigger>
          <TabsTrigger value="pessoa" className="gap-1.5">
            <Users className="w-3.5 h-3.5" /> Por pessoa
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cargo" className="mt-4">
          <PorCargo />
        </TabsContent>
        <TabsContent value="pessoa" className="mt-4">
          <PorPessoa />
        </TabsContent>
      </Tabs>
    </div>
  );
}
