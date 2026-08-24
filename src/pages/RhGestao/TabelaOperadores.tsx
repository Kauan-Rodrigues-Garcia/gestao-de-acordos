/**
 * TabelaOperadores — a linha do operador, do crachá ao status.
 *
 * A mesma tabela serve líder, gerência e RH. O que muda não é o desenho: são as
 * AÇÕES que aparecem no fim da linha, e elas vêm de `permissoes` — nunca de um
 * `if (cargo === …)` escrito aqui. Cargo espalhado por componente foi
 * exatamente o que este projeto passou dez migrations recolhendo para o painel.
 *
 * O valor é editável em linha (sem modal) porque o líder preenche vinte pessoas
 * de uma vez: abrir e fechar vinte modais é o que faz alguém preferir a
 * planilha.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Check, X, Pencil, RefreshCw, Undo2, AlertTriangle, IdCard, MessageSquare,
  Ban, RotateCcw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatCurrency, parseCurrencyInput } from '@/lib/index';
import { LinhaViva } from '@/components/LinhaViva';
import { ValorAnimado } from '@/components/ValorAnimado';
import { ESTADO_META, editavel, rotuloValor, type StatusLancamento } from '@/services/rh/rhEstados';
import { formatarPercentual, corPercentual } from '@/services/rh/rhPercentual';
import type { LancamentoComPercentual } from '@/hooks/useRhGestao';
import type { PermissoesRh } from '@/hooks/useRhGestao';

export interface TabelaOperadoresProps {
  linhas: LancamentoComPercentual[];
  permissoes: PermissoesRh;
  /** `false` trava tudo: competência finalizada é consulta, não edição. */
  competenciaAberta: boolean;
  /** Salva o valor de uma linha. */
  onSalvarValor: (lancamentoId: string, valor: number, observacao: string | null) => Promise<boolean>;
  onAprovar?: (lancamentoId: string) => void;
  onDevolver?: (lancamento: LancamentoComPercentual) => void;
  /**
   * Marca ou desmarca o operador como fora da folha.
   *
   * Quem não atingiu não tem premiação a receber — e antes disto ele segurava
   * a conclusão da equipe inteira, forçando o líder a digitar zero, que a
   * folha leria como um pagamento de zero.
   */
  onDispensar?: (lancamento: LancamentoComPercentual, dispensar: boolean) => void;
  /** Cadastro de crachá — só quem tem a chave. */
  onEditarCracha?: (lancamento: LancamentoComPercentual) => void;
  /**
   * O lançamento que a notificação de devolução aponta (`?lancamento=`).
   *
   * A RPC monta esse link desde o primeiro dia, e ninguém o lia: quem clicava
   * no sino caía na competência certa e numa lista de centenas de nomes.
   */
  destacarId?: string | null;
  /** Nada animado na primeira pintura — só quem chega depois se move. */
  jaPintou: boolean;
}

export function TabelaOperadores({
  linhas, permissoes, competenciaAberta,
  onSalvarValor, onAprovar, onDevolver, onDispensar, onEditarCracha,
  destacarId, jaPintou,
}: TabelaOperadoresProps) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [rascunho, setRascunho]     = useState('');
  const [obsRascunho, setObs]       = useState('');
  const [salvando, setSalvando]     = useState(false);

  // A linha pode sair da tela enquanto está aberta para edição (a gerência
  // valida a equipe do outro lado). Sem isto, o formulário ficaria pendurado
  // apontando para um id que não está mais na lista.
  useEffect(() => {
    if (editandoId && !linhas.some(l => l.id === editandoId)) setEditandoId(null);
  }, [linhas, editandoId]);

  function abrir(l: LancamentoComPercentual) {
    setEditandoId(l.id);
    setRascunho(l.valor != null
      ? Number(l.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '');
    setObs(l.observacao ?? '');
  }

  async function salvar(l: LancamentoComPercentual) {
    const valor = parseCurrencyInput(rascunho);
    if (!Number.isFinite(valor) || valor < 0) return;
    setSalvando(true);
    try {
      const ok = await onSalvarValor(l.id, valor, obsRascunho.trim() || null);
      if (ok) setEditandoId(null);
    } finally {
      setSalvando(false);
    }
  }

  const podeEditar = permissoes.podePreencher && competenciaAberta;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/60 bg-muted/20">
            <Th>Crachá</Th>
            <Th>Operador</Th>
            <Th>Equipe</Th>
            <Th className="text-right">Percentual</Th>
            <Th>Tipo</Th>
            <Th className="text-right">Valor</Th>
            <Th>Status</Th>
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {linhas.map(l => {
              const status = l.status as StatusLancamento;
              const meta = ESTADO_META[status];
              const emEdicao = editandoId === l.id;
              const devolvido = status === 'devolvido_rh';
              const destacada = !!destacarId && destacarId === l.id;

              return (
                <LinhaViva
                  key={l.id} nova={jaPintou}
                  className={cn(
                    'border-b border-border/30 group transition-colors hover:bg-accent/20',
                    devolvido && 'bg-red-500/[0.03]',
                    // O destaque é uma moldura, e não uma cor de fundo: a cor
                    // já significa «devolvido», e é justamente a linha devolvida
                    // que o link aponta.
                    destacada && 'ring-1 ring-inset ring-violet-500/60 bg-violet-500/[0.04]',
                  )}
                >
                  {/* Crachá: só existe dentro deste módulo. Ver a RLS de
                      `rh_dados_operadores`. */}
                  <td className="px-4 py-3 font-mono text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {l.cracha_snapshot || '—'}
                      {permissoes.podeEditarCracha && onEditarCracha && (
                        <button
                          title="Cadastrar crachá" onClick={() => onEditarCracha(l)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/60 hover:text-violet-400"
                        >
                          <IdCard className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  </td>

                  <td className="px-4 py-3 font-medium text-foreground max-w-[200px]">
                    <span className="truncate block">{l.nome_snapshot}</span>
                    {devolvido && l.motivo_devolucao && (
                      <p className="text-[10px] text-red-400/90 mt-0.5 inline-flex items-start gap-1">
                        <AlertTriangle className="w-2.5 h-2.5 shrink-0 mt-[2px]" />
                        <span className="line-clamp-2">{l.motivo_devolucao}</span>
                      </p>
                    )}
                    {!devolvido && l.observacao && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 inline-flex items-start gap-1">
                        <MessageSquare className="w-2.5 h-2.5 shrink-0 mt-[2px]" />
                        <span className="line-clamp-1">{l.observacao}</span>
                      </p>
                    )}
                  </td>

                  <td className="px-4 py-3 text-muted-foreground max-w-[140px]">
                    <span className="truncate block">{l.equipe_nome_snapshot ?? 'Sem equipe'}</span>
                  </td>

                  <td className={cn('px-4 py-3 text-right font-mono font-bold',
                                     corPercentual(l.percentualExibido))}>
                    {formatarPercentual(l.percentualExibido)}
                    {/* Congelado é informação, não enfeite: depois da conclusão o
                        número não acompanha mais o mês, e quem confere precisa
                        saber disso. */}
                    {l.percentualCongelado && (
                      <span className="block text-[9px] font-normal text-muted-foreground">
                        no fechamento
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-muted-foreground">
                    {rotuloValor(l.tipo_remuneracao_snapshot)}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {emEdicao ? (
                      <div className="flex flex-col items-end gap-1">
                        <Input
                          value={rascunho} onChange={e => setRascunho(e.target.value)}
                          className="h-8 w-28 text-xs font-mono text-right"
                          placeholder="0,00" inputMode="decimal"
                          aria-label={`Valor de ${l.nome_snapshot}`}
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter')  void salvar(l);
                            if (e.key === 'Escape') setEditandoId(null);
                          }}
                        />
                        <Input
                          value={obsRascunho} onChange={e => setObs(e.target.value)}
                          className="h-7 w-44 text-[11px]"
                          placeholder="Observação (opcional)"
                          aria-label={`Observação de ${l.nome_snapshot}`}
                        />
                      </div>
                    ) : l.valor != null ? (
                      <ValorAnimado
                        valor={Number(l.valor)} formatar={formatCurrency}
                        className="font-mono font-semibold text-foreground"
                        classeSubindo="text-emerald-400" classeDescendo="text-amber-400"
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {/* Fora da folha vence o estado: enquanto ela vale, o
                        `pendente` por baixo nao cobra nada de ninguem. */}
                    {l.dispensado ? (
                      <Badge variant="outline"
                        className="text-[10px] font-semibold bg-muted text-muted-foreground border-border"
                        title={l.motivo_dispensa ?? undefined}
                      >
                        <Ban className="w-2.5 h-2.5 mr-1" /> Fora da folha
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={cn('text-[10px] font-semibold', meta.cls)}>
                        {meta.label}
                      </Badge>
                    )}
                    {l.dispensado && l.motivo_dispensa && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[140px]"
                        title={l.motivo_dispensa}>
                        {l.motivo_dispensa}
                      </p>
                    )}
                    {!l.dispensado && l.preenchido_por_nome && status !== 'pendente' && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[120px]">
                        por {l.preenchido_por_nome}
                      </p>
                    )}
                  </td>

                  <td className="px-3 py-3">
                    {emEdicao ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          title="Salvar" disabled={salvando} onClick={() => void salvar(l)}
                          className="h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          {salvando ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Salvar
                        </button>
                        <button
                          title="Cancelar" disabled={salvando} onClick={() => setEditandoId(null)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {podeEditar && editavel(status) && !l.dispensado && (
                          <button
                            title={devolvido ? 'Corrigir o valor devolvido' : 'Informar o valor'}
                            onClick={() => abrir(l)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-violet-400 hover:bg-violet-500/10"
                          >
                            {devolvido ? <Undo2 className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {/* Fora da folha: so enquanto a linha esta em maos de
                            quem preenche. Depois disso existe a devolucao, que
                            registra motivo e autor. */}
                        {permissoes.podeDispensar && competenciaAberta
                          && editavel(status) && onDispensar && (
                          <button
                            title={l.dispensado
                              ? 'Devolver este operador para a folha'
                              : 'Marcar como fora da folha (nao atingiu, afastamento, admissao no meio do mes)'}
                            onClick={() => onDispensar(l, !l.dispensado)}
                            className={cn(
                              'w-7 h-7 rounded-lg flex items-center justify-center',
                              l.dispensado
                                ? 'text-sky-400 hover:bg-sky-500/10'
                                : 'text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10',
                            )}
                          >
                            {l.dispensado
                              ? <RotateCcw className="w-3.5 h-3.5" />
                              : <Ban className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {permissoes.podeAprovar && competenciaAberta
                          && status === 'enviado_rh' && onAprovar && (
                          <button
                            title="Aprovar este operador" onClick={() => onAprovar(l.id)}
                            className="h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20"
                          >
                            <Check className="w-3 h-3" /> Aprovar
                          </button>
                        )}
                        {permissoes.podeDevolver && competenciaAberta
                          && (status === 'enviado_rh' || status === 'aprovado_rh') && onDevolver && (
                          <button
                            title="Devolver só este operador" onClick={() => onDevolver(l)}
                            className="h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-semibold text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20"
                          >
                            <Undo2 className="w-3 h-3" /> Devolver
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </LinhaViva>
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>

      {linhas.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">
          Nenhum operador nesta seleção.
        </p>
      )}
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn(
      'text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]',
      className,
    )}>
      {children}
    </th>
  );
}

export default TabelaOperadores;
