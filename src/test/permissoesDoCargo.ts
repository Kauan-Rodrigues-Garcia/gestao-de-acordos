/**
 * permissoesDoCargo — um `temPermissao` de teste que responde como o painel.
 *
 * ## Por que isto existe
 *
 * Em 24/08/2026 as telas pararam de perguntar o CARGO e passaram a perguntar o
 * PAINEL (ver `painel-manda.test.ts`). Os testes que montavam um cenário com
 * `perfil: 'lider'` e esperavam a visão de líder deixaram de funcionar — não
 * porque a regra mudou, mas porque a pergunta mudou de lugar.
 *
 * A saída errada seria mockar `temPermissao: () => true`: o teste passaria e
 * pararia de medir escopo, que costuma ser exatamente o que ele existe para
 * medir. A saída certa é responder a partir do CATÁLOGO REAL — os mesmos
 * padrões que uma empresa nova recebe.
 *
 * Assim `perfil: 'lider'` continua significando «um líder», e o teste continua
 * exercitando a regra de verdade. E quando alguém mudar o padrão de uma chave
 * no catálogo, os testes que dependem dela mudam junto — que é o comportamento
 * desejado, não um incômodo.
 *
 * ## O que ele NÃO cobre
 *
 * A exceção por pessoa (`perfis_permissoes`). Quem precisar dela no teste passa
 * um `temPermissao` próprio — este helper responde pelo CARGO, e só.
 */
import {
  PERMISSOES, CARGOS_ACESSO_TOTAL, exigeConcessaoExplicita,
  type CargoConfiguravel,
} from '@/lib/permissoes-catalogo';

/**
 * Um `temPermissao` que responde pelos padrões do catálogo para este cargo.
 *
 * Segue a mesma ordem de `useCargoPermissoes`: acesso total primeiro (menos as
 * chaves de concessão explícita), depois o padrão do cargo, e ausência nega.
 */
export function temPermissaoDoCargo(
  cargo: string | null | undefined,
): (chave: string) => boolean {
  return (chave: string): boolean => {
    if (!cargo) return false;
    // `administrador` e `super_admin` respondem `true` para tudo — menos para as
    // chaves que exigem concessão nominal, que ninguém ganha de graça.
    if ((CARGOS_ACESSO_TOTAL as readonly string[]).includes(cargo)) {
      return !exigeConcessaoExplicita(chave);
    }
    const meta = PERMISSOES.find(p => p.key === chave);
    return meta?.padrao[cargo as CargoConfiguravel] === true;
  };
}

/** O objeto inteiro que `useCargoPermissoes` devolve, para o `vi.mock`. */
export function permissoesDoCargo(cargo: string | null | undefined) {
  const temPermissao = temPermissaoDoCargo(cargo);
  return {
    temPermissao,
    // A concessão explícita nunca vem do cargo — quem testar `ignorar_fechamento_mes`
    // ou `rh_reabrir_fechamento` precisa de um mock próprio, e é assim que deve ser.
    temPermissaoExplicita: () => false,
    loading: false,
  };
}
