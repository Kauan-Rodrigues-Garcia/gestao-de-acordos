/**
 * SeletorEtiquetas — ligar e desligar as marcas operacionais de um número.
 *
 * ## Sem confirmação, e sem botão de salvar
 *
 * Marcar «Não chegou SMS» é reversível, fica no histórico com autor e hora, e é
 * a ação mais repetida de quem está aquecendo chip. Um diálogo de confirmação a
 * cada clique custaria mais do que o erro que evitaria — mesmo raciocínio do
 * seletor de situação em `ListaNumeros`.
 *
 * ## Manda o conjunto inteiro, não o que mudou
 *
 * O clique numa etiqueta calcula a lista final e envia. Com «adicione esta» /
 * «tire aquela», duas pessoas mexendo ao mesmo tempo produziriam um resultado
 * que depende da ordem de chegada; mandando o conjunto, a última escrita ganha e
 * é a que está na tela de quem clicou.
 *
 * ## Uma etiqueta só, e o componente já é uma lista
 *
 * Hoje `ETIQUETAS` tem um item, e este menu mostra um item. Escrever um botão de
 * alternância direto seria mais curto e teria de ser desfeito na segunda
 * etiqueta — que o pedido já prevê. O laço custa duas linhas.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Tag, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import {
  ETIQUETAS, ETIQUETA_LABELS, ETIQUETA_DESCRICOES, etiquetasConhecidas,
  type Etiqueta,
} from '@/services/numeros/numerosRegras';
import { etiquetarNumero, type NumeroRow } from '@/services/numeros/numeros.service';

export interface SeletorEtiquetasProps {
  numero: NumeroRow;
  onMudou: () => void;
}

export function SeletorEtiquetas({ numero, onMudou }: SeletorEtiquetasProps) {
  const [salvando, setSalvando] = useState(false);

  const atuais = etiquetasConhecidas(numero.etiquetas);

  async function alternar(etiqueta: Etiqueta) {
    const marcada = atuais.includes(etiqueta);
    const proximas = marcada
      ? atuais.filter(e => e !== etiqueta)
      : [...atuais, etiqueta];

    setSalvando(true);
    const r = await etiquetarNumero(numero.id, proximas);
    setSalvando(false);

    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível etiquetar.'); return; }
    toast.success(
      marcada
        ? `«${ETIQUETA_LABELS[etiqueta]}» saiu de ${mascararNumero(numero.numero)}.`
        : `${mascararNumero(numero.numero)} marcado como «${ETIQUETA_LABELS[etiqueta]}».`,
    );
    onMudou();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon" variant="ghost" className="h-8 w-8"
          disabled={salvando}
          aria-label={`Etiquetas de ${mascararNumero(numero.numero)}`}
          title="Etiquetas"
        >
          <Tag className={cn('h-3.5 w-3.5', atuais.length > 0 && 'text-primary')} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Etiquetas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ETIQUETAS.map(e => {
          const marcada = atuais.includes(e);
          return (
            <DropdownMenuItem
              key={e}
              onSelect={ev => { ev.preventDefault(); void alternar(e); }}
              className="items-start gap-2"
            >
              <Check className={cn('mt-0.5 h-4 w-4 shrink-0', !marcada && 'invisible')} />
              <span className="min-w-0">
                <span className="block text-sm">{ETIQUETA_LABELS[e]}</span>
                <span className="block text-xs text-muted-foreground">
                  {ETIQUETA_DESCRICOES[e]}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
