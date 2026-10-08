/**
 * O dia aberto. Para quem consulta, é a leitura por extenso — no celular é o
 * único jeito de ver o que a casa resume em pontos. Para quem monta, é onde se
 * lança, corrige e exclui o que acontece naquele dia.
 *
 * Abrir e fechar sem pulo: o diálogo guarda o último dia aberto (`vista`) e
 * continua mostrando-o durante a animação de saída — antes ele se esvaziava
 * no meio do fechamento. E o dia vazio, para quem monta, já nasce no
 * formulário, em vez de mostrar a leitura por um quadro e trocar.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { INFO_TIPO, rotuloDoDia, type EventoCalendario, type FeriadoDoDia } from '@/lib/calendarioSetor';
import {
  excluirEvento, salvarEvento, type PessoaDoSetor,
} from '@/services/calendario/calendario.service';
import { AvatarParticipante } from '@/pages/Analitico/Desafios/AvatarParticipante';
import { FormEvento } from './FormEvento';
import {
  RASCUNHO_VAZIO, detalheDoRascunho, faltaNoRascunho, rascunhoDoEvento, type RascunhoEvento,
} from './rascunho';
import { IconeTipo } from './tipos';

interface Props {
  iso: string | null;
  eventos: EventoCalendario[];
  util: boolean;
  /** O feriado do dia: das Metas (`folga`) ou só nacional. */
  feriado: FeriadoDoDia | null;
  podeEditar: boolean;
  empresaId: string;
  setorId: string;
  pessoas: PessoaDoSetor[] | null;
  /** Pede a lista de pessoas — só quem edita precisa dela. */
  onPrecisaPessoas: () => void;
  /** De onde vem o feriado — o formulário lembra quem procurar o modelo. */
  notaFeriado: string;
  onMudou: () => void;
  onFechar: () => void;
  /** As cores do tema: o diálogo abre num portal, fora do contêiner que as define. */
  tema: CSSProperties;
}

/** `undefined` = lendo; `null` = lançando um novo; evento = corrigindo. */
type Edicao = EventoCalendario | null | undefined;

interface Vista {
  iso: string;
  eventos: EventoCalendario[];
  util: boolean;
  feriado: FeriadoDoDia | null;
}

export function DialogoDia({
  iso, eventos, util, feriado, podeEditar, empresaId, setorId, pessoas,
  onPrecisaPessoas, notaFeriado, onMudou, onFechar, tema,
}: Props) {
  const [edicao, setEdicao] = useState<Edicao>(undefined);
  const [rascunho, setRascunho] = useState<RascunhoEvento>(RASCUNHO_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState<string | null>(null);

  // O que está na tela. Fechado (`iso` nulo), fica o último dia, para a
  // animação de saída não mostrar um diálogo vazio.
  const [vista, setVista] = useState<Vista | null>(null);
  const [isoAnterior, setIsoAnterior] = useState<string | null>(null);
  if (iso !== isoAnterior) {
    setIsoAnterior(iso);
    // Abriu um dia: começa do zero — já no formulário, se é dia vazio de quem monta.
    if (iso) {
      setEdicao(podeEditar && eventos.length === 0 ? null : undefined);
      setRascunho(RASCUNHO_VAZIO);
      setConfirmarExclusao(null);
    }
  }
  if (iso && (vista?.iso !== iso || vista.eventos !== eventos || vista.util !== util || vista.feriado !== feriado)) {
    setVista({ iso, eventos, util, feriado });
  }

  // O formulário precisa da lista de pessoas; pedir é efeito, não render.
  useEffect(() => {
    if (iso && podeEditar && eventos.length === 0) onPrecisaPessoas();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir o dia
  }, [iso]);

  function abrirNovo() {
    setRascunho(RASCUNHO_VAZIO);
    setEdicao(null);
    onPrecisaPessoas();
  }

  function abrirCorrecao(e: EventoCalendario) {
    setRascunho(rascunhoDoEvento(e));
    setEdicao(e);
    onPrecisaPessoas();
  }

  async function salvar() {
    if (!iso) return;
    const falta = faltaNoRascunho(rascunho);
    if (falta) { toast.error(falta); return; }
    setSalvando(true);
    try {
      await salvarEvento(empresaId, setorId, {
        id: edicao ? edicao.id : null,
        dias: [iso],
        tipo: rascunho.tipo,
        titulo: rascunho.titulo.trim(),
        detalhe: detalheDoRascunho(rascunho),
        pessoa_id: rascunho.tipo === 'aniversario' ? rascunho.pessoa_id : null,
        destaque: rascunho.destaque,
      });
      toast.success(edicao ? 'Evento corrigido.' : 'Evento lançado.');
      setEdicao(undefined);
      onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string) {
    setSalvando(true);
    try {
      await excluirEvento(empresaId, id);
      toast.success('Evento excluído.');
      setConfirmarExclusao(null);
      onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível excluir.');
    } finally {
      setSalvando(false);
    }
  }

  const lendo = edicao === undefined;
  const dia = vista;

  return (
    <Dialog open={!!iso} onOpenChange={aberto => { if (!aberto) onFechar(); }}>
      <DialogContent className="cal-raiz max-h-[90vh] overflow-y-auto sm:max-w-lg" style={tema}>
        <DialogHeader>
          <DialogTitle>{dia ? rotuloDoDia(dia.iso) : ''}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1.5">
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
              dia?.util ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground',
            )}>
              {dia?.util ? 'Dia útil' : 'Não é dia útil'}
            </span>
            {dia?.feriado && (dia.feriado.folga ? (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-300">
                {dia.feriado.nome} · a operação não trabalha
              </span>
            ) : (
              <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                {dia.feriado.nome} · expediente normal
              </span>
            ))}
          </DialogDescription>
        </DialogHeader>

        {lendo ? (
          <div className="space-y-3">
            {(dia?.eventos ?? []).length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Nada marcado para este dia.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {dia?.eventos.map(e => (
                  <li key={e.id} className="flex items-center gap-3 px-3 py-3">
                    {e.tipo === 'aniversario' && e.pessoa_nome
                      ? <AvatarParticipante nome={e.pessoa_nome} fotoUrl={e.pessoa_foto} className="h-9 w-9 shrink-0" />
                      : <IconeTipo tipo={e.tipo} className="h-9 w-9" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {e.titulo}
                        {e.tipo === 'aniversario' && e.pessoa_nome && <span className="font-normal"> · {e.pessoa_nome}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[INFO_TIPO[e.tipo].rotulo, e.detalhe].filter(Boolean).join(' · ')}
                        {e.destaque && ' · em destaque'}
                      </p>
                    </div>
                    {podeEditar && (
                      confirmarExclusao === e.id ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button size="sm" variant="destructive" disabled={salvando} onClick={() => void excluir(e.id)}>
                            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Excluir'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmarExclusao(null)}>Não</Button>
                        </div>
                      ) : (
                        <div className="flex shrink-0 items-center">
                          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Corrigir ${e.titulo}`} onClick={() => abrirCorrecao(e)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Excluir ${e.titulo}`} onClick={() => setConfirmarExclusao(e.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )
                    )}
                  </li>
                ))}
              </ul>
            )}
            {podeEditar && (
              <Button className="w-full gap-2" variant="outline" onClick={abrirNovo}>
                <Plus className="h-4 w-4" /> Lançar neste dia
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <FormEvento valor={rascunho} onChange={setRascunho} pessoas={pessoas} notaFeriado={notaFeriado} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEdicao(undefined)} disabled={salvando}>
                {(dia?.eventos ?? []).length === 0 && !edicao ? 'Cancelar' : 'Voltar'}
              </Button>
              <Button onClick={() => void salvar()} disabled={salvando} className="gap-2">
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                {edicao ? 'Salvar correção' : 'Lançar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
