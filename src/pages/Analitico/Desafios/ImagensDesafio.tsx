/**
 * ImagensDesafio — as duas imagens da campanha, e o que cada uma faz.
 *
 * ## Por que duas, e não uma
 *
 * Porque são formatos com trabalhos diferentes, e uma imagem só fazendo os
 * dois acabava esticada num deles:
 *
 *   DESTAQUE  — o selo. Aparece a 40 px no menu lateral recolhido e como fundo
 *               do card no catálogo. Tem que se ler pequeno; um GIF curto cai
 *               bem aqui.
 *   ARTE      — o cartaz da campanha, com a arte que o designer fez. Aparece
 *               inteira na tela do desafio e no topo da gaveta. Opcional.
 *
 * Espremer o cartaz no botão do menu é o que dava o zoom no meio da arte.
 *
 * ## As duas caixas são iguais por dentro
 *
 * Mesmo componente (`DropzoneImagem`), mesma forma de enviar — arrastar, colar
 * ou clicar — e o mesmo botão de cortar/inteira. O que muda é a proporção da
 * prévia e o padrão do recorte: o selo nasce cortando, o cartaz nasce inteiro.
 */
import { Switch } from '@/components/ui/switch';
import { DropzoneImagem } from './DropzoneImagem';
import type { AjusteImagem } from '@/services/desafios/types';

export interface ImagensDesafioProps {
  empresaId: string;

  midiaUrl: string | null;
  midiaCaminho: string | null;
  ajusteMidia: AjusteImagem;

  arteUrl: string | null;
  arteCaminho: string | null;
  ajusteArte: AjusteImagem;

  midiaNoCard: boolean;
  fixarNoMenu: boolean;

  onChange: (m: Partial<{
    midiaUrl: string | null;
    midiaCaminho: string | null;
    ajusteMidia: AjusteImagem;
    arteUrl: string | null;
    arteCaminho: string | null;
    ajusteArte: AjusteImagem;
    midiaNoCard: boolean;
    fixarNoMenu: boolean;
  }>) => void;
}

export function ImagensDesafio({
  empresaId,
  midiaUrl, midiaCaminho, ajusteMidia,
  arteUrl, arteCaminho, ajusteArte,
  midiaNoCard, fixarNoMenu,
  onChange,
}: ImagensDesafioProps) {
  return (
    <div className="space-y-5">
      <DropzoneImagem
        empresaId={empresaId}
        rotulo="Imagem de destaque"
        ajuda="O selo da campanha: aparece no menu lateral e como fundo do card no catálogo. Um GIF curto cai bem."
        url={midiaUrl}
        caminho={midiaCaminho}
        ajuste={ajusteMidia}
        proporcao="aspect-[16/9]"
        onChange={m => onChange({
          midiaUrl: m.url, midiaCaminho: m.caminho, ajusteMidia: m.ajuste,
        })}
      />

      <div className="space-y-2 rounded-lg border border-border p-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-xs text-foreground">
            Usar o destaque como fundo do card no catálogo
          </span>
          <Switch
            checked={midiaNoCard}
            onCheckedChange={v => onChange({ midiaNoCard: v })}
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
            onCheckedChange={v => onChange({ fixarNoMenu: v })}
          />
        </label>
      </div>

      <DropzoneImagem
        empresaId={empresaId}
        rotulo="Arte de divulgação"
        ajuda="Opcional. O cartaz da campanha, mostrado inteiro na tela do desafio e no topo da gaveta de acompanhamento."
        url={arteUrl}
        caminho={arteCaminho}
        ajuste={ajusteArte}
        // 4:3 dá espaço a um cartaz sem forçar o horizontal: com `conter`, a
        // arte vertical aparece inteira e sobra margem dos lados.
        proporcao="aspect-[4/3]"
        onChange={m => onChange({
          arteUrl: m.url, arteCaminho: m.caminho, ajusteArte: m.ajuste,
        })}
      />
    </div>
  );
}
