/**
 * MidiaDestaque — a foto ou o GIF da campanha.
 *
 * ## Onde essa imagem aparece
 *
 * Em três lugares, e é por isso que ela vale a pena: no card do catálogo, no
 * cabeçalho da gaveta de acompanhamento e — o motivo de ela existir — no campo
 * do menu lateral, acima do Desempenho do Dia. É o que faz a campanha ser
 * lembrada por quem não abriu o Analítico hoje.
 *
 * ## O arquivo sobe na hora, e não no salvar
 *
 * Quem escolhe uma imagem quer vê-la. Segurar o arquivo até o botão de gravar
 * deixaria a pessoa configurando às cegas, e um erro de upload só apareceria
 * depois de todo o formulário preenchido.
 *
 * O preço é o arquivo órfão: subiu e a pessoa fechou sem salvar. Trocar a
 * imagem apaga a anterior aqui mesmo, então o resíduo é no máximo um arquivo
 * por desistência — barato perto de configurar sem ver.
 */
import { useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { enviarMidiaDesafio, removerMidiaDesafio } from '@/services/desafios/desafios.service';

export interface MidiaDestaqueProps {
  empresaId: string;
  url: string | null;
  caminho: string | null;
  midiaNoCard: boolean;
  fixarNoMenu: boolean;
  onChange: (m: {
    url: string | null;
    caminho: string | null;
    midiaNoCard: boolean;
    fixarNoMenu: boolean;
  }) => void;
}

export function MidiaDestaque({
  empresaId, url, caminho, midiaNoCard, fixarNoMenu, onChange,
}: MidiaDestaqueProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function escolher(arquivo: File) {
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

    onChange({ url: dados.url, caminho: dados.caminho, midiaNoCard, fixarNoMenu });
    toast.success('Imagem de destaque atualizada.');
  }

  async function limpar() {
    if (caminho) await removerMidiaDesafio(caminho);
    onChange({ url: null, caminho: null, midiaNoCard, fixarNoMenu });
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Imagem de destaque</Label>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={e => {
          const arquivo = e.target.files?.[0];
          if (arquivo) void escolher(arquivo);
          e.target.value = '';
        }}
      />

      <div className={cn(
        'relative overflow-hidden rounded-lg border border-border',
        !url && 'border-dashed',
      )}>
        {url ? (
          <img src={url} alt="Destaque da campanha" className="h-40 w-full object-cover" />
        ) : (
          <div className="flex h-40 flex-col items-center justify-center gap-2 bg-muted/30">
            <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">PNG, JPG, WEBP ou GIF · até 8 MB</p>
          </div>
        )}

        {enviando && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={enviando}
          onClick={() => inputRef.current?.click()}
          className="flex-1 gap-1.5 text-xs"
        >
          <Upload className="h-3.5 w-3.5" />
          {url ? 'Trocar imagem' : 'Enviar imagem'}
        </Button>
        {url && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={enviando}
            onClick={() => void limpar()}
            className="gap-1.5 border-destructive/30 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remover
          </Button>
        )}
      </div>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-xs text-foreground">
            Usar como fundo do card no catálogo
          </span>
          <Switch
            checked={midiaNoCard}
            onCheckedChange={v => onChange({ url, caminho, midiaNoCard: v, fixarNoMenu })}
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-xs text-foreground">
            Fixar no menu lateral
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              Aparece acima do Desempenho do Dia enquanto a campanha estiver no ar.
            </span>
          </span>
          <Switch
            checked={fixarNoMenu}
            onCheckedChange={v => onChange({ url, caminho, midiaNoCard, fixarNoMenu: v })}
          />
        </label>
      </div>
    </div>
  );
}
