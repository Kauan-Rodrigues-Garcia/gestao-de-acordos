/**
 * useNucleo — esta pessoa pertence ao Núcleo de Inteligência e Gestão?
 *
 * ## Por que a pergunta existe
 *
 * O Núcleo é um setor **especial** dentro da mesma empresa e do mesmo produto.
 * Ele não cobra: compra números de WhatsApp, aquece, e distribui aos setores de
 * cobrança. Acordo, recebimento, meta e lixeira não são vocabulário dele.
 *
 * Até aqui o sistema só sabia recortar por PRODUTO (`lib/produto.ts`) e por
 * PERMISSÃO (`useCargoPermissoes`). Nenhum dos dois resolve este caso:
 *
 *   - produto não resolve porque o Núcleo é `cobranca`. Ele é da BookPlay, no
 *     mesmo banco e no mesmo deploy — inventar um quarto produto para um setor
 *     criaria uma empresa que não existe;
 *   - cargo não resolve porque cargo não distingue setor. Quem trabalha no
 *     Núcleo é operador, líder, gerência — os mesmos cargos do Play 3. Ligar ou
 *     desligar `ver_acordos` no cargo `operador` mexeria em todo operador da
 *     empresa.
 *
 * Falta o terceiro eixo, e é este: **o setor**.
 *
 * ## O identificador é o ID, nunca o nome
 *
 * `numeros_config.setor_nucleo_id` diz qual setor é o Núcleo naquela empresa. É
 * a mesma linha que a RLS consulta em `fn_numeros_sou_do_nucleo`, então a tela e
 * o banco não têm como discordar.
 *
 * Comparar `setor.nome === 'Núcleo de Inteligência e Gestão'` seria mais curto e
 * está proibido: renomear o setor na tela de administração — coisa de dois
 * cliques — desligaria a diferenciação inteira em silêncio, e a pessoa do Núcleo
 * voltaria a ver Acordos sem ninguém entender por quê. Este projeto já gastou
 * uma migration removendo condicional por nome de setor (20260823092000), e a
 * migration `..._numeros_whatsapp` criou `numeros_config` justamente para não
 * repetir o erro.
 *
 * ## `souDoNucleo` é o fato; `recorte` é o que as telas aplicam
 *
 * `souDoNucleo` responde só «o setor da pessoa bate com o apontado?». O menu, o
 * guarda de rota e a porta de entrada leem `recorte`: o mesmo fato depois das
 * duas travessias de `recorteDoNucleo` — acesso total não tem lado, e quem
 * configura o módulo sem ser do Núcleo alcança a tela da configuração. Calculado
 * aqui, uma vez, para os três não decidirem cada um por conta própria.
 *
 * ## Uma leitura por sessão, não uma por componente
 *
 * Provider, e não hook solto. Três lugares fazem a pergunta — a barra lateral
 * (`Layout`), o guarda de rota (`ProtectedRoute`) e a porta de entrada
 * (`PainelDeEntrada`) —, e um hook com `useEffect` próprio dispararia três
 * consultas iguais a cada navegação.
 *
 * ## Sem configuração, ninguém é do Núcleo
 *
 * `numeros_config` tem RLS: a linha volta para quem é do Núcleo, para quem tem
 * `numeros_configurar`, e para o super_admin. Para todos os outros vem vazio — e
 * vazio responde `false`, que é a resposta certa para quem não é.
 *
 * O mesmo vale para a empresa que não tem o setor configurado: sem linha,
 * ninguém é do Núcleo ali, e o sistema inteiro se comporta como se comportava
 * antes deste arquivo existir. É a direção certa para falhar — a diferenciação
 * some, e não a cobrança.
 *
 * ## `loading` importa, e quem usa precisa respeitá-lo
 *
 * Enquanto a resposta não chega, `souDoNucleo` e `recorte` são `false`. Não é um
 * palpite: é o valor que mantém a cobrança — a esmagadora maioria — sem piscar.
 *
 * Quem NÃO pode se contentar com isso é o guarda de rota: deixar uma tela de
 * cobrança abrir por meio segundo para alguém do Núcleo é justamente o buraco
 * que se está fechando. Por isso `loading` é exportado, e `ProtectedRoute`
 * espera por ele antes de decidir. Menu é conforto; rota é a porta.
 *
 * As permissões entram na espera junto com a configuração: as duas travessias
 * perguntam ao painel, e decidir antes dele fecharia Controle de Números para o
 * super_admin até a primeira resposta chegar.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { assinarTabela } from '@/lib/realtime';
import { recorteDoNucleo } from '@/lib/menuLateral';
import { buscarConfig } from '@/services/numeros/numeros.service';

export interface EstadoNucleo {
  /** A pessoa logada está no setor apontado como Núcleo desta empresa. */
  souDoNucleo: boolean;
  /**
   * O lado do recorte que vale para esta pessoa — `souDoNucleo` depois das
   * travessias. `null` = os dois lados. Ver `recorteDoNucleo`.
   */
  recorte: boolean | null;
  /** O setor apontado como Núcleo, quando a pessoa tem permissão de vê-lo. */
  setorNucleoId: string | null;
  /** A primeira resposta ainda não chegou. Ver o cabeçalho. */
  loading: boolean;
}

const FORA: EstadoNucleo = {
  souDoNucleo: false, recorte: false, setorNucleoId: null, loading: false,
};

const NucleoContext = createContext<EstadoNucleo>(FORA);

export function NucleoProvider({ children }: { children: React.ReactNode }) {
  const { perfil, loading: authLoading } = useAuth();
  const { empresa, loading: empresaLoading } = useEmpresa();
  const { isAdmin, temPermissaoExplicita, loading: permLoading } = useCargoPermissoes();

  const empresaId = empresa?.id ?? null;
  const meuSetor  = perfil?.setor_id ?? null;

  const [setorNucleoId, setSetorNucleoId] = useState<string | null>(null);
  /*
   * `carregou` só volta a `false` quando a EMPRESA muda.
   *
   * A releitura de realtime não pode devolver a tela ao estado de carregamento:
   * `ProtectedRoute` mostra esqueleto enquanto `loading`, e a página inteira
   * seria desmontada — com filtro, rolagem e formulário meio preenchido — toda
   * vez que alguém salvasse a configuração do Núcleo.
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
       * ela seguir funcionando como a cobrança de sempre.
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

  // Trocar o setor do Núcleo muda quem enxerga o quê no sistema inteiro. Quem
  // estiver com a tela aberta precisa acompanhar — sem isso, a pessoa que
  // acabou de sair do Núcleo continuaria sem Acordos até dar F5.
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
     * As duas metades da resposta.
     *
     * Ter a linha em mãos não faz ninguém ser do Núcleo: o administrador com
     * `numeros_configurar` e o super_admin também a leem, e nenhum dos dois
     * trabalha lá. O que decide é o setor da pessoa bater com o apontado.
     */
    const souDoNucleo =
      setorNucleoId !== null && meuSetor !== null && meuSetor === setorNucleoId;
    return {
      souDoNucleo,
      recorte: recorteDoNucleo({
        souDoNucleo,
        acessoTotal: isAdmin,
        // Explícita: `numeros_configurar` é concessão nominal. O acesso total
        // já atravessou pela linha de cima, e não por herança desta chave.
        configuraNucleo: temPermissaoExplicita('numeros_configurar'),
      }),
      setorNucleoId,
      loading: authLoading || empresaLoading || permLoading || !carregou,
    };
  }, [
    setorNucleoId, meuSetor, isAdmin, temPermissaoExplicita,
    authLoading, empresaLoading, permLoading, carregou,
  ]);

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
