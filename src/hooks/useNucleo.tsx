/**
 * useNucleo — esta pessoa pertence ao Núcleo de Inteligência e Gestão?
 *
 * ## Para que serve hoje
 *
 * Para UMA decisão: a porta de entrada. `/` desenha o painel do Núcleo para quem
 * é do setor, e o Dashboard da cobrança para o resto (`PainelDeEntrada`, em
 * App.tsx).
 *
 * Já serviu para mais. Entre 10 e 11/09/2026 o menu e as rotas recortavam as
 * abas pelo SETOR (`nucleo: 'so' | 'fora'`), porque quem trabalhava no Núcleo
 * tinha cargo da cobrança — operador, líder — e herdava a cobrança inteira. O
 * Núcleo ganhou cargo próprio, `assistente_adm` (migrations 20260911120000 e
 * 20260911121000), e o recorte saiu: o que cada pessoa enxerga voltou a sair só
 * do painel de permissões, e o cargo do Núcleo não tem as chaves da cobrança.
 *
 * ## O identificador é o ID, nunca o nome
 *
 * `numeros_config.setor_nucleo_id` diz qual setor é o Núcleo naquela empresa. É
 * a mesma linha que a RLS consulta em `fn_numeros_sou_do_nucleo`, então a tela e
 * o banco não têm como discordar. Comparar pelo nome do setor desligaria tudo em
 * silêncio no dia em que alguém o renomeasse na tela de administração.
 *
 * ## Sem configuração, ninguém é do Núcleo
 *
 * `numeros_config` tem RLS: a linha volta para quem é do Núcleo, para quem tem
 * `numeros_configurar`, e para o super_admin. Para todos os outros vem vazio — e
 * vazio responde `false`, que é a resposta certa para quem não é.
 *
 * ## Acesso total abre no Dashboard
 *
 * Administrador e super_admin cadastrados no setor do Núcleo continuam abrindo
 * no Dashboard da cobrança: acesso total não tem lado. É o mesmo critério de
 * `useCargoPermissoes().isAdmin`, lido do perfil para não abrir uma segunda
 * consulta de permissões só para esta pergunta.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { assinarTabela } from '@/lib/realtime';
import { CARGOS_ACESSO_TOTAL } from '@/lib/permissoes-catalogo';
import { buscarConfig } from '@/services/numeros/numeros.service';

export interface EstadoNucleo {
  /** A pessoa logada está no setor apontado como Núcleo desta empresa. */
  souDoNucleo: boolean;
  /** `/` desenha o painel do Núcleo para esta pessoa? `souDoNucleo`, menos o acesso total. */
  abrePainelDoNucleo: boolean;
  /** O setor apontado como Núcleo, quando a pessoa tem permissão de vê-lo. */
  setorNucleoId: string | null;
  /** A primeira resposta ainda não chegou. */
  loading: boolean;
}

const FORA: EstadoNucleo = {
  souDoNucleo: false, abrePainelDoNucleo: false, setorNucleoId: null, loading: false,
};

const NucleoContext = createContext<EstadoNucleo>(FORA);

export function NucleoProvider({ children }: { children: React.ReactNode }) {
  const { perfil, loading: authLoading } = useAuth();
  const { empresa, loading: empresaLoading } = useEmpresa();

  const empresaId   = empresa?.id ?? null;
  const meuSetor    = perfil?.setor_id ?? null;
  const acessoTotal = (CARGOS_ACESSO_TOTAL as readonly string[]).includes(perfil?.perfil ?? '');

  const [setorNucleoId, setSetorNucleoId] = useState<string | null>(null);
  /*
   * `carregou` só volta a `false` quando a EMPRESA muda.
   *
   * A releitura de realtime não pode devolver a tela ao estado de carregamento:
   * a porta de entrada trocaria o painel por um esqueleto toda vez que alguém
   * salvasse a configuração do Núcleo.
   */
  const [carregou, setCarregou] = useState(false);

  const carregar = useCallback(async () => {
    if (!empresaId) {
      setSetorNucleoId(null);
      setCarregou(true);
      return;
    }
    try {
      const cfg = await buscarConfig(empresaId);
      setSetorNucleoId(cfg?.setor_nucleo_id ?? null);
    } catch {
      /*
       * Erro aqui é «não deu para saber», e «não deu para saber» vira «não é do
       * Núcleo» — a empresa sem o módulo aplicado cai neste caminho, e o certo é
       * ela seguir abrindo no Dashboard de sempre.
       *
       * Sem `toast`: esta consulta roda para toda pessoa logada, em toda
       * empresa, e um aviso vermelho no login de quem não tem nada a ver com o
       * módulo seria ruído puro.
       */
      setSetorNucleoId(null);
    } finally {
      setCarregou(true);
    }
  }, [empresaId]);

  useEffect(() => { setCarregou(false); }, [empresaId]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Trocar o setor do Núcleo muda a porta de entrada de quem estiver com a tela
  // aberta — sem isso, só depois de um F5.
  useEffect(() => {
    if (!empresaId) return;
    return assinarTabela(
      {
        topico: `nucleo-config:${empresaId}`,
        escutas: [{ tabela: 'numeros_config', filtro: `empresa_id=eq.${empresaId}` }],
      },
      {
        onEvento:      () => { void carregar(); },
        onReconectado: () => { void carregar(); },
      },
    );
  }, [empresaId, carregar]);

  const valor = useMemo<EstadoNucleo>(() => {
    /*
     * Ter a linha em mãos não faz ninguém ser do Núcleo: o administrador com
     * `numeros_configurar` e o super_admin também a leem, e nenhum dos dois
     * trabalha lá. O que decide é o setor da pessoa bater com o apontado.
     */
    const souDoNucleo =
      setorNucleoId !== null && meuSetor !== null && meuSetor === setorNucleoId;
    return {
      souDoNucleo,
      abrePainelDoNucleo: souDoNucleo && !acessoTotal,
      setorNucleoId,
      loading: authLoading || empresaLoading || !carregou,
    };
  }, [setorNucleoId, meuSetor, acessoTotal, authLoading, empresaLoading, carregou]);

  return <NucleoContext.Provider value={valor}>{children}</NucleoContext.Provider>;
}

/**
 * O estado do Núcleo para esta pessoa.
 *
 * Fora do provider devolve «não é do Núcleo, e já sei disso» em vez de estourar:
 * um teste que monta um componente solto não deve quebrar por causa de um
 * provider de contexto, e a resposta neutra é a que não muda comportamento
 * nenhum da cobrança.
 */
// eslint-disable-next-line react-refresh/only-export-components -- arquivo exporta Provider + hook consumidor, padrão já usado no resto do projeto.
export function useNucleo(): EstadoNucleo {
  return useContext(NucleoContext);
}
