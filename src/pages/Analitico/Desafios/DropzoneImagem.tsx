/**
 * DropzoneImagem — uma imagem da campanha: arrastar, colar ou clicar.
 *
 * ## Por que arrastar importa aqui
 *
 * Porque a arte da campanha nasce em outra janela — o designer manda no
 * WhatsApp, a pessoa salva e arrasta. Obrigar a passar pelo seletor de
 * arquivos do sistema para cada troca é o passo que faz alguém desistir de
 * trocar a imagem.
 *
 * Colar (Ctrl+V) cobre o outro caminho: o print que ainda nem virou arquivo.
 *
 * ## O recorte é escolha, não padrão
 *
 * A prévia mostra a imagem EXATAMENTE como a tela vai desenhá-la, e o botão
 * ao lado troca entre as duas leituras:
 *
 *   cobrir — preenche o espaço e corta o que sobra;
 *   conter — mostra a imagem inteira, com margem onde faltar.
 *
 * Antes só existia `cobrir`, e um cartaz vertical num espaço horizontal virava
 * um zoom no meio da arte. Quem escolhe a imagem é quem sabe se ela pode ser
 * cortada.
 *
 * ## O arquivo sobe na hora
 *
 * Quem escolhe uma imagem quer vê-la. Segurar o arquivo até o botão de gravar
 * deixaria a pessoa configurando às cegas, e um erro de upload só apareceria
 * depois de todo o formulário preenchido. O preço é o arquivo órfão quando
 * alguém desiste — trocar a imagem apaga a anterior aqui mesmo, então o
 * resíduo é no máximo um arquivo por desistência.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Crop, Image as ImageIcon, Loader2, Maximize2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { enviarMidiaDesafio, removerMidiaDesafio } from '@/services/desafios/desafios.service';
import type { AjusteImagem } from '@/services/desafios/types';

export interface DropzoneImagemProps {
  empresaId: string;
  rotulo: string;
  /** Uma frase dizendo ONDE esta imagem aparece. */
  ajuda: string;
  url: string | null;
  caminho: string | null;
  ajuste: AjusteImagem;
  /** Proporção da prévia. A do destaque é o selo; a da arte é o cartaz. */
  proporcao: string;
  onChange: (m: { url: string | null; caminho: string | null; ajuste: AjusteImagem }) => void;
}

const TIPOS_ACEITOS = 'image/png,image/jpeg,image/webp,image/gif';

export function DropzoneImagem({
  empresaId, rotulo, ajuda, url, caminho, ajuste, proporcao, onChange,
}: DropzoneImagemProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const zonaRef  = useRef<HTMLDivElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const idAjuda = useId();

  async function enviar(arquivo: File) {
    if (!arquivo.type.startsWith('image/')) {
      toast.error('Isso não é uma imagem.');
      return;
    }

    setEnviando(true);
    const { dados, error } = await enviarMidiaDesafio({ empresaId, arquivo });
    setEnviando(false);

    if (error || !dados) {
      toast.error(error ?? 'Não foi possível enviar o arquivo.');
      return;
    }

    // A anterior sai só depois de a nova entrar: se o upload falhasse, apagar
    // primeiro deixaria a campanha sem imagem nenhuma.
    if (caminho) void removerMidiaDesafio(caminho);

    onChange({ url: dados.url, caminho: dados.caminho, ajuste });
    toast.success(`${rotulo} atualizada.`);
  }

  /*
   * Colar (Ctrl+V) só vale enquanto o ponteiro está sobre ESTA zona.
   *
   * A tela tem duas — destaque e arte —, e um `paste` global mandaria a
   * imagem para as duas, ou para a errada. O `:hover` é o desempate mais
   * barato que existe e não pede nenhum estado a mais.
   */
  useEffect(() => {
    const aoColar = (e: ClipboardEvent) => {
      const zona = zonaRef.current;
      if (!zona || !zona.matches(':hover')) return;
      const arquivo = Array.from(e.clipboardData?.files ?? [])
        .find(f => f.type.startsWith('image/'));
      if (!arquivo) return;
      e.preventDefault();
      void enviar(arquivo);
    };
    window.addEventListener('paste', aoColar);
    return () => window.removeEventListener('paste', aoColar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caminho, ajuste, empresaId]);

  const vazio = !url;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm font-medium">{rotulo}</Label>
        {url && (
          <button
            type="button"
            onClick={() => onChange({
              url, caminho, ajuste: ajuste === 'cobrir' ? 'conter' : 'cobrir',
            })}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            title={ajuste === 'cobrir'
              ? 'A imagem está preenchendo o espaço e sendo cortada'
              : 'A imagem está inteira, com margem onde falta'}
          >
            {ajuste === 'cobrir'
              ? <><Crop className="h-3 w-3" /> cortando</>
              : <><Maximize2 className="h-3 w-3" /> inteira</>}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={TIPOS_ACEITOS}
        className="hidden"
        onChange={e => {
          const arquivo = e.target.files?.[0];
          if (arquivo) void enviar(arquivo);
          e.target.value = '';
        }}
      />

      <div
        ref={zonaRef}
        role="button"
        tabIndex={0}
        aria-label={`${rotulo}: arraste, cole ou clique para enviar`}
        aria-describedby={idAjuda}
        onClick={() => !enviando && inputRef.current?.click()}
        onKeyDown={e => {
          if ((e.key === 'Enter' || e.key === ' ') && !enviando) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={e => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={e => {
          e.preventDefault();
          setArrastando(false);
          if (enviando) return;
          const arquivo = Array.from(e.dataTransfer.files)
            .find(f => f.type.startsWith('image/'));
          if (arquivo) void enviar(arquivo);
        }}
        className={cn(
          'relative w-full cursor-pointer overflow-hidden rounded-lg border-2 transition-colors',
          proporcao,
          arrastando
            ? 'border-dashed border-primary bg-primary/10'
            : vazio
              ? 'border-dashed border-primary/25 bg-primary/[0.03] hover:bg-primary/[0.06]'
              : 'border-solid border-border',
          // `conter` precisa de um fundo por baixo: a margem que sobra ao lado
          // de um cartaz vertical não pode ser um buraco transparente.
          !vazio && ajuste === 'conter' && 'bg-muted/40',
          enviando && 'pointer-events-none',
        )}
      >
        {url ? (
          <img
            src={url}
            alt={rotulo}
            className={cn(
              'h-full w-full',
              ajuste === 'cobrir' ? 'object-cover' : 'object-contain',
            )}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-4 text-center">
            <ImageIcon className="h-6 w-6 text-primary/60" />
            <p className="text-xs font-medium text-foreground/80">
              Arraste, <span className="text-primary">cole (Ctrl+V)</span> ou clique
            </p>
            <p className="text-[11px] text-muted-foreground">
              PNG, JPG, WEBP ou GIF · até 8 MB
            </p>
          </div>
        )}

        {enviando && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <p id={idAjuda} className="text-[11px] text-muted-foreground">{ajuda}</p>

      {url && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={enviando}
            onClick={() => inputRef.current?.click()}
            className="flex-1 gap-1.5 text-xs"
          >
            <Upload className="h-3.5 w-3.5" /> Trocar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={enviando}
            onClick={async () => {
              if (caminho) await removerMidiaDesafio(caminho);
              onChange({ url: null, caminho: null, ajuste });
            }}
            className="gap-1.5 border-destructive/30 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remover
          </Button>
        </div>
      )}
    </div>
  );
}
