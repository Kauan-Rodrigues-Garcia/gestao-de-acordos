/**
 * MenuLateralEditor — o menu lateral, do jeito que cada cargo vai vê-lo.
 *
 * ## O que esta tela é
 *
 * Uma RÉPLICA da barra lateral, não uma lista de nomes. O super_admin escolhe
 * um cargo, vê exatamente a barra que aquele cargo abre — mesmas abas, mesmos
 * ícones, mesma pintura — e arrasta os itens até a ordem que quiser. O que ele
 * arrastou é o que aquele cargo vai encontrar no próximo carregamento.
 *
 * A versão anterior mostrava as abas de QUEM ESTAVA EDITANDO, com setas de
 * subir e descer. Como super_admin enxerga tudo, a ordem que ele montava era a
 * do menu dele — e valia para a empresa inteira, inclusive para o operador, que
 * vê seis abas e não catorze. Ordenar às cegas o menu de outra pessoa foi
 * exatamente o problema.
 *
 * ## Onde a prévia é exata, e onde ela é aproximada
 *
 * Exata no que depende de CARGO: permissão do cargo, operação (PaguePlay ou
 * BookPlay) e as listas de cargo do próprio item. É a mesma função `abasDoMenu`
 * que pinta a barra de verdade — não há uma segunda régua aqui.
 *
 * Aproximada nas duas concessões que dependem de PESSOA, e a tela diz isso:
 *
 *   • Ouvidoria — alguém pode receber acesso individual em `ouvidoria_acessos`;
 *   • Tickets — alguém pode ser cadastrado como atendente.
 *
 * Nos dois casos a prévia mostra o que o CARGO concede. Errar para menos aqui
 * não esconde aba de ninguém: a ordem salva só reposiciona o que a pessoa já
 * podia ver, e aba fora da lista mantém a posição que tinha.
 *
 * ## Arrastar, e também as setas
 *
 * Arrastar é o pedido e é o gesto certo para «monte a barra». As setas
 * continuam, discretas, porque arrastar não funciona no teclado nem é confortável
 * no celular — e este diálogo abre nos dois.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, GripVertical, Info, Loader2, RotateCcw, Users2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { PERFIL_LABELS } from '@/lib/index';
import { CARGOS_ACESSO_TOTAL, CARGOS_CONFIGURAVEIS } from '@/lib/permissoes-catalogo';
import { abasDoMenu, ticketsVisivelParaCargo, type NavItem } from '@/lib/menuLateral';
import { ordenarMenu } from '@/lib/menuLateralOrdem';
import {
  CARGO_GERAL, ordemDoCargo, salvarOrdemMenu, type OrdensPorCargo,
} from '@/services/menuLateral.service';
import { useToast } from '@/hooks/use-toast';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  empresaId?: string;
  perfilId?: string;
  /** `cargo` → ordem salva. A chave `''` é a ordem geral da empresa. */
  ordens: OrdensPorCargo;
  isPaguePlay: boolean;
  isBookplay: boolean;
  /** O que um CARGO concede, sem exceção de pessoa. Vem de `useCargoPermissoes`. */
  valorDoCargo: (cargo: string, chave: string) => boolean;
  /** `tickets_config.liberado_para_lideranca` — a chave da empresa. */
  ticketsLiberadoParaLideranca: boolean;
  /** Chamado depois de gravar, para o menu já refletir a mudança. */
  aoSalvar: (cargo: string, ordem: string[]) => void;
}

/**
 * Os cargos que aparecem no seletor, na ordem em que a empresa pensa neles.
 *
 * Administrador e super_admin entram: eles têm menu, e é comum querer a
 * ferramenta de administração no topo justamente para eles. `CARGOS_ACESSO_TOTAL`
 * vem depois porque a pergunta «como o operador vê?» é a que se faz primeiro.
 */
const CARGOS_DO_SELETOR: string[] = [
  ...CARGOS_CONFIGURAVEIS,
  ...CARGOS_ACESSO_TOTAL,
];

const rotuloCargo = (cargo: string) =>
  cargo === CARGO_GERAL
    ? 'Todos os cargos (padrão)'
    : (PERFIL_LABELS[cargo] ?? cargo);

export function MenuLateralEditor({
  aberto, onFechar, empresaId, perfilId, ordens,
  isPaguePlay, isBookplay, valorDoCargo, ticketsLiberadoParaLideranca, aoSalvar,
}: Props) {
  const { toast } = useToast();
  const [cargo, setCargo] = useState<string>(CARGO_GERAL);
  const [rascunho, setRascunho] = useState<NavItem[]>([]);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  /**
   * As abas do cargo selecionado, já na ordem que vale hoje.
   *
   * `CARGO_GERAL` não é um cargo — é a linha que os outros herdam. Para
   * desenhá-la é preciso escolher um ponto de vista, e o de quem enxerga tudo
   * é o único que mostra a lista inteira: com o menu do operador não daria para
   * posicionar Configurações, que ele não vê.
   */
  const abas = useMemo(() => {
    const cargoParaPermissao = cargo === CARGO_GERAL ? 'super_admin' : cargo;
    const visiveis = abasDoMenu({
      cargo: cargoParaPermissao,
      isPaguePlay,
      isBookplay,
      temPermissao: chave => valorDoCargo(cargoParaPermissao, chave),
      // Concessão individual não existe numa prévia por cargo — ver o cabeçalho.
      acessoOuvidoria: false,
      acessoTickets: ticketsVisivelParaCargo(cargoParaPermissao, ticketsLiberadoParaLideranca),
    });
    return ordenarMenu(visiveis, ordemDoCargo(ordens, cargo));
  }, [cargo, isPaguePlay, isBookplay, valorDoCargo, ticketsLiberadoParaLideranca, ordens]);

  // Reabrir, ou trocar de cargo, descarta o rascunho anterior: quem fechou sem
  // salvar não espera reencontrar a edição pela metade, e misturar a ordem de
  // um cargo com a lista de outro salvaria rota que aquele cargo nem tem.
  useEffect(() => {
    if (aberto) { setRascunho(abas); setArrastando(null); }
  }, [aberto, abas]);

  const temOrdemPropria = (c: string) => !!ordens[c]?.length;
  const herdaDaGeral = cargo !== CARGO_GERAL && !temOrdemPropria(cargo);

  function mover(de: number, para: number) {
    if (para < 0 || para >= rascunho.length || de === para) return;
    setRascunho(atual => {
      const copia = [...atual];
      const [item] = copia.splice(de, 1);
      copia.splice(para, 0, item);
      return copia;
    });
  }

  /**
   * Arrastar reordena AO PASSAR POR CIMA, e não ao soltar.
   *
   * A lista se reorganiza embaixo do cursor, então o que se vê durante o gesto
   * já é o resultado. Reordenar só no `drop` obrigaria a soltar para descobrir
   * onde a aba caiu — e a desfazer quando caísse errado.
   */
  function aoEntrarEm(indice: number) {
    if (arrastando === null || arrastando === indice) return;
    mover(arrastando, indice);
    setArrastando(indice);
  }

  async function gravar(ordem: string[], mensagem: string) {
    if (!empresaId) return;
    setSalvando(true);
    const ok = await salvarOrdemMenu(empresaId, ordem, { cargo, atualizadoPor: perfilId });
    setSalvando(false);

    if (!ok) {
      toast({
        title: 'Não deu para salvar',
        description: 'A ordem do menu continua como estava. Tente de novo.',
        variant: 'destructive',
      });
      return;
    }

    aoSalvar(cargo, ordem);
    toast({ title: mensagem });
    onFechar();
  }

  const salvar = () => gravar(
    rascunho.map(a => a.to),
    cargo === CARGO_GERAL
      ? 'Ordem padrão salva — vale para os cargos sem ordem própria.'
      : `Ordem de ${rotuloCargo(cargo)} salva.`,
  );

  /*
   * «Padrão» grava um array VAZIO, e não apaga a linha: a tabela não tem policy
   * de DELETE, de propósito. Vazio é lido como ausência — o cargo volta a seguir
   * a ordem geral, e a geral volta a seguir a ordem do código.
   */
  const restaurarPadrao = () => gravar(
    [],
    cargo === CARGO_GERAL
      ? 'Ordem do sistema restaurada.'
      : `${rotuloCargo(cargo)} volta a seguir a ordem geral.`,
  );

  return (
    <Dialog open={aberto} onOpenChange={v => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Menu lateral por cargo</DialogTitle>
          <DialogDescription>
            Escolha um cargo, arraste as abas e salve. Vale para todo mundo daquele
            cargo, a partir do próximo carregamento.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          {/* ── Coluna da esquerda: quem estamos configurando ── */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Cargo
              </label>
              <Select value={cargo} onValueChange={setCargo}>
                <SelectTrigger className="h-9 text-xs">
                  <Users2 className="w-3.5 h-3.5 mr-1 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value={CARGO_GERAL}>{rotuloCargo(CARGO_GERAL)}</SelectItem>
                  {CARGOS_DO_SELETOR.map(c => (
                    <SelectItem key={c} value={c}>
                      {rotuloCargo(c)}
                      {temOrdemPropria(c) && ' ·'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-[11px] leading-snug text-muted-foreground">
              {cargo === CARGO_GERAL ? (
                <>
                  A ordem <strong className="text-foreground">padrão</strong> da empresa.
                  Vale para todo cargo que não tem ordem própria. A lista abaixo mostra
                  o menu completo, para dar onde posicionar cada aba.
                </>
              ) : herdaDaGeral ? (
                <>
                  <strong className="text-foreground">{rotuloCargo(cargo)}</strong> segue a
                  ordem padrão hoje. Salvar aqui cria uma ordem só dele.
                </>
              ) : (
                <>
                  <strong className="text-foreground">{rotuloCargo(cargo)}</strong> já tem
                  ordem própria. Ela ignora a padrão.
                </>
              )}
            </p>

            <p className="text-[11px] leading-snug text-muted-foreground inline-flex gap-1.5">
              <Info className="w-3 h-3 shrink-0 mt-[2px]" />
              <span>
                Ouvidoria e Tickets também abrem por concessão individual
                (acesso na Ouvidoria, cadastro de atendente). A prévia mostra o
                que o <em>cargo</em> concede.
              </span>
            </p>
          </div>

          {/* ── Coluna da direita: a barra, como ela vai aparecer ── */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Prévia · {rascunho.length} aba{rascunho.length !== 1 ? 's' : ''}
            </p>

            <div className="rounded-xl border border-sidebar-border bg-sidebar p-2 max-h-[55vh] overflow-y-auto">
              {rascunho.length === 0 ? (
                <p className="text-xs text-sidebar-foreground/60 text-center py-10 px-4 leading-snug">
                  Este cargo não enxerga nenhuma aba. Quem decide isso é
                  Configurações › Permissões — a ordem não liga aba nenhuma.
                </p>
              ) : rascunho.map((aba, i) => (
                <div
                  key={aba.to}
                  draggable
                  onDragStart={() => setArrastando(i)}
                  onDragEnter={() => aoEntrarEm(i)}
                  onDragOver={e => e.preventDefault()}
                  onDragEnd={() => setArrastando(null)}
                  onDrop={e => { e.preventDefault(); setArrastando(null); }}
                  className={cn(
                    'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
                    'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                    'cursor-grab active:cursor-grabbing transition-colors',
                    // A aba em movimento fica translúcida: é o único aviso de
                    // que a lista está se reorganizando por causa dela.
                    arrastando === i && 'opacity-40 bg-sidebar-accent',
                  )}
                >
                  <GripVertical className="w-3.5 h-3.5 shrink-0 text-sidebar-foreground/30 group-hover:text-sidebar-foreground/60" />
                  <aba.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 truncate">{aba.label}</span>

                  {/* As setas ficam invisíveis até o foco ou o ponteiro chegar:
                      arrastar é o gesto principal, e elas existem para teclado
                      e celular. */}
                  <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                      type="button" disabled={i === 0} onClick={() => mover(i, i - 1)}
                      aria-label={`Subir ${aba.label}`}
                      className="w-6 h-6 rounded flex items-center justify-center hover:bg-sidebar-accent disabled:opacity-30"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button" disabled={i === rascunho.length - 1} onClick={() => mover(i, i + 1)}
                      aria-label={`Descer ${aba.label}`}
                      className="w-6 h-6 rounded flex items-center justify-center hover:bg-sidebar-accent disabled:opacity-30"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </span>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
              Aba criada depois de um deploy entra no fim da lista deste cargo, e
              não some por não estar na ordem salva.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => void restaurarPadrao()}
                  disabled={salvando} className="gap-2">
            <RotateCcw className="h-3.5 w-3.5" />
            {cargo === CARGO_GERAL ? 'Ordem do sistema' : 'Seguir a padrão'}
          </Button>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando || !rascunho.length}
                  className="gap-2">
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
