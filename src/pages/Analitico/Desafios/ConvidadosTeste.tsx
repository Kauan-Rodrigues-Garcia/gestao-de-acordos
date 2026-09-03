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
 * ## Um convidado FECHA a campanha
 *
 * Com a lista preenchida, disputam os convidados e mais ninguém: a operação
 * inteira fica de fora, e o recorte de setores, equipes e cargos deixa de
 * valer — sem ser apagado. É o que faz o teste ser um teste; conferir a
 * campanha com duzentas e trinta e seis pessoas junto não confere nada.
 *
 * Publicar de verdade é esvaziar a lista, e aí o recorte volta exatamente como
 * estava. Por isso o aviso em cima é grande: a caixa muda quem disputa.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, FlaskConical, Plus, X } from 'lucide-react';
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

      {valor.length > 0 ? (
        <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-[11px] text-foreground">
            <strong>A campanha está em modo teste.</strong> Só{' '}
            {valor.length === 1 ? 'esta pessoa disputa' : `estas ${valor.length} pessoas disputam`};
            a operação inteira fica de fora, e o recorte de setores, equipes e
            cargos não vale enquanto isso. Esvazie a lista para publicar de
            verdade — o recorte volta como está.
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Super admins ficam de fora de todo desafio. Marcar alguém aqui põe a
          campanha em <strong>modo teste</strong>: só os marcados disputam, e a
          operação fica de fora até a lista esvaziar.
        </p>
      )}

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
