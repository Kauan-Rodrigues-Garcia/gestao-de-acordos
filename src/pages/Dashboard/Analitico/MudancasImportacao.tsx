/**
 * MudancasImportacao — «o que mudou no relatório desde a última importação».
 *
 * O card do histórico do mês na aba Analítico. Dois modos, a partir da mesma
 * lista (`useMudancasImportacao`):
 *
 *   'operador' ... a carteira de quem está olhando, na segunda pessoa. Só as
 *                  linhas em que ele é uma das pontas.
 *   'lideranca' .. o movimento do escopo inteiro, com os nomes dos dois lados
 *                  e o valor de antes contra o de agora.
 *
 * Quem recorta de verdade é o banco (`fn_analitico_mudancas_do_mes`): o modo
 * aqui muda o TEXTO, não o alcance. Um operador não recebe a linha do colega
 * nem pedindo.
 *
 * Nasce fechado quando não há nada, e aberto quando há: o pedido era que a
 * pessoa VISSE, não que fosse procurar.
 */
import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRightLeft, ChevronDown, ChevronUp, History,
  MinusCircle, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { useMudancasImportacao } from '@/hooks/useMudancasImportacao';
import {
  fraseParaLideranca, fraseParaOperador, minhasMudancas, momento, resumir,
  saldoDoOperador, ROTULO_TIPO, type Mudanca, type TipoMudanca,
} from '@/services/analitico/mudancasImportacao';

const ICONE: Record<TipoMudanca, typeof MinusCircle> = {
  removido:    MinusCircle,
  transferido: ArrowRightLeft,
};

const COR: Record<TipoMudanca, string> = {
  removido:    'text-destructive bg-destructive/10 border-destructive/25',
  transferido: 'text-primary bg-primary/10 border-primary/25',
};

interface Props {
  empresaId: string;
  /** `yyyy-MM` — o mês da lente. */
  mes: string;
  /** Quem está olhando: decide o texto e, no modo operador, o filtro. */
  operadorId: string;
  modo: 'operador' | 'lideranca';
  className?: string;
}

/** Quantas linhas aparecem antes do «ver todas». */
const PREVIA = 5;

export function MudancasImportacao({ empresaId, mes, operadorId, modo, className }: Props) {
  const { mudancas, carregando, erro, recarregar } = useMudancasImportacao(empresaId, mes);
  const [aberto, setAberto] = useState(true);
  const [tudo, setTudo] = useState(false);

  const lista = useMemo(
    () => (modo === 'operador' ? minhasMudancas(mudancas, operadorId) : mudancas),
    [mudancas, modo, operadorId],
  );
  const resumo = useMemo(() => resumir(lista), [lista]);
  const saldo = useMemo(
    () => (modo === 'operador' ? saldoDoOperador(lista, operadorId) : resumo.saldo),
    [lista, modo, operadorId, resumo.saldo],
  );

  // Sem mudança nenhuma o card não ocupa espaço. O erro também não vira tela
  // vermelha: é um card a mais na aba, não a aba.
  if (erro || (!carregando && lista.length === 0)) return null;

  const visiveis = tudo ? lista : lista.slice(0, PREVIA);

  return (
    <div className={cn('rounded-xl border border-border bg-card overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/40 transition-colors"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
          <History className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            Mudanças no relatório deste mês
          </span>
          <span className="block text-xs text-muted-foreground truncate">
            {carregando ? 'Conferindo…' : resumoEmTexto(resumo, modo)}
          </span>
        </span>
        {!carregando && saldo !== 0 && (
          <span className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold font-mono',
            saldo < 0
              ? 'text-destructive bg-destructive/10 border-destructive/25'
              : 'text-success bg-success/10 border-success/25',
          )}>
            {saldo > 0 ? '+' : ''}{formatBRL(saldo)}
          </span>
        )}
        {aberto ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>

      {aberto && (
        <div className="border-t border-border">
          {modo === 'operador' && (
            <p className="px-4 pt-3 text-xs text-muted-foreground">
              <AlertTriangle className="mr-1 inline h-3 w-3 align-[-2px] text-warning" />
              O relatório do ERP é reimportado ao longo do dia. Quando um NR que estava
              com você há mais de 24 horas sai da sua carteira ou vai para outra pessoa,
              o aviso fica aqui.
            </p>
          )}

          <ul className="divide-y divide-border/60">
            {visiveis.map(m => <Linha key={chave(m)} m={m} modo={modo} operadorId={operadorId} />)}
          </ul>

          <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-muted/20">
            {lista.length > PREVIA ? (
              <Button variant="ghost" size="sm" className="h-7 text-xs"
                onClick={() => setTudo(t => !t)}>
                {tudo ? 'Ver menos' : `Ver todas as ${lista.length}`}
              </Button>
            ) : <span />}
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5"
              onClick={recarregar} disabled={carregando}>
              <RefreshCw className={cn('h-3 w-3', carregando && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Um NR pode ter mudado mais de uma vez no mês — a data entra na chave. */
function chave(m: Mudanca): string {
  return `${m.codigo}#${m.data_pagamento}#${m.ocorrido_em}`;
}

function Linha({ m, modo, operadorId }: { m: Mudanca; modo: Props['modo']; operadorId: string }) {
  const Icone = ICONE[m.tipo];
  const texto = modo === 'operador' ? fraseParaOperador(m, operadorId) : fraseParaLideranca(m);
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className={cn(
        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
        COR[m.tipo],
      )}>
        <Icone className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-relaxed text-foreground">{texto}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          <span className={cn(
            'mr-2 rounded-full border px-1.5 py-px font-medium',
            COR[m.tipo],
          )}>
            {ROTULO_TIPO[m.tipo]}
          </span>
          {m.nome_cliente ? `${m.nome_cliente} · ` : ''}{momento(m.ocorrido_em)}
        </p>
      </div>
    </li>
  );
}

function resumoEmTexto(
  r: ReturnType<typeof resumir>, modo: Props['modo'],
): string {
  if (r.total === 0) return 'Nada mudou até agora.';
  const partes: string[] = [];
  if (r.removidos) partes.push(`${r.removidos} ${r.removidos === 1 ? 'removido' : 'removidos'}`);
  if (r.transferidos) {
    partes.push(`${r.transferidos} ${r.transferidos === 1 ? 'transferido' : 'transferidos'}`);
  }
  const alvo = modo === 'operador' ? 'na sua carteira' : 'no escopo';
  return `${partes.join(', ')} ${alvo} desde o início do mês.`;
}
