/**
 * Banco de Horas — aba própria do menu (18/11/2026).
 *
 * O relatório HRBH102 do DP («Vencimento de Lançamentos não Compensados»),
 * que antes era um painel HTML solto com os dados num computador só. Aqui os
 * relatórios ficam no banco (`banco_horas_setores`) e cada um vê o que alcança:
 *
 *   ver_banco_horas .................. abre a aba
 *   banco_horas_escopo_setor ......... os setores do DP ligados ao seu setor
 *   banco_horas_escopo_todos_setores . todos, com o filtro de setor
 *   banco_horas_gerenciar ............ importar, apagar e «Ligar setores»
 *
 * A RLS (`fn_banco_horas_alcanca`) faz o mesmo recorte no banco. A leitura dos
 * arquivos e as contas estão em `lib/bancoHoras`, portadas do painel antigo
 * sem mudar a regra; a tela é do gestão.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useEmpresa } from '@/hooks/useEmpresa';
import { passaTravaBancoHoras } from '@/lib/bancoHoras/liberacao';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { aplicarOrdemSetores } from '@/lib/setores-ordem';
import { COLUNAS_SETOR_DO_FILTRO } from '@/lib/setoresDosFiltros';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/lib/tenant-config';
import { PainelBancoHoras } from './Painel';
import { useBancoHoras, useFotosPorNome } from './useBancoHoras';

export default function PaginaBancoHoras() {
  // ── Todos os hooks ANTES de qualquer return condicional ──────────────────
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const tenant = useTenant();
  const { temPermissao, loading: carregandoPermissoes } = useCargoPermissoes();

  const niveis = niveisLiberados('banco_horas', temPermissao);
  const veTodos = niveis.includes('todos_setores');
  const veSetor = niveis.includes('setor');
  // Trava até a autorização (lib/bancoHoras/liberacao.ts): sem ela, nada é buscado.
  const passaTrava = passaTravaBancoHoras(perfil?.perfil);
  const temAlcance = passaTrava && (veTodos || (veSetor && !!perfil?.setor_id));
  const gerenciar = veTodos && temPermissao('banco_horas_gerenciar');
  const empresaId = empresa?.id ?? null;

  const dados = useBancoHoras(empresaId, temAlcance);
  const fotos = useFotosPorNome(empresaId, temAlcance);

  const [setoresGestao, setSetoresGestao] = useState<{ id: string; nome: string; ativo?: boolean | null; tipo?: string | null }[]>([]);

  useEffect(() => {
    if (!empresaId) return;
    let cancelado = false;
    void supabase.from('setores').select(COLUNAS_SETOR_DO_FILTRO).eq('empresa_id', empresaId).order('nome')
      .then(({ data }) => {
        if (cancelado) return;
        setSetoresGestao(aplicarOrdemSetores(
          (data as unknown as { id: string; nome: string; ativo: boolean; tipo: string | null }[] | null) ?? [], empresaId));
      });
    return () => { cancelado = true; };
  }, [empresaId]);

  if (tenant.isPaguePlay) {
    return <div className="p-6 text-center text-muted-foreground">Esta seção não está disponível para esta empresa.</div>;
  }
  if (!empresaId || !perfil?.id) return null;
  if (!passaTrava) {
    return <div className="p-6 text-center text-muted-foreground">O Banco de Horas é só da liderança.</div>;
  }

  return (
    <PainelBancoHoras
      empresaId={empresaId} setorProprioId={perfil.setor_id ?? null}
      veTodos={veTodos} veSetor={veSetor} temAlcance={temAlcance} gerenciar={gerenciar}
      carregandoPermissoes={carregandoPermissoes} dados={dados} fotos={fotos} setoresGestao={setoresGestao}
    />
  );
}
