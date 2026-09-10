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
import { listarOperadoresDoSetor, type OperadorDoSetor } from '@/services/numeros/numeros.service';
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
   * O setor de quem está olhando — e não o do primeiro número da lista.
   *
   * `numeros[0]?.setor_id` funcionava enquanto houvesse número, e falhava
   * justamente no setor que ainda não recebeu nenhum: a lista de pessoas vinha
   * vazia, e o seletor de «Lançar» abria sem ninguém para escolher — no
   * primeiro dia de uso do módulo, que é quando ele mais precisa funcionar.
   *
   * A liderança enxerga o PRÓPRIO setor (`fn_numeros_visivel`, nível 2), então o
   * setor dela é o setor dos números que ela vê.
   */
  const meuSetor = perfil?.setor_id ?? null;

  // Quem pode receber um número neste setor, com nome e foto. Só a liderança
  // precisa — o operador vê apenas os próprios, e o nome dele não acrescenta
  // nada à tela.
  useEffect(() => {
    if (visao !== 'setor' || !empresaId || !meuSetor) { setPessoas([]); return; }
    let cancelado = false;
    listarOperadoresDoSetor(empresaId, meuSetor)
      .then(l => { if (!cancelado) setPessoas(l); })
      .catch(() => { if (!cancelado) setPessoas([]); });
    return () => { cancelado = true; };
  }, [visao, empresaId, meuSetor]);

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
