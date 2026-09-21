/**
 * Meus Chips — os números de WhatsApp do próprio setor.
 *
 * ## Uma tela, duas leituras
 *
 * Não há duas telas. Há uma, e o que ela mostra depende do alcance que a pessoa
 * tem na aba `chips`:
 *
 *   • alcance INDIVIDUAL (operador)  → só os números lançados para ele;
 *   • alcance de SETOR (liderança)   → o setor inteiro, separado entre o que
 *                                      está livre e o que está com alguém.
 *
 * Quem decide isso é o painel de permissões, e o banco decide de novo: mesmo
 * forçando a URL, a RLS só entrega o que aquele alcance alcança.
 *
 * ## O nome da aba diz «chips», o controle é de NÚMEROS
 *
 * É o vocabulário da operação, e mantê-lo evita traduzir na conversa. No
 * caminho do Núcleo não há chip físico: o que se cadastra, move e devolve é o
 * número.
 *
 * ## Chips Físicos: a segunda separação (21/09/2026)
 *
 * O chip físico entrou depois, e SEPARADO: é o inventário do que cada pessoa tem
 * na mão, com status próprio (Ativo, Banido, Recuperar) e tempo de até 12 h. Não
 * passa pelo Núcleo nem toca `numeros_whatsapp`. As abas só aparecem para quem
 * tem `ver_chips_fisicos`; para os demais a tela é a mesma de antes. A escolha
 * da aba fica na URL (`?aba=fisicos`), para o link levar direto a ela.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMeusChips } from '@/hooks/useMeusChips';
import { HistoricoNumero } from '@/components/numeros/HistoricoNumero';
import { listarOperadoresDosSetores, type OperadorDoSetor } from '@/services/numeros/numeros.service';
import { VisaoLideranca } from './VisaoLideranca';
import { VisaoOperador } from './VisaoOperador';
import { ChipsFisicos } from './ChipsFisicos';
import { useEffect } from 'react';

type AbaMeusChips = 'numeros' | 'fisicos';

export default function MeusChips() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao, isAdmin } = useCargoPermissoes();
  const {
    visao, numeros, celulares, semOperador, comOperador, comigo, meuId,
    loading, erro, recarregar,
  } = useMeusChips();

  const [historico, setHistorico] = useState<{ id: string; numero: string } | null>(null);
  const [pessoas, setPessoas] = useState<OperadorDoSetor[]>([]);

  const temFisicos = temPermissao('ver_chips_fisicos');
  const [params, setParams] = useSearchParams();
  const aba: AbaMeusChips = temFisicos && params.get('aba') === 'fisicos' ? 'fisicos' : 'numeros';
  function trocarAba(nova: string) {
    setParams(atual => {
      const p = new URLSearchParams(atual);
      if (nova === 'fisicos') p.set('aba', 'fisicos'); else p.delete('aba');
      return p;
    }, { replace: true });
  }

  const empresaId = empresa?.id ?? '';
  /*
   * Os setores cujas pessoas a tela precisa nomear: o de quem está olhando, e o
   * de cada número que chegou.
   *
   * O próprio setor entra sempre. `numeros[0]?.setor_id` sozinho falhava no
   * setor que ainda não recebeu nenhum número: a lista de pessoas vinha vazia
   * no primeiro dia de uso do módulo, que é quando ele mais precisa funcionar.
   *
   * Os setores dos números entram também. Só o próprio setor serve ao líder,
   * que enxerga o setor dele (`fn_numeros_visivel`, nível 2), e erra com o
   * super_admin: a RLS entrega os números de TODOS os setores, e cada pessoa de
   * outro setor virava «Fora do setor» nos cartões. Para o líder o conjunto é o
   * mesmo de antes — os números dele são todos do setor dele.
   *
   * Uma string ordenada, e não o array: `numeros` troca de referência a cada
   * evento de realtime, e a lista de pessoas só precisa ser relida quando o
   * CONJUNTO de setores muda.
   */
  const meuSetor = perfil?.setor_id ?? null;
  const setoresDasPessoas = useMemo(() => {
    const ids = new Set<string>();
    if (meuSetor) ids.add(meuSetor);
    for (const n of numeros) if (n.setor_id) ids.add(n.setor_id);
    return [...ids].sort().join(',');
  }, [numeros, meuSetor]);

  // Quem pode estar com um número nestes setores, com nome e foto. Só a
  // liderança precisa — o operador vê apenas os próprios, e o nome dele não
  // acrescenta nada à tela.
  useEffect(() => {
    if (visao !== 'setor' || !empresaId || !setoresDasPessoas) { setPessoas([]); return; }
    let cancelado = false;
    listarOperadoresDosSetores(empresaId, setoresDasPessoas.split(','))
      .then(l => { if (!cancelado) setPessoas(l); })
      .catch(() => { if (!cancelado) setPessoas([]); });
    return () => { cancelado = true; };
  }, [visao, empresaId, setoresDasPessoas]);

  const nomeDoCelular = useMemo(() => {
    const mapa = new Map(celulares.map(c => [c.id, c.identificacao]));
    return (id: string) => mapa.get(id) ?? '—';
  }, [celulares]);

  if (loading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const numerosDoNucleo = (
    <>
      {erro && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{erro}</CardContent>
        </Card>
      )}

      {visao === 'setor' ? (
        <VisaoLideranca
          empresaId={empresaId}
          semOperador={semOperador}
          comOperador={comOperador}
          nomeDoCelular={nomeDoCelular}
          pessoas={pessoas}
          podeLancar={temPermissao('chips_lancar_ao_operador')}
          podeRelancar={temPermissao('chips_relancar_ao_nucleo')}
          // A situação e as etiquetas são do Núcleo (o Assistente ADM), aqui e
          // no Controle de Números. Quem recusa de verdade são as RPCs.
          podeAlterarSituacao={temPermissao('numeros_administrar')}
          // Espelho de `fn_numeros_manda_no_setor`: o próprio setor, com o
          // acesso total atravessando. Quem recusa de verdade segue sendo o banco.
          podeAgirNoSetor={setorId => isAdmin || setorId === meuSetor}
          onMudou={() => void recarregar()}
          onVerHistorico={(id, numero) => setHistorico({ id, numero })}
        />
      ) : (
        <VisaoOperador
          numeros={comigo}
          meuId={meuId}
          nomeDoCelular={nomeDoCelular}
          podeDevolver={temPermissao('chips_devolver_a_lideranca')}
          onMudou={() => void recarregar()}
          onVerHistorico={(id, numero) => setHistorico({ id, numero })}
        />
      )}

      <HistoricoNumero
        numeroId={historico?.id ?? null}
        numero={historico?.numero}
        onFechar={() => setHistorico(null)}
      />
    </>
  );

  const subtitulo = aba === 'fisicos'
    ? 'Os chips físicos que cada pessoa tem, com status e tempo.'
    : visao === 'setor'
      ? 'Os números de WhatsApp do seu setor, e quem está com cada um.'
      : 'Os números de WhatsApp lançados para você.';

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold">Meus Chips</h1>
        <p className="text-sm text-muted-foreground">{subtitulo}</p>
      </header>

      {temFisicos ? (
        <Tabs value={aba} onValueChange={trocarAba} className="space-y-5">
          <TabsList>
            <TabsTrigger value="numeros">Números de WhatsApp</TabsTrigger>
            <TabsTrigger value="fisicos">Chips Físicos</TabsTrigger>
          </TabsList>
          <TabsContent value="numeros" className="mt-0 space-y-6">{numerosDoNucleo}</TabsContent>
          <TabsContent value="fisicos" className="mt-0"><ChipsFisicos /></TabsContent>
        </Tabs>
      ) : (
        numerosDoNucleo
      )}
    </div>
  );
}
