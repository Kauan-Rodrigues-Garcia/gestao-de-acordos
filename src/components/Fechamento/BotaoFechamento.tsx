/**
 * BotaoFechamento — "Baixar fechamento" ao lado do seletor de mês.
 *
 * Fica colado no seletor porque baixa exatamente o MÊS QUE ESTÁ NA TELA. Um
 * botão em outro canto do dashboard levantaria a pergunta "fechamento de qual
 * mês?" toda vez, e a resposta errada só apareceria depois de o arquivo já ter
 * sido enviado para alguém.
 *
 * ## Só existe em mês fechado
 *
 * Mês corrente não tem fechamento — tem parcial. O arquivo sai igual ao de um
 * mês encerrado, com o mesmo nome e o mesmo cabeçalho, e ninguém que o recebesse
 * por WhatsApp saberia que os números ainda vão mudar até o dia 31.
 *
 * Por isso o botão SOME, em vez de ficar desabilitado: um botão cinza convida a
 * perguntar "por que não posso baixar?", e a resposta ("porque o mês não acabou")
 * é justamente o que a ausência dele já diz. É a mesma regra de calendário de
 * `mesFechado`, então não há cargo que mude isso: super admin também não baixa
 * fechamento de mês aberto, porque o arquivo não existiria.
 *
 * ## Quem baixa o quê
 *
 * O nível sai do escopo do Dashboard — o painel onde este botão vive — e é
 * mostrado no próprio botão em forma de legenda ("do setor", "meu"). Ninguém
 * escolhe escopo aqui: escolher seria uma segunda resposta para "quem eu
 * enxergo?", e a RLS recusaria a primeira que discordasse dela.
 *
 * Até a fase 3 da reestruturação por aba isso vinha de `veTodosOsSetores`,
 * que respondia por cargo ou pelas chaves globais. Agora vem das chaves do
 * Dashboard, e é lá que se muda quem baixa o quê.
 *
 *   operador  → "Meu fechamento"        só ele
 *   líder     → "Fechamento do setor"   o setor dele, com os operadores
 *   diretoria → "Fechamento da empresa" todos os setores + comparativo
 */

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useTenant } from '@/lib/tenant-config';
import { escopoEfetivo } from '@/lib/permissoes-escopo';
import { isPerfilAdminOuLider } from '@/lib/index';
import { rotuloDoMes } from '@/lib/mesReferencia';
import { mesFechado } from '@/lib/fechamentoMes';
import { baixarRelatorioFechamento } from '@/services/fechamento/baixarFechamento';
import type { NivelFechamento } from '@/services/fechamento/tipos';
import { cn } from '@/lib/utils';

interface BotaoFechamentoProps {
  /** O mês em exibição — o mesmo do seletor ao lado. */
  mes: string;
  /** Setor em foco no painel; o relatório de líder é sempre deste setor. */
  setorId?: string | null;
  /** O escopo tem a lógica Direto/Extra? Decide o bloco de vínculo. */
  temLogicaDiretoExtra?: boolean;
  className?: string;
}

export function BotaoFechamento({
  mes, setorId, temLogicaDiretoExtra = false, className,
}: BotaoFechamentoProps) {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const tenant = useTenant();
  const [gerando, setGerando] = useState(false);

  // Depois dos hooks, nunca antes: a ordem tem de ser a mesma em todo render,
  // e `mes` muda no seletor sem desmontar o componente.
  if (!mesFechado(mes)) return null;

  const cargo = perfil?.perfil ?? '';
  /*
   * O nível do relatório segue o painel onde este botão vive: ele é
   * renderizado dentro do AnalyticsPanel, no Dashboard. Usar outra fonte de
   * escopo faria o relatório e a tela discordarem sobre o mesmo mês — que é
   * exatamente o defeito que `escopoAnalitico` foi criado para acabar.
   */
  const vejoTudo = escopoEfetivo('dashboard', temPermissao) === 'todos_setores';
  const vejoOutros = isPerfilAdminOuLider(cargo);

  const nivel: NivelFechamento = vejoTudo ? 'diretoria' : vejoOutros ? 'setor' : 'operador';

  const legenda = nivel === 'diretoria' ? 'empresa'
    : nivel === 'setor' ? 'setor'
    : 'meu';

  async function baixar() {
    if (!empresa?.id || !perfil?.id) {
      toast.error('Empresa ou usuário não identificado.');
      return;
    }
    // O setor do relatório de líder é o do painel; sem ele, o do cadastro. Sem
    // nenhum dos dois o relatório de setor não teria recorte — cai para o
    // próprio operador, que é sempre uma resposta verdadeira.
    const setorDoRelatorio = setorId ?? perfil.setor_id ?? null;
    const nivelEfetivo: NivelFechamento =
      nivel === 'setor' && !setorDoRelatorio ? 'operador' : nivel;

    setGerando(true);
    const aviso = toast.loading(`Montando o fechamento de ${rotuloDoMes(mes)}…`);
    try {
      const r = await baixarRelatorioFechamento({
        empresaId: empresa.id,
        empresaNome: empresa.nome ?? tenant.slug,
        mes,
        nivel: nivelEfetivo,
        setorId: nivelEfetivo === 'diretoria' ? null : setorDoRelatorio,
        operadorId: nivelEfetivo === 'operador' ? perfil.id : null,
        operadorNome: perfil.nome ?? perfil.email ?? null,
        isPaguePlay: tenant.isPaguePlay,
        temLogicaDiretoExtra,
        geradoPor: perfil.nome ?? perfil.email ?? 'usuário',
      });

      if (!r.ok) {
        toast.error(`Não foi possível montar o fechamento: ${r.erro}`, { id: aviso });
        return;
      }
      toast.success(
        `Fechamento de ${rotuloDoMes(mes)} baixado (${r.nomeArquivo}). `
        + 'Abra no navegador — as abas ficam dentro do próprio arquivo.',
        { id: aviso, duration: 7000 },
      );
    } finally {
      setGerando(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn('h-7 text-xs gap-1.5 rounded-lg border-border/70', className)}
      onClick={baixar}
      disabled={gerando}
      title={`Baixa o fechamento de ${rotuloDoMes(mes)} (${legenda}) como um arquivo HTML com abas`}
    >
      {gerando
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Download className="w-3.5 h-3.5" />}
      Fechamento
      <span className="hidden sm:inline text-muted-foreground font-normal">· {legenda}</span>
    </Button>
  );
}
