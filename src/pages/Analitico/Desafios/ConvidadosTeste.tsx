/**
 * ConvidadosTeste — super admins convidados para entrar na campanha.
 *
 * ## O problema que isto resolve
 *
 * `fn_desafio_pessoas_multi` exclui `perfil = 'super_admin'` do quadro, e a
 * exclusão está certa: super admin não é operação, e deixá-lo entrar por cargo
 * encheria todo ranking de gente que não disputa.
 *
 * O efeito colateral é que quem administra o sistema não consegue ENTRAR numa
 * campanha para ver como ela se comporta — nem para conferir se o recorte que
 * acabou de montar pega quem deveria pegar.
 *
 * A saída é nominal: quem está nesta lista fura a exclusão, um a um. Ninguém
 * entra por cargo, e a lista fica gravada na campanha — então dá para ver
 * depois quem estava ali testando.
 *
 * ## Por que só super admin vê esta caixa
 *
 * Porque ela é ferramenta de conferência de quem administra o sistema. A RPC
 * `fn_desafio_super_admins` devolve `[]` para todo mundo mais, então a caixa
 * chega vazia — e uma caixa vazia numa tela cheia é ruído. O componente some
 * inteiro quando não há ninguém a oferecer.
 *
 * ## O convidado CONTA no placar
 *
 * Ele entra como participante de verdade: com o recebimento dele, na posição
 * que esse recebimento der. Não é um modo de visualização — é uma cadeira a
 * mais na disputa, e é isso que faz o teste valer. Por isso a tela avisa, e
 * por isso a lista costuma ser esvaziada antes de publicar.
 */
import { useEffect, useState } from 'react';
import { FlaskConical, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { buscarSuperAdmins } from '@/services/desafios/desafios.service';
import { AvatarParticipante } from './AvatarParticipante';
import type { PessoaDesafio } from '@/services/desafios/types';

export interface ConvidadosTesteProps {
  /** Ids escolhidos. Vazio = ninguém testando. */
  valor: string[];
  onChange: (valor: string[]) => void;
  /** Quem está configurando — aparece primeiro na lista, como «você». */
  euId: string;
}

export function ConvidadosTeste({ valor, onChange, euId }: ConvidadosTesteProps) {
  const [candidatos, setCandidatos] = useState<PessoaDesafio[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    void buscarSuperAdmins().then(lista => {
      if (cancelado) return;
      // Quem está configurando vem primeiro: convidar a si mesmo é o caso de
      // longe mais comum, e caçar o próprio nome numa lista alfabética é
      // trabalho por nada.
      setCandidatos([...lista].sort((a, b) => {
        if (a.id === euId) return -1;
        if (b.id === euId) return 1;
        return a.nome.localeCompare(b.nome);
      }));
      setCarregando(false);
    });
    return () => { cancelado = true; };
  }, [euId]);

  // Sem candidatos, a caixa não tem o que oferecer — e quem não é super admin
  // recebe `[]` da RPC. Some inteira em vez de ocupar espaço vazia.
  if (carregando || candidatos.length === 0) return null;

  const escolhidos = candidatos.filter(p => valor.includes(p.id));
  const restantes  = candidatos.filter(p => !valor.includes(p.id));

  return (
    <section className="space-y-2 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/[0.04] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-sm font-medium">
          <FlaskConical className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          Convidados de teste
        </Label>
        <span className="text-[11px] text-muted-foreground">
          {valor.length ? `${valor.length} no desafio` : 'ninguém'}
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Super admins ficam de fora de todo desafio. Quem você marcar aqui entra
        no placar como participante de verdade — com o recebimento dele e na
        posição que esse recebimento der. Serve para conferir a campanha antes
        de publicar; lembre de esvaziar a lista depois.
      </p>

      {escolhidos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {escolhidos.map(p => (
            <Badge
              key={p.id}
              variant="outline"
              className="gap-1 border-amber-500/40 bg-background text-xs font-normal"
            >
              {p.nome}{p.id === euId ? ' (você)' : ''}
              <button
                type="button"
                onClick={() => onChange(valor.filter(x => x !== p.id))}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Tirar ${p.nome} do teste`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {restantes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {restantes.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange([...valor, p.id])}
              className={cn(
                'flex items-center gap-1.5 rounded-full border border-border bg-background',
                'px-2 py-1 text-xs text-muted-foreground transition-colors',
                'hover:border-amber-500/40 hover:text-foreground',
              )}
            >
              <AvatarParticipante
                nome={p.nome}
                fotoUrl={p.fotoUrl}
                className="h-4 w-4 text-[8px]"
              />
              {p.nome}{p.id === euId ? ' (você)' : ''}
              <Plus className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
