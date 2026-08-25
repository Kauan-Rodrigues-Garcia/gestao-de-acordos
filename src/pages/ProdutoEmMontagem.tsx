/**
 * ProdutoEmMontagem — a porta de entrada de um produto que ainda não tem tela.
 *
 * ## Por que existe uma tela para dizer «ainda não tem tela»
 *
 * `/` é a rota de entrada de todo mundo. Comercial e RH precisam dela desde o
 * primeiro dia, e o Dashboard que existe é da cobrança inteiro — recebimento,
 * acordo, meta, ticket médio. Mostrá-lo ao Comercial seria repetir o problema
 * que a lista branca de produtos veio consertar, só que na tela principal.
 *
 * A alternativa preguiçosa seria deixar `/` em branco. Tela em branco é
 * indistinguível de tela quebrada: a pessoa recarrega, troca de navegador,
 * chama o suporte. Esta diz o que está acontecendo e o que já dá para fazer.
 */
import { Link } from 'react-router-dom';
import { Compass, Users, Settings } from 'lucide-react';
import { ROUTE_PATHS } from '@/lib/index';
import { rotuloDoProduto, type Produto } from '@/lib/produto';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';

export default function ProdutoEmMontagem({ produto }: { produto: Produto | null }) {
  const { temPermissao } = useCargoPermissoes();

  // Só oferece o atalho de quem pode entrar. Um link que devolve a pessoa para
  // cá é pior do que link nenhum.
  const atalhos = [
    { chave: 'ver_usuarios',      to: ROUTE_PATHS.ADMIN_USUARIOS,      icon: Users,    label: 'Usuários',
      descricao: 'Criar setores, equipes e as pessoas da operação' },
    { chave: 'ver_configuracoes', to: ROUTE_PATHS.ADMIN_CONFIGURACOES, icon: Settings, label: 'Configurações',
      descricao: 'Cargos, permissões e ajustes da empresa' },
  ].filter(a => temPermissao(a.chave));

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-border bg-card p-2.5">
          <Compass className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">{rotuloDoProduto(produto)}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Esta operação está sendo montada. As telas próprias — painel,
            relatórios e as rotinas do dia a dia — ainda não existem, e por isso
            você não vê aqui as abas da cobrança: elas não se aplicam a este
            trabalho.
          </p>
        </div>
      </div>

      {atalhos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            O que já dá para fazer
          </p>
          {atalhos.map(a => (
            <Link
              key={a.to}
              to={a.to}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 hover:bg-accent/40 transition-colors"
            >
              <a.icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{a.label}</p>
                <p className="text-xs text-muted-foreground">{a.descricao}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
