/**
 * TabelaFechamento — a tabela da planilha, com duas colunas que se preenchem.
 *
 * Das nove colunas, sete são leitura: vêm do Analítico, das Metas e das contas
 * de `calculoFechamento`. D.U. TRABALHADO e SITUAÇÃO são as únicas que a
 * gerência escreve, e só com `fechamento_editar`.
 *
 * ## Quando grava
 *
 * A situação grava ao escolher. O D.U. grava ao sair do campo (ou Enter): gravar
 * a cada tecla mandaria «1» e depois «16», e o card de média por dia útil
 * piscaria um número absurdo no meio. Esc devolve o valor salvo.
 *
 * O desenho da linha e do selo de quartil é o da aba Quartis do Analítico.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatBRL } from '@/lib/money';
import { COR_QUARTIL } from '@/lib/diasUteis';
import { cn } from '@/lib/utils';
import {
  SITUACOES_FECHAMENTO, ehSituacaoFechamento,
} from '@/services/fechamentoOperadores/situacoes';
import type { LinhaFechamento } from '@/services/fechamentoOperadores/calculoFechamento';
import type { ManualFechamento } from '@/services/fechamentoOperadores/fechamentoOperadores.service';
import { corTexto } from '@/lib/temas';

/** O `Select` do shadcn recusa `value=""`; «sem situação» precisa de um valor. */
const SEM_SITUACAO = '__sem_situacao__';

function formatarAlcance(fracao: number): string {
  return `${(fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** «16» → 16; vazio → null; qualquer outra coisa → undefined (inválido). */
function lerDu(texto: string): number | null | undefined {
  const t = texto.trim();
  if (t === '') return null;
  if (!/^\d{1,2}$/.test(t)) return undefined;
  const n = Number(t);
  return n >= 0 && n <= 31 ? n : undefined;
}

interface PropsLinha {
  linha: LinhaFechamento;
  podeEditar: boolean;
  salvando: boolean;
  onSalvar: (manual: ManualFechamento) => void;
  onInvalido: (mensagem: string) => void;
}

function Linha({ linha: l, podeEditar, salvando, onSalvar, onInvalido }: PropsLinha) {
  const salvoDu = l.duTrabalhado === null ? '' : String(l.duTrabalhado);
  const [rascunhoDu, setRascunhoDu] = useState(salvoDu);
  const [editandoDu, setEditandoDu] = useState(false);
  const cancelouDu = useRef(false);

  // Uma releitura (ou a volta de uma gravação recusada) traz o valor do banco.
  // Enquanto a pessoa digita, o que ela digitou manda.
  useEffect(() => {
    if (!editandoDu) setRascunhoDu(salvoDu);
  }, [salvoDu, editandoDu]);

  const cor = l.quartil !== null ? COR_QUARTIL[l.quartil] ?? '#6366f1' : undefined;

  function confirmarDu() {
    setEditandoDu(false);
    if (cancelouDu.current) {
      cancelouDu.current = false;
      setRascunhoDu(salvoDu);
      return;
    }
    const valor = lerDu(rascunhoDu);
    if (valor === undefined) {
      onInvalido('D.U. trabalhado precisa ser um número inteiro de 0 a 31.');
      setRascunhoDu(salvoDu);
      return;
    }
    if (valor === l.duTrabalhado) return;
    onSalvar({ duTrabalhado: valor, situacao: l.situacao });
  }

  return (
    <tr
      className="border-t border-border/50"
      style={cor ? { boxShadow: `inset 3px 0 0 0 ${cor}` } : undefined}
    >
      <td className="px-2 py-1.5">
        <div className="min-w-0">
          <p className="font-medium truncate max-w-[180px]" title={l.nome}>{l.nome}</p>
          {l.equipeNome && (
            <p className="text-[10px] text-muted-foreground truncate max-w-[180px]" title={l.equipeNome}>
              {l.equipeNome}
            </p>
          )}
        </div>
      </td>

      <td className="px-2 py-1.5 text-right tabular-nums font-mono font-semibold">
        {formatBRL(l.fechamento)}
      </td>

      <td className="px-2 py-1.5 text-right tabular-nums font-mono">
        {l.meta !== null ? formatBRL(l.meta) : <span className="text-muted-foreground italic font-sans text-[10px]">sem meta</span>}
      </td>

      <td className="px-2 py-1.5 text-center">
        {l.metaAtingida === null ? (
          <span className="text-muted-foreground">—</span>
        ) : l.metaAtingida === 0 ? (
          <span className="text-muted-foreground text-[10px]" title="Tem meta e ainda não alcançou a 1ª">nenhuma</span>
        ) : (
          <span className="inline-block rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold text-primary whitespace-nowrap">
            {l.metaAtingida}ª META
          </span>
        )}
      </td>

      <td className="px-2 py-1.5 text-center">
        {podeEditar ? (
          <input
            inputMode="numeric"
            aria-label={`D.U. trabalhado de ${l.nome}`}
            value={rascunhoDu}
            placeholder="—"
            disabled={salvando}
            onFocus={() => setEditandoDu(true)}
            onChange={e => setRascunhoDu(e.target.value.replace(/\D/g, '').slice(0, 2))}
            onBlur={confirmarDu}
            onKeyDown={e => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                // O blur que vem em seguida ainda enxerga o rascunho digitado;
                // a marca faz ele desistir em vez de gravar.
                cancelouDu.current = true;
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="h-7 w-14 rounded-md border border-border bg-background px-2 text-center text-[12px] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
        ) : (
          <span className="tabular-nums font-mono">{l.duTrabalhado ?? '—'}</span>
        )}
      </td>

      <td className="px-2 py-1.5">
        {podeEditar ? (
          <div className="flex items-center gap-1.5">
            <Select
              value={l.situacao ?? SEM_SITUACAO}
              disabled={salvando}
              onValueChange={v => {
                const situacao = ehSituacaoFechamento(v) ? v : null;
                if (situacao === l.situacao) return;
                onSalvar({ duTrabalhado: l.duTrabalhado, situacao });
              }}
            >
              <SelectTrigger className="h-7 w-[150px] rounded-md text-[11px]" aria-label={`Situação de ${l.nome}`}>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_SITUACAO} className="text-muted-foreground">— sem situação —</SelectItem>
                {SITUACOES_FECHAMENTO.map(s => (
                  <SelectItem key={s.codigo} value={s.codigo} className="text-[12px]">{s.rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Salvando" />}
          </div>
        ) : (
          <span className="text-[11px]">
            {SITUACOES_FECHAMENTO.find(s => s.codigo === l.situacao)?.rotulo ?? '—'}
          </span>
        )}
      </td>

      <td className="px-2 py-1.5 text-right tabular-nums font-mono font-bold"
          style={cor && l.alcance !== null ? { color: corTexto(cor) } : undefined}>
        {l.alcance !== null ? formatarAlcance(l.alcance) : <span className="text-muted-foreground font-normal">—</span>}
      </td>

      <td className="px-2 py-1.5 text-center">
        {l.quartil !== null ? (
          <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap"
                style={{ background: (cor ?? '#6366f1') + '26', color: corTexto(cor) }}>
            {l.quartil}º quartil
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      <td className="px-2 py-1.5 text-right tabular-nums font-mono">
        {l.mediaPorDu !== null ? formatBRL(l.mediaPorDu) : <span className="text-muted-foreground">—</span>}
      </td>
    </tr>
  );
}

interface PropsTabela {
  linhas: LinhaFechamento[];
  podeEditar: boolean;
  salvandoId: string | null;
  onSalvar: (operadorId: string, manual: ManualFechamento) => void;
  onInvalido: (mensagem: string) => void;
}

const CABECALHO: { rotulo: string; alinhamento: string; dica?: string }[] = [
  { rotulo: 'OPERADOR', alinhamento: 'text-left' },
  { rotulo: 'FECHAMENTO', alinhamento: 'text-right', dica: 'Recebimento do operador no Analítico, no mês' },
  { rotulo: 'META', alinhamento: 'text-right', dica: 'Meta do operador cadastrada em Metas' },
  { rotulo: 'META ATINGIDA', alinhamento: 'text-center', dica: 'Maior degrau alcançado: 1ª meta é a meta do mês, as seguintes são as metas extras' },
  { rotulo: 'D.U. TRABALHADO', alinhamento: 'text-center', dica: 'Dias úteis trabalhados — preenchido no fechamento' },
  { rotulo: 'SITUAÇÃO', alinhamento: 'text-left', dica: 'Situação do operador neste fechamento. Não altera o cadastro do usuário' },
  { rotulo: 'ALCANCE META', alinhamento: 'text-right', dica: 'Fechamento ÷ meta' },
  { rotulo: 'QUARTIL', alinhamento: 'text-center', dica: 'Faixa configurada em Metas, pela mesma conta da aba Quartis do Analítico' },
  { rotulo: 'MÉDIA FAT. D.U.', alinhamento: 'text-right', dica: 'Fechamento ÷ D.U. trabalhado' },
];

export function TabelaFechamento({ linhas, podeEditar, salvandoId, onSalvar, onInvalido }: PropsTabela) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[980px] text-[11px]">
        <thead>
          <tr className="bg-muted/40 border-b border-border">
            {CABECALHO.map(c => (
              <th key={c.rotulo} scope="col" title={c.dica}
                  className={cn('px-2 py-2 font-semibold text-muted-foreground whitespace-nowrap', c.alinhamento)}>
                {c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => (
            <Linha
              key={l.operadorId}
              linha={l}
              podeEditar={podeEditar}
              salvando={salvandoId === l.operadorId}
              onSalvar={manual => onSalvar(l.operadorId, manual)}
              onInvalido={onInvalido}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
