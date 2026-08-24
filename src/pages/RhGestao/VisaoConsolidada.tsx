/**
 * VisaoConsolidada — o que o RH vê ao abrir a competência.
 *
 * ## Por que não é uma tabela de todos os operadores
 *
 * São dez setores e centenas de pessoas. Uma lista completa na abertura obriga
 * quem confere a procurar o problema no meio do que está certo — e o pedido é
 * explícito em não começar assim.
 *
 * A tela responde, em ordem de urgência, as perguntas que o RH faz de fato:
 * quem ainda não enviou, quem tem pendência, quanto dá no total. Só depois
 * disso ela deixa abrir um setor.
 *
 * ## As cores são poucas de propósito
 *
 * Quatro estados têm cor (pendência, recebido, em conferência, aprovado) e o
 * resto é neutro. Uma tela em que tudo é colorido não destaca nada — e
 * destacar é a função desta.
 */
import { ChevronRight, Building2, Users, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/index';
import { ValorAnimado } from '@/components/ValorAnimado';
import { GRUPO_META, TIPO_REMUNERACAO_LABEL, type TipoRemuneracao } from '@/services/rh/rhEstados';
import type { ArvoreRh, LinhaAgregavel } from '@/services/rh/rhAgregacao';

export interface VisaoConsolidadaProps<T extends LinhaAgregavel> {
  arvore: ArvoreRh<T>;
  /** Abre o detalhe de um setor. */
  onAbrirSetor: (setorId: string) => void;
}

export function VisaoConsolidada<T extends LinhaAgregavel>({
  arvore, onAbrirSetor,
}: VisaoConsolidadaProps<T>) {
  const { resumo, celulas, totalPorTipo } = arvore;

  // Contagens no nível de SETOR — é a unidade que o RH acompanha: um setor é
  // "recebido" ou não, e é sobre ele que a devolução e o envio acontecem.
  const setores = celulas.flatMap(c => c.setores);
  const recebidos  = setores.filter(s => s.resumo.estado === 'enviado' || s.resumo.estado === 'aprovado').length;
  const pendentes  = setores.filter(s => ['nao_iniciado', 'em_preenchimento', 'concluido', 'validado'].includes(s.resumo.estado)).length;
  const comErro    = setores.filter(s => s.resumo.estado === 'com_devolucao').length;

  return (
    <div className="space-y-4">
      {/* ── Os números que respondem "como está o mês" ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Numero rotulo="Setores" valor={setores.length} sub={`${resumo.total} pessoas`} />
        <Numero rotulo="Recebidos" valor={recebidos} cls="text-emerald-500"
                sub={pendentes > 0 ? `${pendentes} ainda não enviaram` : 'todos enviaram'} />
        <Numero rotulo="Com pendência" valor={comErro}
                cls={comErro > 0 ? 'text-red-400' : 'text-muted-foreground'}
                sub={comErro > 0 ? 'aguardando correção' : 'nenhuma devolução aberta'} />
        <Card className="border-border/70">
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Total geral
            </p>
            <ValorAnimado
              valor={resumo.valorTotal} formatar={formatCurrency}
              className="block text-xl font-bold font-mono leading-tight mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              {Object.entries(totalPorTipo).map(([tipo, v]) => (
                <span key={tipo} className="block">
                  {TIPO_REMUNERACAO_LABEL[tipo as TipoRemuneracao] ?? tipo}: {formatCurrency(v)}
                </span>
              ))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Cidade por cidade ── */}
      {celulas.map(c => (
        <div key={c.celula} className="space-y-2">
          <div className="flex items-center gap-2 pt-1">
            <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {c.celula}
              <span className="text-muted-foreground font-semibold">
                {' — '}
                {TIPO_REMUNERACAO_LABEL[c.tipoRemuneracao as TipoRemuneracao] ?? c.tipoRemuneracao}
              </span>
            </h3>
            <span className="text-[11px] text-muted-foreground ml-auto font-mono">
              {formatCurrency(c.resumo.valorTotal)}
            </span>
          </div>

          <div className="rounded-xl border border-border/70 divide-y divide-border/40 overflow-hidden">
            {c.setores.map(s => {
              const g = GRUPO_META[s.resumo.estado];
              return (
                <button
                  key={s.setorId} onClick={() => onAbrirSetor(s.setorId)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
                >
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground block truncate">
                      {s.setorNome}
                    </span>
                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                      <Users className="w-3 h-3 shrink-0" />
                      {s.resumo.total} pessoa{s.resumo.total !== 1 ? 's' : ''}
                      {s.resumo.pendentes > 0 && ` · ${s.resumo.pendentes} sem valor`}
                      {/* Fora da folha não é pendência: é decisão registrada.
                          Sem este número, o RH via «20 pessoas» e 17 valores e
                          voltava a perguntar o que faltava. */}
                      {s.resumo.dispensados > 0 && ` · ${s.resumo.dispensados} fora da folha`}
                      {s.resumo.devolvidos > 0 && (
                        <span className="text-red-400 inline-flex items-center gap-0.5 ml-1">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {s.resumo.devolvidos} devolvido{s.resumo.devolvidos !== 1 ? 's' : ''}
                        </span>
                      )}
                    </span>
                  </span>

                  <span className="font-mono text-xs font-semibold text-foreground shrink-0">
                    {formatCurrency(s.resumo.valorTotal)}
                  </span>
                  <Badge variant="outline" className={cn('text-[10px] font-semibold shrink-0', g.cls)}>
                    {g.label}
                  </Badge>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
            {c.setores.length === 0 && (
              <p className="text-xs text-muted-foreground px-4 py-6 text-center">
                Nenhum setor desta cidade tem operadores nesta competência.
              </p>
            )}
          </div>
        </div>
      ))}

      {celulas.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">
          Nenhum operador nesta competência. Confira a configuração de cidades e setores.
        </p>
      )}
    </div>
  );
}

function Numero({
  rotulo, valor, sub, cls,
}: { rotulo: string; valor: number; sub?: string; cls?: string }) {
  return (
    <Card className="border-border/70">
      <CardContent className="p-4">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          {rotulo}
        </p>
        <ValorAnimado
          valor={valor} formatar={v => String(Math.round(v))}
          className={cn('block text-xl font-bold font-mono leading-tight mt-1', cls)}
        />
        {sub && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default VisaoConsolidada;
