/**
 * Aplicar um modelo em vários dias de uma vez — «banco de horas em todos os
 * sábados», «expediente até bater a meta no último dia». Grava um evento por
 * dia escolhido; depois, cada um se corrige ou exclui sozinho no dia.
 *
 * Os atalhos (dias úteis, um dia da semana inteiro) e a mini-grade marcam os
 * dias.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  SEMANA_CURTA, diasDaRegra, rotuloDoMesLongo, semanasDoMes, type RegraDias,
} from '@/lib/calendarioSetor';
import { salvarEvento, type PessoaDoSetor } from '@/services/calendario/calendario.service';
import { FormEvento } from './FormEvento';
import { RASCUNHO_VAZIO, detalheDoRascunho, faltaNoRascunho, type RascunhoEvento } from './rascunho';

interface Props {
  aberto: boolean;
  mes: string;
  ehDiaUtil: (iso: string) => boolean;
  empresaId: string;
  setorId: string;
  pessoas: PessoaDoSetor[] | null;
  /** De onde vem o feriado — o formulário lembra quem procurar o modelo. */
  notaFeriado: string;
  onMudou: () => void;
  onFechar: () => void;
  /** As cores do tema: o diálogo abre num portal, fora do contêiner que as define. */
  tema: CSSProperties;
}

const ATALHOS: { rotulo: string; regra: RegraDias }[] = [
  { rotulo: 'Dias úteis',     regra: { tipo: 'dias_uteis' } },
  { rotulo: 'Fins de semana', regra: { tipo: 'fins_de_semana' } },
  { rotulo: 'O mês inteiro',  regra: { tipo: 'todos' } },
];

export function DialogoLote({
  aberto, mes, ehDiaUtil, empresaId, setorId, pessoas, notaFeriado, onMudou, onFechar, tema,
}: Props) {
  const [rascunho, setRascunho] = useState<RascunhoEvento>(RASCUNHO_VAZIO);
  const [dias, setDias] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  // Abriu (ou mudou o mês): começa do zero já no primeiro quadro, e não um
  // quadro depois, num efeito — o que mostrava o lançamento anterior piscando.
  const [aberturaAnterior, setAberturaAnterior] = useState<string | null>(null);
  const abertura = aberto ? mes : null;
  if (abertura !== aberturaAnterior) {
    setAberturaAnterior(abertura);
    if (abertura) { setRascunho(RASCUNHO_VAZIO); setDias(new Set()); }
  }

  const semanas = useMemo(() => semanasDoMes(mes), [mes]);
  const marcar = (regra: RegraDias) => setDias(new Set(diasDaRegra(mes, regra, ehDiaUtil)));
  const alternar = (iso: string) => setDias(atual => {
    const novo = new Set(atual);
    if (novo.has(iso)) novo.delete(iso); else novo.add(iso);
    return novo;
  });
  /** O dia da semana está todo marcado? Liga o chip correspondente. */
  const semanaInteira = (dow: number) => {
    const daSemana = diasDaRegra(mes, { tipo: 'semana', dia: dow }, ehDiaUtil);
    return daSemana.length > 0 && daSemana.every(d => dias.has(d));
  };
  const alternarSemana = (dow: number) => {
    const daSemana = diasDaRegra(mes, { tipo: 'semana', dia: dow }, ehDiaUtil);
    const ligar = !semanaInteira(dow);
    setDias(atual => {
      const novo = new Set(atual);
      for (const d of daSemana) { if (ligar) novo.add(d); else novo.delete(d); }
      return novo;
    });
  };

  async function salvar() {
    const falta = faltaNoRascunho(rascunho);
    if (falta) { toast.error(falta); return; }
    if (dias.size === 0) { toast.error('Escolha ao menos um dia.'); return; }
    setSalvando(true);
    try {
      const n = await salvarEvento(empresaId, setorId, {
        id: null,
        dias: [...dias].sort(),
        tipo: rascunho.tipo,
        titulo: rascunho.titulo.trim(),
        detalhe: detalheDoRascunho(rascunho),
        pessoa_id: rascunho.tipo === 'aniversario' ? rascunho.pessoa_id : null,
        destaque: rascunho.destaque,
      });
      toast.success(`${n} ${n === 1 ? 'dia lançado' : 'dias lançados'}.`);
      onMudou();
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a) onFechar(); }}>
      <DialogContent className="cal-raiz max-h-[92vh] overflow-y-auto sm:max-w-2xl" style={tema}>
        <DialogHeader>
          <DialogTitle>Aplicar em vários dias</DialogTitle>
          <DialogDescription>
            Escolha o modelo e marque os dias de {rotuloDoMesLongo(mes).toLowerCase()}. Um evento é lançado em cada dia marcado.
          </DialogDescription>
        </DialogHeader>

        <FormEvento valor={rascunho} onChange={setRascunho} pessoas={pessoas} notaFeriado={notaFeriado} />

        <div className="space-y-3 rounded-2xl border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
              Dias <span className="font-normal text-muted-foreground">· {dias.size} marcado{dias.size === 1 ? '' : 's'}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ATALHOS.map(a => (
                <Button key={a.rotulo} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => marcar(a.regra)}>
                  {a.rotulo}
                </Button>
              ))}
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setDias(new Set())}>
                Limpar
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {SEMANA_CURTA.map((d, dow) => (
              <button
                key={d}
                type="button"
                data-ligado={semanaInteira(dow)}
                onClick={() => alternarSemana(dow)}
                title={`Marcar ou desmarcar todas as ${d.toLowerCase()}`}
                className="cal-opcao rounded-lg border border-border py-1 text-[11px] font-semibold uppercase text-muted-foreground transition-colors hover:bg-muted"
              >
                {d}
              </button>
            ))}
            {semanas.flat().map((iso, i) => iso ? (
              <button
                key={iso}
                type="button"
                aria-pressed={dias.has(iso)}
                onClick={() => alternar(iso)}
                className={cn(
                  'h-9 rounded-lg border text-sm tabular-nums transition-colors',
                  dias.has(iso)
                    ? 'border-transparent bg-[var(--cal-forte)] font-semibold text-[var(--cal-sobre-acento)]'
                    : cn('border-border hover:bg-muted', ehDiaUtil(iso) ? 'text-foreground' : 'bg-muted/60 text-muted-foreground'),
                )}
              >
                {Number(iso.slice(8, 10))}
              </button>
            ) : <span key={`v-${i}`} />)}
          </div>
          <p className="text-[11px] text-muted-foreground">Clique no dia da semana para marcar todos de uma vez. Dias em cinza não são úteis.</p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando || dias.size === 0} className="gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Lançar em {dias.size} {dias.size === 1 ? 'dia' : 'dias'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
