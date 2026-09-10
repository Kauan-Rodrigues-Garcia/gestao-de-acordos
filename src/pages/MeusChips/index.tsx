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
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMeusChips } from '@/hooks/useMeusChips';
import { HistoricoNumero } from '@/components/numeros/HistoricoNumero';
import { listarOperadoresDoSetor, type OperadorDoSetor } from '@/services/numeros/numeros.service';
import { VisaoLideranca } from './VisaoLideranca';
import { VisaoOperador } from './VisaoOperador';
import { useEffect } from 'react';

export default function MeusChips() {
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const {
    visao, numeros, celulares, semOperador, comOperador, meuId,
    loading, erro, recarregar,
  } = useMeusChips();

  const [historico, setHistorico] = useState<{ id: string; numero: string } | null>(null);
  const [pessoas, setPessoas] = useState<OperadorDoSetor[]>([]);

  const empresaId = empresa?.id ?? '';
  const setorDosNumeros = numeros[0]?.setor_id ?? null;

  // Os nomes de quem está com cada número. Só a liderança precisa — o operador
  // vê apenas os próprios, e o nome dele não acrescenta nada à tela.
  useEffect(() => {
    if (visao !== 'setor' || !empresaId || !setorDosNumeros) { setPessoas([]); return; }
    let cancelado = false;
    listarOperadoresDoSetor(empresaId, setorDosNumeros)
      .then(l => { if (!cancelado) setPessoas(l); })
      .catch(() => { if (!cancelado) setPessoas([]); });
    return () => { cancelado = true; };
  }, [visao, empresaId, setorDosNumeros]);

  const nomeDoCelular = useMemo(() => {
    const mapa = new Map(celulares.map(c => [c.id, c.identificacao]));
    return (id: string) => mapa.get(id) ?? '—';
  }, [celulares]);

  const nomeDoOperador = useMemo(() => {
    const mapa = new Map(pessoas.map(p => [p.id, p.nome]));
    // Alguém transferido de setor continua no número até a liderança agir — e
    // some desta lista. Dizer isso é melhor do que mostrar um espaço em branco.
    return (id: string | null) => (id ? mapa.get(id) ?? 'Fora do setor' : '—');
  }, [pessoas]);

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
          nomeDoOperador={nomeDoOperador}
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
