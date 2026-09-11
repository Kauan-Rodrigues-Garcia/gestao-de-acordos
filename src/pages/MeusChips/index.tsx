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
 * É o vocabulário da operação, e mantê-lo evita traduzir na conversa. Não há
 * chip físico em lugar nenhum do módulo: o que se cadastra, move e devolve é o
 * número.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMeusChips } from '@/hooks/useMeusChips';
import { HistoricoNumero } from '@/components/numeros/HistoricoNumero';
import { listarOperadoresDosSetores, type OperadorDoSetor } from '@/services/numeros/numeros.service';
import { VisaoLideranca } from './VisaoLideranca';
import { VisaoOperador } from './VisaoOperador';
import { useEffect } from 'react';

export default function MeusChips() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const {
    visao, numeros, celulares, semOperador, comOperador, meuId,
    loading, erro, recarregar,
  } = useMeusChips();

  const [historico, setHistorico] = useState<{ id: string; numero: string } | null>(null);
  const [pessoas, setPessoas] = useState<OperadorDoSetor[]>([]);

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

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold">Meus Chips</h1>
        <p className="text-sm text-muted-foreground">
          {visao === 'setor'
            ? 'Os números de WhatsApp do seu setor, e quem está com cada um.'
            : 'Os números de WhatsApp lançados para você.'}
        </p>
      </header>

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
          onMudou={() => void recarregar()}
          onVerHistorico={(id, numero) => setHistorico({ id, numero })}
        />
      ) : (
        <VisaoOperador
          numeros={numeros}
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
    </div>
  );
}
