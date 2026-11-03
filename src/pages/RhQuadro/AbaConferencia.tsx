/**
 * AbaConferencia — a planilha do RH lado a lado com o sistema.
 *
 * A «importação» do pedido é esta: ler, comparar e mostrar. Nada é gravado, e
 * a tela diz isso em voz alta. O arquivo exportado por esta mesma tela é uma
 * planilha válida aqui, então dá para guardar o quadro de um mês e ver, no
 * mês seguinte, quem mudou de lugar.
 */
import { useMemo, useState, type DragEvent } from 'react';
import {
  ArrowRight, CheckCircle2, Download, FileSpreadsheet, FileUp, Info, Search, ShieldCheck, Trash2, UserMinus, UserPlus, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  normalizar, type CampoConferido, type Conferencia, type ItemConferencia, type TipoDivergencia,
} from '@/services/rh/quadroPessoal';
import { Foto } from './partes';
import { plural } from './formato';

export interface ConferenciaCarregada {
  arquivo: string;
  aba: string;
  conferencia: Conferencia;
}

const TIPOS: Record<TipoDivergencia, { rotulo: string; um: string; frase: string; Icone: typeof CheckCircle2; cor: string; fundo: string }> = {
  diferente:   { rotulo: 'Divergentes', um: 'Divergente',    frase: 'estão em outro lugar no sistema', Icone: XCircle,      cor: 'text-warning', fundo: 'bg-warning' },
  so_planilha: { rotulo: 'Só na planilha', um: 'Só na planilha', frase: 'não foram achadas no sistema',     Icone: UserMinus,    cor: 'text-destructive', fundo: 'bg-destructive' },
  so_sistema:  { rotulo: 'Só no sistema', um: 'Só no sistema',  frase: 'estão no sistema e não na planilha', Icone: UserPlus,   cor: 'text-info', fundo: 'bg-info' },
  igual:       { rotulo: 'Conferem', um: 'Confere',       frase: 'batem com o sistema',               Icone: CheckCircle2, cor: 'text-success', fundo: 'bg-success' },
};
const ORDEM: TipoDivergencia[] = ['diferente', 'so_planilha', 'so_sistema', 'igual'];

const CAMPOS: { k: CampoConferido; rotulo: string }[] = [
  { k: 'nome', rotulo: 'Nome' },
  { k: 'email', rotulo: 'E-mail' },
  { k: 'setor', rotulo: 'Setor' },
  { k: 'equipe', rotulo: 'Equipe' },
  { k: 'cargo', rotulo: 'Cargo' },
];

/** Quantas linhas a lista desenha antes do «mostrar mais». */
const PAGINA = 150;

export default function AbaConferencia({
  carregada, lendo, onArquivo, onEscolher, onLimpar, onExportar, onBaixarModelo,
}: {
  carregada: ConferenciaCarregada | null;
  lendo: boolean;
  onArquivo: (arquivo: File) => void;
  onEscolher: () => void;
  onLimpar: () => void;
  onExportar: () => void;
  onBaixarModelo: () => void;
}) {
  const [arrastando, setArrastando] = useState(false);

  const soltar = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastando(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onArquivo(f);
  };

  if (!carregada) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div
          onDragOver={e => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={soltar}
          className={cn(
            'flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition',
            arrastando ? 'border-primary bg-primary/5' : 'border-border bg-card',
          )}
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileUp className="size-7" />
          </span>
          <div>
            <p className="text-lg font-semibold text-foreground">Conferir uma planilha com o sistema</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Arraste aqui a planilha do RH (.xlsx, .xls ou .csv) e veja quem está no lugar certo,
              quem mudou e quem falta de cada lado.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={onEscolher} disabled={lendo} className="gap-1.5">
              <FileSpreadsheet className="size-4" /> {lendo ? 'Lendo…' : 'Escolher planilha'}
            </Button>
            <Button variant="outline" onClick={onBaixarModelo} className="gap-1.5">
              <Download className="size-4" /> Baixar modelo
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><ShieldCheck className="size-4 text-success" /> Nada é alterado</p>
            <p className="mt-1 text-xs text-muted-foreground">
              A planilha é lida só no seu navegador e não é enviada nem gravada. Para corrigir um cadastro,
              quem ajusta é a administração, em Usuários.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><Info className="size-4 text-info" /> Colunas que a tela reconhece</p>
            <p className="mt-1 text-xs text-muted-foreground">
              <strong className="text-foreground">Nome</strong> ou <strong className="text-foreground">E-mail</strong> (pelo menos um),
              e se tiver: Setor, Equipe e Cargo. A planilha exportada desta tela já vem assim, então você pode
              guardar o quadro de hoje e conferir no mês que vem.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <Resultado carregada={carregada} onEscolher={onEscolher} onLimpar={onLimpar} onExportar={onExportar} />;
}

function Resultado({
  carregada, onEscolher, onLimpar, onExportar,
}: {
  carregada: ConferenciaCarregada;
  onEscolher: () => void;
  onLimpar: () => void;
  onExportar: () => void;
}) {
  const { conferencia: c } = carregada;
  const [filtro, setFiltro] = useState<TipoDivergencia | null>(c.contagem.diferente ? 'diferente' : null);
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(PAGINA);
  const total = c.itens.length;

  const itens = useMemo(() => {
    const b = normalizar(busca);
    return c.itens
      .filter(it => (filtro === null || it.tipo === filtro) && (!b || normalizar(it.nome).includes(b)))
      .sort((a, z) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(z.tipo) || a.nome.localeCompare(z.nome, 'pt-BR'));
  }, [c.itens, filtro, busca]);

  const pct = total ? Math.round((c.contagem.igual / total) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* O arquivo */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <span className="flex size-10 items-center justify-center rounded-lg bg-success/10 text-success"><FileSpreadsheet className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{carregada.arquivo}</p>
          <p className="text-xs text-muted-foreground">
            Aba «{carregada.aba}» · {plural(c.linhasLidas, 'linha lida', 'linhas lidas')}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {CAMPOS.map(f => {
              const tem = !!c.colunas[f.k];
              return (
                <span
                  key={f.k}
                  title={tem ? `Coluna «${c.colunas[f.k]}»` : 'Coluna não encontrada: não entra na comparação'}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium',
                    tem ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground line-through',
                  )}
                >
                  {f.rotulo}
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onExportar}><Download className="size-3.5" /> Exportar conferência</Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onEscolher}><FileUp className="size-3.5" /> Outra planilha</Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-muted-foreground" onClick={onLimpar}><Trash2 className="size-3.5" /> Limpar</Button>
        </div>
      </div>

      {/* O placar */}
      <div className="space-y-3">
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground">{pct}%</p>
          <p className="text-sm text-muted-foreground">das pessoas conferem com o sistema</p>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
          {ORDEM.map(t => c.contagem[t] > 0 && (
            <span key={t} className={cn('h-full', TIPOS[t].fundo)} style={{ width: `${(c.contagem[t] / Math.max(total, 1)) * 100}%` }} title={`${TIPOS[t].rotulo}: ${c.contagem[t]}`} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {ORDEM.map(t => {
            const m = TIPOS[t];
            const ativo = filtro === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => { setFiltro(ativo ? null : t); setLimite(PAGINA); }}
                aria-pressed={ativo}
                className={cn(
                  'rounded-xl border p-3 text-left transition',
                  ativo ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card hover:border-primary/40',
                )}
              >
                <p className={cn('flex items-center gap-1.5 text-xs font-semibold', m.cor)}><m.Icone className="size-3.5" />{m.rotulo}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{c.contagem[t]}</p>
                <p className="text-[11px] leading-tight text-muted-foreground">{m.frase}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* A lista */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {filtro ? TIPOS[filtro].rotulo : 'Todos'} · {itens.length}
          </p>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => { setBusca(e.target.value); setLimite(PAGINA); }} placeholder="Buscar nome…" className="h-8 w-48 pl-8 text-xs" />
          </div>
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {itens.slice(0, limite).map(it => <LinhaConferencia key={it.chave} item={it} />)}
          {itens.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">Nada neste filtro.</li>}
        </ul>
        {itens.length > limite && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setLimite(l => l + PAGINA)}>
            Mostrar mais {Math.min(PAGINA, itens.length - limite)}
          </Button>
        )}
      </div>
    </div>
  );
}

function LinhaConferencia({ item }: { item: ItemConferencia }) {
  const m = TIPOS[item.tipo];
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3">
      {item.pessoa
        ? <Foto pessoa={item.pessoa} />
        : <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"><UserMinus className="size-4" /></span>}
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          {item.nome}
          <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold', m.cor)}><m.Icone className="size-3" />{m.um}</span>
          {item.ambigua && <span className="rounded bg-warning/15 px-1.5 text-[10px] font-semibold text-warning">nome repetido: conferir</span>}
        </p>
        {item.tipo === 'diferente' && (
          <ul className="mt-1.5 space-y-1">
            {item.diferencas.map(d => (
              <li key={d.campo} className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="w-14 shrink-0 font-medium capitalize text-muted-foreground">{d.campo}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-foreground line-through decoration-muted-foreground/50">{d.planilha}</span>
                <ArrowRight className="size-3 text-muted-foreground" />
                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-foreground">{d.sistema}</span>
                <span className="text-[10px] text-muted-foreground">(no sistema)</span>
              </li>
            ))}
          </ul>
        )}
        {item.tipo === 'so_planilha' && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Na planilha: {[item.planilha.setor, item.planilha.equipe, item.planilha.cargo].filter(Boolean).join(' › ') || 'sem setor'}.
            Pode ter saído, ou estar com o nome escrito diferente.
          </p>
        )}
        {(item.tipo === 'so_sistema' || item.tipo === 'igual') && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.sistema.setor} › {item.sistema.equipe} · {item.sistema.cargo}
            {item.tipo === 'so_sistema' && '. Não aparece na planilha.'}
          </p>
        )}
      </div>
    </li>
  );
}
