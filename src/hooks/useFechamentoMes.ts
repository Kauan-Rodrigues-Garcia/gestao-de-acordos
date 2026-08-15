/**
 * useFechamentoMes — o cadeado do mês fechado, pronto para a tela usar.
 *
 * A regra em si mora em `lib/fechamentoMes.ts`, pura e testada. Este hook só
 * junta a regra com o cargo do usuário logado e devolve as duas coisas que
 * qualquer tela precisa:
 *
 *   • `bloqueado` — para desabilitar botão e desenhar o cadeado;
 *   • `impedir()` — para chamar no início do handler e abortar com o motivo.
 *
 * Os dois juntos, e não só o primeiro: desabilitar botão é aparência, e um
 * atalho de teclado, um formulário já aberto quando o mês virou, ou um clique em
 * linha da tabela chegam ao handler mesmo assim. `impedir()` é a barreira que
 * vale — o `disabled` só existe para a pessoa não tentar.
 *
 * ⚠️ Isto NÃO é segurança. Quem manda no dado é a RLS; aqui é regra de produto,
 * do mesmo jeito que as permissões de `permissoes-catalogo.ts`.
 */

import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import {
  estadoFechamento, estadoFechamentoDaData,
  mensagemFechamento, mensagemFechamentoLiberado,
  type EstadoFechamento,
} from '@/lib/fechamentoMes';

export interface FechamentoDoMes extends EstadoFechamento {
  /** O mês avaliado, normalizado. */
  mes: string;
  /** A frase para o usuário — de bloqueio ou de "você está passando por cima". */
  mensagem: string;
  /**
   * Chame no começo do handler. Devolve `true` quando a ação NÃO deve seguir, e
   * nesse caso já mostrou o toast explicando o motivo.
   *
   *     if (impedir('excluir o acordo')) return;
   */
  impedir: (acao?: string) => boolean;
  /** O mesmo, para um registro específico (pelo vencimento dele). */
  impedirData: (data: string | null | undefined, acao?: string) => boolean;
  /** O registro com esta data está em mês fechado? Para cadeado por linha. */
  bloqueadoNaData: (data: string | null | undefined) => boolean;
}

export function useFechamentoMes(mes: string | null | undefined): FechamentoDoMes {
  const { perfil } = useAuth();
  const { temPermissaoExplicita } = useCargoPermissoes();
  const cargo = perfil?.perfil ?? null;

  // `temPermissaoExplicita`, e não `temPermissao`: este é o poder que não se
  // herda de "administrador pode tudo". Ver `PERMISSOES_EXPLICITAS`.
  const liberadoPorPermissao = temPermissaoExplicita('ignorar_fechamento_mes');

  const estado = useMemo(
    () => estadoFechamento({ mes, cargo, liberadoPorPermissao }),
    [mes, cargo, liberadoPorPermissao],
  );

  const mensagem = useMemo(
    () => (estado.liberadoPorCargo
      ? mensagemFechamentoLiberado(mes)
      : mensagemFechamento(mes)),
    [estado.liberadoPorCargo, mes],
  );

  const impedir = useCallback((acao?: string) => {
    if (!estado.bloqueado) return false;
    toast.warning(
      acao ? `Não dá para ${acao}: ${mensagemFechamento(mes)}` : mensagemFechamento(mes),
      { duration: 5000 },
    );
    return true;
  }, [estado.bloqueado, mes]);

  const bloqueadoNaData = useCallback(
    (data: string | null | undefined) =>
      estadoFechamentoDaData({ data, cargo, liberadoPorPermissao }).bloqueado,
    [cargo, liberadoPorPermissao],
  );

  const impedirData = useCallback((data: string | null | undefined, acao?: string) => {
    const doRegistro = estadoFechamentoDaData({ data, cargo, liberadoPorPermissao });
    if (!doRegistro.bloqueado) return false;
    const mesDoRegistro = String(data ?? '').slice(0, 7);
    toast.warning(
      acao
        ? `Não dá para ${acao}: ${mensagemFechamento(mesDoRegistro)}`
        : mensagemFechamento(mesDoRegistro),
      { duration: 5000 },
    );
    return true;
  }, [cargo, liberadoPorPermissao]);

  return {
    ...estado,
    mes: String(mes ?? ''),
    mensagem,
    impedir,
    impedirData,
    bloqueadoNaData,
  };
}
