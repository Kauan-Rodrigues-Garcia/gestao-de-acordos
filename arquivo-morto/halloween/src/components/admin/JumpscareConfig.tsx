/**
 * JumpscareConfig.tsx — o cartão de Configurações > Geral que agenda o
 * jumpscare: a imagem em tela cheia para todo mundo, por ≈0,3 s, num horário.
 *
 * Só super_admin — as funções `fn_jumpscare_*` e o bucket conferem de novo no
 * banco. «Testar em mim» dispara só nesta aba, sem gravar nada.
 */
import { useEffect, useRef, useState } from 'react';
import { Ghost, Loader2, ImagePlus, CalendarClock, Eye, X, Crop } from 'lucide-react';
import { EditorDeRecorte } from '@/components/Jumpscare/EditorDeRecorte';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useEmpresa } from '@/hooks/useEmpresa';
import {
  DURACAO_MAX_MS, DURACAO_MIN_MS, DURACAO_PADRAO_MS, agendarJumpscare, agoraDoServidor,
  baixarImagem, cancelarJumpscare, dispararTeste, duracaoSegura, enviarImagem, useJumpscare,
} from '@/components/Jumpscare/jumpscare';

/** `Date` → valor do `<input type="datetime-local">`, no fuso de quem está vendo. */
function paraCampo(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const SEGUNDOS_DO_TESTE = 3;

export default function JumpscareConfig() {
  const { empresa } = useEmpresa();
  const agendamento = useJumpscare(empresa?.id);
  const arquivoRef = useRef<HTMLInputElement>(null);

  /**
   * A imagem escolhida aqui: a prévia local e o caminho no bucket. O caminho
   * só existe depois do envio — o teste usa a prévia e não precisa dele.
   */
  const [imagem, setImagem] = useState<{ path: string | null; url: string } | null>(null);
  const [quando, setQuando] = useState(() => paraCampo(new Date(Date.now() + 10 * 60_000)));
  const [duracao, setDuracao] = useState(String(DURACAO_PADRAO_MS));
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [contagem, setContagem] = useState<number | null>(null);
  /** O arquivo como veio do computador — dá para recortar de novo a partir dele. */
  const [original, setOriginal] = useState<File | null>(null);
  const [recortando, setRecortando] = useState(false);

  // Abre com a imagem do agendamento atual, se houver.
  const pathAtual = agendamento?.imagemPath ?? null;
  useEffect(() => {
    if (!pathAtual || imagem) return;
    let vivo = true;
    void baixarImagem(pathAtual).then(url => {
      if (!url) return;
      if (vivo) setImagem({ path: pathAtual, url }); else URL.revokeObjectURL(url);
    });
    return () => { vivo = false; };
  }, [pathAtual, imagem]);

  // A contagem do teste.
  useEffect(() => {
    if (contagem === null) return;
    if (contagem === 0) {
      if (imagem) dispararTeste(imagem.url, duracaoSegura(duracao));
      setContagem(null);
      return;
    }
    const t = setTimeout(() => setContagem(c => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [contagem, imagem, duracao]);

  /** Escolher abre o recorte; o envio é com o que sair de lá. */
  function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/')) { toast.error('Escolha uma imagem (PNG, JPG, WebP ou GIF).'); return; }
    setOriginal(arquivo);
    setRecortando(true);
  }

  async function enviar(arquivo: File) {
    setRecortando(false);
    if (arquivo.size > 2 * 1024 * 1024) {
      toast.error('A imagem pode ter no máximo 2 MB.', { description: 'Recorte um pedaço menor ou use uma imagem mais leve.' });
      return;
    }
    if (imagem) URL.revokeObjectURL(imagem.url);
    const url = URL.createObjectURL(arquivo);
    setImagem({ path: null, url });
    setEnviando(true);
    const { path, erro } = await enviarImagem(arquivo);
    setEnviando(false);
    if (erro || !path) {
      toast.error('Não foi possível enviar a imagem', { description: `${erro ?? ''} Dá para testar em você, mas não para agendar.`.trim() });
      return;
    }
    setImagem(atual => (atual?.url === url ? { path, url } : atual));
    toast.success('Imagem enviada. Falta agendar.');
  }

  async function agendar() {
    if (!imagem?.path) return;
    setSalvando(true);
    const { erro } = await agendarJumpscare(imagem.path, new Date(quando), duracaoSegura(duracao));
    setSalvando(false);
    setConfirmando(false);
    if (erro) { toast.error('Não foi possível agendar', { description: erro }); return; }
    toast.success('Jumpscare agendado 👻');
  }

  async function cancelar() {
    setSalvando(true);
    const { erro } = await cancelarJumpscare();
    setSalvando(false);
    if (erro) { toast.error('Não foi possível cancelar', { description: erro }); return; }
    toast.success('Agendamento cancelado.');
  }

  const marcado = agendamento?.disparaEm ? new Date(agendamento.disparaEm) : null;
  const pendente = marcado && marcado.getTime() > agoraDoServidor();
  const quandoData = new Date(quando);
  const quandoValido = Number.isFinite(quandoData.getTime()) && quandoData.getTime() > agoraDoServidor() + 30_000;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Ghost className="w-4 h-4 text-primary" /> Jumpscare
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          No horário marcado, a imagem aparece em tela cheia para todo mundo logado e some sozinha.
          Sem clique, sem som: quem piscar, perdeu.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <button
            type="button" onClick={() => arquivoRef.current?.click()} disabled={enviando}
            className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
            title="Escolher imagem"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" />
              : imagem ? <img src={imagem.url} alt="" className="h-full w-full object-cover" />
              : <ImagePlus className="h-5 w-5" />}
          </button>
          <input
            ref={arquivoRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
            onChange={e => { escolher(e.target.files?.[0]); e.target.value = ''; }}
          />

          <div className="space-y-1">
            <Label className="text-xs">Horário</Label>
            <Input type="datetime-local" step={1} value={quando} onChange={e => setQuando(e.target.value)} className="h-8 w-52 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Duração (ms)</Label>
            <Input
              type="number" min={DURACAO_MIN_MS} max={DURACAO_MAX_MS} step={50}
              value={duracao} onChange={e => setDuracao(e.target.value)}
              onBlur={() => setDuracao(String(duracaoSegura(duracao)))}
              className="h-8 w-24 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="gap-1.5" disabled={!imagem?.path || !quandoValido || salvando} onClick={() => setConfirmando(true)}>
            <CalendarClock className="w-3.5 h-3.5" /> Agendar para todos
          </Button>
          <Button
            size="sm" variant="outline" className="gap-1.5"
            disabled={!imagem || contagem !== null}
            onClick={() => setContagem(SEGUNDOS_DO_TESTE)}
          >
            <Eye className="w-3.5 h-3.5" />
            {contagem !== null ? `Olhe a tela… ${contagem}` : 'Testar só em mim'}
          </Button>
          {original && (
            <Button size="sm" variant="outline" className="gap-1.5" disabled={enviando} onClick={() => setRecortando(true)}>
              <Crop className="w-3.5 h-3.5" /> Ajustar recorte
            </Button>
          )}
          {pendente && (
            <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" disabled={salvando} onClick={() => void cancelar()}>
              <X className="w-3.5 h-3.5" /> Cancelar agendamento
            </Button>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          {pendente && marcado
            ? <>Agendado para <strong className="text-foreground">{marcado.toLocaleString('pt-BR')}</strong>, {agendamento?.duracaoMs} ms.</>
            : 'Nada agendado.'}
          {' '}O teste aparece só nesta aba, em {SEGUNDOS_DO_TESTE} s, e não grava nada.
          {!quandoValido && ' O horário precisa ser pelo menos 30 s no futuro.'}
        </p>
      </CardContent>

      <EditorDeRecorte
        arquivo={recortando ? original : null}
        onFechar={() => setRecortando(false)}
        onPronto={f => { void enviar(f); }}
      />

      <AlertDialog open={confirmando} onOpenChange={v => !salvando && setConfirmando(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Agendar o jumpscare para todos?</AlertDialogTitle>
            <AlertDialogDescription>
              Em {quandoValido ? quandoData.toLocaleString('pt-BR') : '—'} a imagem aparece em tela cheia para
              todo mundo logado, em todas as empresas, por {duracaoSegura(duracao)} ms.
              {pendente && ' O agendamento atual é substituído.'} Dá para cancelar aqui até a hora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={salvando} onClick={e => { e.preventDefault(); void agendar(); }}>
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Agendar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
