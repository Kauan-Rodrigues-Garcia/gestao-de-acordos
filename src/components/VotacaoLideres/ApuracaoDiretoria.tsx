/**
 * ApuracaoDiretoria — a apuração de verdade, em tela cheia (09/11/2026).
 *
 * Abre para a diretoria (card no canto, `AvisoVotacao`) e para o super_admin
 * (Configurações › Votação da Liderança) quando a votação está ENCERRADA. Lê
 * `fn_votacao_lideranca_apuracao` (a contagem, nunca em quem cada um votou),
 * grava cada desempate na hora e libera o resultado — o banco só deixa liberar
 * com todos os empates decididos. Liberado, os líderes veem o card «Saiu o
 * resultado».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { FileSpreadsheet, Loader2, Scale, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apurar, type Desempates, type Votos } from './cedula';
import {
  desempatar, lerApuracao, liberarResultado, mensagemDoErro, montarDoRetrato, regrasDoRetrato, type ApuracaoDaVotacao,
} from './banco';
import { textosDo } from './textos';
import { VisaoDiretoria } from './VisaoDiretoria';
import { PerfilDosGerentes } from './PerfilDosGerentes';
import { baixarCampeoes } from './baixarCampeoes';

interface Props {
  votacaoId: string;
  titulo: string;
  onFechar: () => void;
  /** Depois de liberar: quem abriu recarrega a lista / o card. */
  onLiberado: () => void;
}

export function ApuracaoDiretoria({ votacaoId, titulo, onFechar, onLiberado }: Props) {
  const [retrato, setRetrato] = useState<ApuracaoDaVotacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ocupado = useRef(false);

  const carregar = useCallback(async () => {
    try {
      setRetrato(await lerApuracao(votacaoId));
      setErro(null);
    } catch (e) {
      setErro(mensagemDoErro(e));
    }
  }, [votacaoId]);

  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', tecla);
    return () => { document.body.style.overflow = antes; window.removeEventListener('keydown', tecla); };
  }, [onFechar]);

  const montado = useMemo(() => {
    if (!retrato) return null;
    const { cedula, pessoas } = montarDoRetrato(retrato);
    const votos: Votos = {};
    for (const c of retrato.contagem ?? []) (votos[c.pergunta_id] ??= {})[c.candidato_id] = c.votos;
    const desempates: Desempates = Object.fromEntries((retrato.desempates ?? []).map(d => [d.pergunta_id, d.escolhido_id]));
    return { pessoas, resultados: apurar(cedula, votos), desempates, ...regrasDoRetrato(retrato) };
  }, [retrato]);
  const guardada = !!retrato?.votacao.guardada_em;

  const aoDesempatar = async (perguntaId: string, liderId: string) => {
    if (ocupado.current || !montado) return;
    ocupado.current = true;
    // Mostra a escolha na hora; o banco confirma (ou a tela volta ao que está gravado).
    setRetrato(r => r && {
      ...r,
      desempates: [...(r.desempates ?? []).filter(d => d.pergunta_id !== perguntaId), { pergunta_id: perguntaId, escolhido_id: liderId }],
    });
    try {
      await desempatar(votacaoId, perguntaId, liderId);
    } catch (e) {
      toast.error('Não deu para gravar o desempate', { description: mensagemDoErro(e) });
      await carregar();
    } finally {
      ocupado.current = false;
    }
  };

  const aoLiberar = async () => {
    if (ocupado.current) return;
    if (!window.confirm(`Liberar o resultado de «${titulo}»? Todos os participantes passam a ver quem levou cada categoria. Não dá para desfazer.`)) return;
    ocupado.current = true;
    try {
      await liberarResultado(votacaoId);
      toast.success('Resultado liberado', { description: 'Quem participou vai ver o card «Saiu o resultado».' });
      onLiberado();
    } catch (e) {
      toast.error('Não deu para liberar', { description: mensagemDoErro(e) });
      await carregar();
    } finally {
      ocupado.current = false;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-background text-foreground" role="dialog" aria-modal="true" aria-label={`Apuração: ${titulo}`}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><Scale className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{textosDo(montado?.tipo).nome} · apuração</p>
            <p className="truncate text-[11px] text-muted-foreground">{titulo}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* A planilha sai do que está na tela, com as decisões de agora. */}
          <Button variant="outline" size="sm" className="gap-1.5" disabled={!retrato}
            onClick={() => {
              if (!retrato) return;
              baixarCampeoes(retrato).catch((e: unknown) => toast.error('Não deu para montar o Excel', { description: mensagemDoErro(e) }));
            }}>
            <FileSpreadsheet className="h-4 w-4" /> <span className="hidden sm:inline">Baixar</span> Excel
          </Button>
          <Button variant="ghost" size="icon" onClick={onFechar} aria-label="Fechar a apuração"><X className="h-5 w-5" /></Button>
        </div>
      </header>
      <main className="relative min-h-0 flex-1 overflow-y-auto">
        {erro && (
          <div className="mx-auto mt-10 max-w-md space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <p>Não deu para abrir a apuração: {erro}</p>
            <Button size="sm" variant="outline" onClick={() => void carregar()}>Tentar de novo</Button>
          </div>
        )}
        {!erro && !montado && (
          <p className="mt-10 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Apurando…</p>
        )}
        {montado && guardada && (
          <p className="mx-auto mt-4 max-w-4xl rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning">
            Esta votação está guardada: dá para conferir a apuração, mas para decidir ou liberar é preciso tirar da gaveta (Configurações › Votação da Liderança).
          </p>
        )}
        {montado && montado.tipo === 'gerentes' && (
          <PerfilDosGerentes resultados={montado.resultados} pessoas={montado.pessoas} selo="Só a diretoria vê"
            onLiberar={() => { if (guardada) { toast.error('A votação está guardada', { description: 'Tire da gaveta antes de liberar.' }); return; } void aoLiberar(); }} />
        )}
        {montado && montado.tipo !== 'gerentes' && (
          <VisaoDiretoria resultados={montado.resultados} pessoas={montado.pessoas} desempates={montado.desempates}
            umTitulo={montado.umTitulo} tipo={montado.tipo}
            onDesempatar={(pid, id) => { if (guardada) { toast.error('A votação está guardada', { description: 'Tire da gaveta antes de decidir.' }); return; } void aoDesempatar(pid, id); }}
            onLiberar={() => { if (guardada) { toast.error('A votação está guardada', { description: 'Tire da gaveta antes de liberar.' }); return; } void aoLiberar(); }} />
        )}
      </main>
    </div>,
    document.body,
  );
}
