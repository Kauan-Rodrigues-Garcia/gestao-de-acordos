/**
 * DesafiosComercial — as gincanas, com porta própria no Comercial.
 *
 * ## Por que existe este arquivo
 *
 * A aba de Desafios é da plataforma, não da cobrança: ela recebe `empresaId` e
 * `operadorId` e desenha catálogo, detalhe e configuração. O que a prendia à
 * cobrança era o ENDEREÇO — ela mora dentro do Analítico, e o Analítico é uma
 * das telas que o Comercial mata (item H do plano: «o que morre»).
 *
 * Então a Fase 9 dá a ela uma rota própria. O componente é o mesmo, sem cópia
 * e sem `if` de produto lá dentro.
 *
 * ## As chaves são as mesmas, e isso foi verificado
 *
 * `analitico_sub_desafios` **não depende** de `ver_analitico` — conferido no
 * catálogo: a entrada dela não tem `depende`. As quatro `desafios_escopo_*`
 * dependem só dela. Por isso o Comercial herda a aba inteira sem uma chave
 * nova, e sem encostar na cadeia de `fn_permissoes_catalogo()`, que já se
 * partiu uma vez neste projeto.
 *
 * O nome da chave continua dizendo «Analítico», e isso incomoda. Renomeá-la
 * exigiria migrar `cargos_permissoes` de todas as empresas, e o ganho seria de
 * rótulo — fica registrado aqui e em `permissoes-catalogo.ts`.
 *
 * ## O que a campanha do Comercial ainda não mede
 *
 * `fn_desafio_dados` calcula o placar a partir de `analitico_recebimentos`, que
 * é a tabela da cobrança. Uma campanha criada no Comercial **abre, configura e
 * lista participantes**, mas o ranking vem zerado — não há de onde tirar o
 * número.
 *
 * Ensinar aquela função a ler `vendas` é mudança numa função de produção que a
 * cobrança usa todo dia, e não entra de carona numa fase de telas. A tela diz
 * isso em cima, em vez de mostrar um pódio de zeros e deixar a operação
 * concluir que o sistema está quebrado.
 *
 * ## Desde 16/09/2026 é aba do Painel Líder
 *
 * O item de menu próprio saiu — na cobrança os Desafios são aba de uma tela
 * maior (o Analítico), e o Comercial passou a seguir o mesmo desenho, dentro
 * do Painel Líder. `embutido` tira o cabeçalho e o espaçamento de página, que
 * lá são do painel.
 */
import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { aplicarOrdemSetores } from '@/lib/setores-ordem';
import { AbaDesafios } from '@/pages/Analitico/Desafios';
import { Faixa } from './componentes';

export default function DesafiosComercial({ embutido = false }: { embutido?: boolean }) {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();

  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([]);

  const empresaId = empresa?.id ?? null;

  useEffect(() => {
    if (!empresaId) { setSetores([]); return; }
    void supabase
      .from('setores')
      .select('id, nome')
      .eq('empresa_id', empresaId)
      .order('nome')
      // Ordem escolhida na aba Setores; `order('nome')` é o desempate.
      .then(({ data }) => setSetores(
        aplicarOrdemSetores((data as { id: string; nome: string }[]) ?? [], empresaId),
      ));
  }, [empresaId]);

  // O guard de rota já exigiu a chave e o produto. O que falta aqui é a
  // sessão: sem perfil não há de quem seja a corrida.
  if (!empresaId || !perfil) {
    return (
      <div className="p-6 text-center text-[13px] text-muted-foreground">
        Carregando…
      </div>
    );
  }

  return (
    <div className={embutido ? 'space-y-4' : 'space-y-4 p-4 md:p-6'}>
      {!embutido && <div className="flex items-center gap-2.5">
        <div className="rounded-xl border border-border bg-card p-2">
          <Trophy className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight">Desafios</h1>
          <p className="text-[12px] text-muted-foreground">
            As gincanas internas, com ranking individual e por equipe
          </p>
        </div>
      </div>}

      <Faixa tom="info">
        <strong>O placar ainda não conta venda.</strong> A campanha abre, configura e lista quem
        disputa, mas o ranking é calculado sobre os recebimentos da cobrança
        (<code className="rounded bg-muted px-1 py-0.5 text-[11px]">fn_desafio_dados</code>), e no
        Comercial ele vem zerado. Ligar a gincana às vendas é mudança na função que a cobrança usa
        todo dia — está registrada como pendência, e não entrou junto com as telas.
      </Faixa>

      <AbaDesafios
        empresaId={empresaId}
        operadorId={perfil.id}
        operadorNome={perfil.nome}
        /* Sem régua de setor nesta rota: o Comercial não tem o filtro do
           Analítico, e a campanha vale como foi configurada. */
        filtroSetorId={null}
        setorProprio={perfil.setor_id ?? null}
        podeConfigurar={temPermissao('desafios_configurar')}
        podeConfigurarSetor={temPermissao('desafios_configurar_setor')}
        podeAdministrar={temPermissao('administrar_sistema')}
        setores={setores}
      />
    </div>
  );
}
