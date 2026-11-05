/**
 * PixAbaDivergencias — a sub-aba «NRs divergentes»: tudo o que precisa de
 * ação para o Pix bater com a realidade, na ordem de urgência — o NR em
 * disputa (espera decisão de líder), o acordo que ficou só na lista de
 * acordos (espera registro) e, para quem pode, a correção de valor de um
 * Pix que saiu errado.
 */
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  criarAcordoPix, MSG_NR_MESMO_OPERADOR, type AcordoSemRegistroPix,
} from '@/services/pix_automatico.service';
import { PixSaldoPainel } from './PixSaldoPainel';
import { PixPedidosNr } from './PixPedidosNr';
import { PixAcordosSemRegistro } from './PixAcordosSemRegistro';
import { ResumoDivergencias, SecaoDivergencia } from './PixDivergencias';
import { TODOS_SETORES } from './pixTelaComum';
import type { PixTela } from './usePixAutomatico';

export function PixAbaDivergencias({ pix }: { pix: PixTela }) {
  const {
    empresa, perfil, temPermissao, loading, fechamento, noMesAtual, diaNovo, carregar,
    divergenciasAbertas, pedidosNr, pedidosDoFoco, aprovacoesNr, meusSetores,
    podeVerTodosSetores, nomePorSetor, setorFoco, setFiltroSetor, acordosSemPix,
    podeRegistrar, podeAjustarSaldo, operadoresFiltro, saldos, nrPorAcordo,
  } = pix;
  /**
   * Registrar aqui um acordo que já está na lista de acordos.
   *
   * Mesma pessoa, mesmo NR, mesmo valor — não é duplicidade, é o registro que
   * faltava. O `dia` acompanha o mês em foco pela mesma razão do formulário:
   * um acordo de agosto registrado em setembro tem de nascer em agosto.
   */
  async function registrarDaListaDeAcordos(a: AcordoSemRegistroPix) {
    if (!empresa?.id || !perfil?.id) return;
    if (fechamento.impedir('registrar Pix neste mês')) return;
    const { ok, error, nrMesmoOperador } = await criarAcordoPix({
      empresaId:    empresa.id,
      operadorId:   perfil.id,
      operadorNome: perfil.nome ?? perfil.email ?? '—',
      setorId:      perfil.setor_id ?? null,
      nrCliente:    a.nr_cliente,
      valor:        Number(a.valor),
      dia:          noMesAtual ? null : diaNovo,
    });
    if (!ok) {
      toast.error(nrMesmoOperador ? MSG_NR_MESMO_OPERADOR : `Erro ao registrar: ${error}`);
      return;
    }
    toast.success(`NR ${a.nr_cliente} registrado no Pix — aguardando verificação do líder.`);
    await carregar();
  }

  return (
    loading ? (
      <div className="space-y-2.5">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
    ) : (
    <div className="space-y-6">
      <ResumoDivergencias
        pendencias={divergenciasAbertas}
        partes={[
          pedidosNr.length > 0
            ? `${pedidosNr.length} NR${pedidosNr.length !== 1 ? 's' : ''} em disputa`
            : null,
          acordosSemPix.length > 0
            ? `${acordosSemPix.length} acordo${acordosSemPix.length !== 1 ? 's' : ''} sem registro no Pix`
            : null,
        ].filter((t): t is string => t != null)}
      />

      {/* ── 1. NRs em disputa ──
          Primeiro: é a única fila que espera decisão de OUTRA pessoa. O
          operador enxerga só o próprio pedido — quem recorta é a RLS. */}
      <SecaoDivergencia
        numero={1}
        titulo="NRs em disputa"
        descricao={temPermissao('aprovar_pix_automatico')
          ? 'Alguém pediu um NR que já está com outra pessoa. Decida com quem ele fica.'
          : 'Você pediu um NR que já estava com outra pessoa. A decisão é do líder.'}
        contador={pedidosNr.length}
        vazio="Nenhum NR em disputa."
      >
        <div className="space-y-2.5">
          {pedidosDoFoco.length > 0 && (
            <PixPedidosNr
              pedidos={pedidosDoFoco}
              aprovacoes={aprovacoesNr}
              podeDecidir={temPermissao('aprovar_pix_automatico')}
              meuId={perfil?.id ?? null}
              /* Por quais setores eu assino. Os dois valores saem da MESMA fonte que
                 `fn_pix_pode_decidir_lado` consulta do lado do banco: o escopo da aba
                 e `fn_setores_do_operador`. As duas pontas têm de dizer a mesma
                 coisa, e já disseram coisas diferentes — ver `podeAssinarLadoNr`. */
              meusSetores={meusSetores}
              vejoTodosOsSetores={podeVerTodosSetores}
              nomePorSetor={nomePorSetor}
              /* Só em «todos»: com um setor em foco a fila já é dele, e carimbar o
                 nome em toda linha seria repetir o óbvio. */
              mostrarSetor={setorFoco === null}
              onMudou={carregar}
            />
          )}

          {/* O foco da barra de setores escondeu parte da fila: dizer, e dar o
              caminho. Sem isto a aba piscaria com a lista vazia na frente. */}
          {pedidosNr.length > pedidosDoFoco.length && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-[11px] text-muted-foreground">
              <span className="min-w-0 flex-1">
                {pedidosNr.length - pedidosDoFoco.length}{' '}
                {pedidosNr.length - pedidosDoFoco.length === 1 ? 'NR está' : 'NRs estão'}{' '}
                em outro setor, fora do foco escolhido na barra de setores.
              </span>
              {podeVerTodosSetores && (
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => setFiltroSetor(TODOS_SETORES)}>
                  Ver todos os setores
                </Button>
              )}
            </div>
          )}
        </div>
      </SecaoDivergencia>

      {/* ── 2. O acordo que ficou só na lista de acordos ── */}
      <SecaoDivergencia
        numero={2}
        titulo="Sem registro no Pix"
        descricao="Seus acordos de Pix Automático ou Cartão Recorrente tabulados na aba Acordos que ainda não estão aqui — sem o registro, não contam comissão nem meta."
        contador={acordosSemPix.length}
        vazio="Todos os seus acordos recorrentes já estão registrados."
      >
        <PixAcordosSemRegistro
          acordos={acordosSemPix}
          onRegistrar={registrarDaListaDeAcordos}
          podeRegistrar={podeRegistrar}
        />
      </SecaoDivergencia>

      {/* ── 3. Correção de valor divergente (líder+ com a chave) ──
          Aqui e não em Registros: é acerto de um Pix que saiu com valor
          errado, não registro de acordo. Não faz a aba piscar — é anotação
          que espera o próximo pagamento, não decisão. */}
      {podeAjustarSaldo && empresa?.id && (
        <SecaoDivergencia
          numero={3}
          titulo="Correção de valor"
          descricao="Um Pix saiu com valor a mais ou a menos? Anote aqui; o acerto entra no próximo pagamento da pessoa."
          contador={saldos.length}
          alerta={false}
        >
          <PixSaldoPainel
            empresaId={empresa.id}
            operadores={operadoresFiltro}
            saldos={saldos}
            nrPorAcordo={nrPorAcordo}
            onMudou={carregar}
          />
        </SecaoDivergencia>
      )}
    </div>
    )
  );
}
