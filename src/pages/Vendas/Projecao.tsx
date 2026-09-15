/**
 * Projeção — o relatório vira venda.
 *
 * ## A prévia não é cortesia
 *
 * Projetar escreve no placar do operador, e pode **reverter venda que estava
 * contando**: confirmada que voltou devolvida sai do recebimento. Descobrir
 * isso depois de acontecer é o tipo de coisa que faz a liderança deixar de
 * confiar na tela.
 *
 * Por isso a ordem é fixa: ler a prévia, ver o que vai mudar — inclusive
 * quanto dinheiro sai — e só então o botão de escrever aparece.
 *
 * ## O que não tem dono não é erro
 *
 * Linha de franquia sem setor e login sem pessoa ficam de fora, e a tela diz
 * quantas e quais logins. É cadastro que ninguém fez, não defeito — mesma
 * postura do de-para do 59, onde carteira sem vínculo continua visível pelo
 * código.
 *
 * ## A divergência de setor fica à vista
 *
 * O setor vem da franquia, como decidido. Medido em setembro: 356 dos 359
 * logins vendem para uma franquia só, mas os 3 que espalham carregam 7% do
 * faturamento — e R$ 534.107,80 cairia num setor diferente do cadastro da
 * pessoa. A tela mostra o número em vez de a conta escolher calada.
 */
import { useState } from 'react';
import {
  Target, TriangleAlert, Info, Undo2, UserX, Building2, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/money';
import { formatDate } from '@/lib/index';
import { cn } from '@/lib/utils';
import {
  previaDaProjecao, projetar, buscarSumidas,
  type Lote, type PreviaProjecao, type VendaSumida,
} from '@/services/vendas/importacaoVendas.service';

interface Props {
  /** Só o lote geral vigente é projetado — o do setor é prévia. */
  lote: Lote | null;
  podeProjetar: boolean;
  onProjetou: () => void;
}

function Linha({ rotulo, valor, tom, Icone }: {
  rotulo: string; valor: string; tom?: 'alerta' | 'bom'; Icone?: typeof Target;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5 last:border-b-0">
      <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        {Icone && <Icone className="h-3.5 w-3.5" aria-hidden />}
        {rotulo}
      </span>
      <span className={cn('text-[13px] font-semibold tabular-nums',
        tom === 'alerta' ? 'text-amber-600 dark:text-amber-400'
        : tom === 'bom'  ? 'text-success' : 'text-foreground')}>
        {valor}
      </span>
    </div>
  );
}

export function Projecao({ lote, podeProjetar, onProjetou }: Props) {
  const [previa, setPrevia] = useState<PreviaProjecao | null>(null);
  const [sumidas, setSumidas] = useState<VendaSumida[]>([]);
  const [ocupado, setOcupado] = useState(false);

  if (!lote) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold">
          <Target className="h-4 w-4 text-muted-foreground" aria-hidden />
          4. Lançar sobre as vendas
        </h2>
        <p className="py-6 text-center text-[12px] text-muted-foreground">
          Nenhum relatório geral vigente. Importe um para poder lançá-lo.
        </p>
      </section>
    );
  }

  async function carregarPrevia() {
    if (!lote) return;
    setOcupado(true);
    const [p, s] = await Promise.all([previaDaProjecao(lote.id), buscarSumidas(lote.id)]);
    setOcupado(false);
    if (!p.ok) { toast.error(p.erro ?? 'Não foi possível ler a prévia.'); return; }
    setPrevia(p.dado);
    setSumidas(s.dado ?? []);
  }

  async function executar() {
    if (!lote) return;
    setOcupado(true);
    const r = await projetar(lote.id);
    setOcupado(false);
    if (!r.ok) { toast.error(r.erro ?? 'A projeção falhou.'); return; }

    const d = r.dado!;
    toast.success(
      d.revertidas > 0
        ? `${d.criadas} criadas, ${d.atualizadas} atualizadas. ${d.revertidas} saíram do recebimento (${formatBRL(d.revertido_valor)}).`
        : `${d.criadas} criadas, ${d.atualizadas} atualizadas.`,
    );
    setPrevia(null);
    setSumidas([]);
    onProjetou();
  }

  const semDono = previa
    ? previa.sem_franquia + previa.franquia_ignorada + previa.sem_operador
    : 0;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold">
          <Target className="h-4 w-4 text-muted-foreground" aria-hidden />
          4. Lançar sobre as vendas
        </h2>
        <p className="text-[11px] text-muted-foreground">
          {lote.mes?.slice(0, 7)} · geral · {lote.linhas_aceitas} linhas
        </p>
      </div>

      {!previa ? (
        <div className="space-y-2">
          <p className="text-[12px] text-muted-foreground">
            Lançar escreve no placar do operador e pode <strong className="text-foreground">
            reverter venda que estava contando</strong>. Leia a prévia antes.
          </p>
          <Button size="sm" variant="outline" disabled={ocupado}
            onClick={() => void carregarPrevia()}>
            {ocupado ? 'Lendo…' : 'Ver o que vai mudar'}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-x-6 gap-y-0 sm:grid-cols-2">
            <div>
              <Linha rotulo="Linhas no relatório" valor={String(previa.total_no_lote)} />
              <Linha rotulo="Com franquia e vendedor" valor={String(previa.com_dono)} tom="bom" />
              <Linha rotulo="Vendas novas" valor={String(previa.a_criar)} />
              <Linha rotulo="Vendas atualizadas" valor={String(previa.a_atualizar)} />
            </div>
            <div>
              <Linha rotulo="Saem do recebimento" Icone={Undo2}
                valor={`${previa.a_reverter} · ${formatBRL(previa.reverter_valor)}`}
                tom={previa.a_reverter > 0 ? 'alerta' : undefined} />
              <Linha rotulo="Franquia sem setor" Icone={Building2}
                valor={String(previa.sem_franquia)}
                tom={previa.sem_franquia > 0 ? 'alerta' : undefined} />
              <Linha rotulo="Franquia ignorada" valor={String(previa.franquia_ignorada)} />
              <Linha rotulo="Login sem pessoa" Icone={UserX}
                valor={String(previa.sem_operador)}
                tom={previa.sem_operador > 0 ? 'alerta' : undefined} />
            </div>
          </div>

          {previa.a_reverter > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px]">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <div>
                <strong>{previa.a_reverter} venda{previa.a_reverter > 1 ? 's' : ''}</strong> que
                {previa.a_reverter > 1 ? ' contavam' : ' contava'} para a meta
                {previa.a_reverter > 1 ? ' voltaram' : ' voltou'} como devolvida ou cancelada.
                Saem do recebimento — <strong>{formatBRL(previa.reverter_valor)}</strong> — e o
                registro fica para acompanhamento.
              </div>
            </div>
          )}

          {semDono > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="min-w-0">
                <strong className="text-foreground">{semDono} linha{semDono > 1 ? 's' : ''}</strong> fica
                {semDono > 1 ? 'm' : ''} de fora — não é erro, é cadastro que falta.
                {previa.logins_sem_vinculo.length > 0 && (
                  <p className="mt-1">
                    Logins sem pessoa no sistema:{' '}
                    <span className="font-mono text-[11px]">
                      {previa.logins_sem_vinculo.slice(0, 8).join(', ')}
                      {previa.logins_sem_vinculo.length > 8
                        && ` … e mais ${previa.logins_sem_vinculo.length - 8}`}
                    </span>
                  </p>
                )}
              </div>
            </div>
          )}

          {previa.divergencia_setor > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                Em <strong className="text-foreground">{previa.divergencia_setor} linha
                {previa.divergencia_setor > 1 ? 's' : ''}</strong> ({formatBRL(previa.divergencia_valor)})
                o setor da franquia é diferente do setor cadastrado da pessoa. O setor da
                <strong className="text-foreground"> franquia</strong> é o que vale — este aviso
                existe para a diferença não passar despercebida.
              </div>
            </div>
          )}

          {previa.preservadas > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <strong className="text-foreground">{previa.preservadas}</strong> venda
                {previa.preservadas > 1 ? 's' : ''} não {previa.preservadas > 1 ? 'serão' : 'será'} tocada
                {previa.preservadas > 1 ? 's' : ''}: um relatório mais recente já escreveu sobre
                {previa.preservadas > 1 ? ' elas' : ' ela'}. Retrato velho não desfaz retrato novo.
              </div>
            </div>
          )}

          {sumidas.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-border bg-muted/20 px-3 py-2">
              <p className="text-[12px]">
                <strong>{sumidas.length} venda{sumidas.length > 1 ? 's' : ''}</strong> deste mês
                {sumidas.length > 1 ? ' vieram' : ' veio'} de um relatório anterior e não está
                {sumidas.length > 1 ? 'ão' : ''} mais nele. Provavelmente mudaram de mês — importe o
                outro mês para vê-las no lugar certo. Nada será apagado agora.
              </p>
              <div className="max-h-32 overflow-y-auto">
                {sumidas.slice(0, 20).map(s => (
                  <div key={s.venda_id}
                    className="flex items-center gap-2 py-0.5 text-[11px] text-muted-foreground">
                    <span className="font-mono tabular-nums">{s.nr_documento}</span>
                    <span className="min-w-0 flex-1 truncate">{s.operador_nome ?? '—'}</span>
                    <span>{formatDate(s.data_confirmacao)}</span>
                    <span className="tabular-nums">{formatBRL(s.valor_na_meta)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {podeProjetar ? (
              <Button size="sm" disabled={ocupado || previa.com_dono === 0}
                onClick={() => void executar()}>
                <ArrowRight className="mr-1.5 h-4 w-4" />
                {ocupado ? 'Lançando…' : `Lançar ${previa.com_dono} linhas nas vendas`}
              </Button>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                Seu cargo não pode lançar o relatório sobre as vendas.
              </p>
            )}
            <Button size="sm" variant="ghost" disabled={ocupado}
              onClick={() => { setPrevia(null); setSumidas([]); }}>
              Fechar prévia
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
