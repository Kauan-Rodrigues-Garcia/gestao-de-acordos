/**
 * DialogAfastamento — o «Afastar…» da aba Usuários.
 *
 * Substitui a caixa de férias: férias, atestado, licença-maternidade e o resto
 * moram no mesmo lugar (pedido do Cleber, 27/10/2026). Quem lança escolhe o
 * motivo, o início, a volta (data ou tempo indeterminado) e se a pessoa sai
 * dos rankings e quartis (e dos desafios e do Modo TV) enquanto durar. Sair
 * deles não tira o dinheiro: o recebimento continua na equipe e no setor.
 *
 * As regras estão em `afastamento.ts`; quem grava é `fn_usuarios_afastar`.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { getTodayISO } from '@/lib/index';
import { cn } from '@/lib/utils';
import { afastar } from '@/services/afastamentos.service';
import {
  MOTIVOS_DE_AFASTAMENTO, motivoDoTipo, validarAfastamento, foraDasContasEfetivo,
  rotuloDoAfastamento, type RascunhoAfastamento,
} from './afastamento';

export interface PessoaParaAfastar {
  id: string;
  nome: string;
  /** A empresa da PESSOA — a lista da cobrança junta mais de uma. */
  empresaId: string;
}

interface Props {
  /** Quem será afastado. `null` fecha. */
  pessoa: PessoaParaAfastar | null;
  /** Motivo já escolhido ao abrir (ex.: «férias» quando veio do seletor antigo). */
  tipoInicial?: string;
  onFechar: () => void;
  onSalvo: () => void;
}

function vazio(tipo: string, hoje: string): RascunhoAfastamento {
  return {
    tipo, inicio: hoje, fim: '', semVolta: false,
    foraDasContas: motivoDoTipo(tipo)?.foraPadrao ?? false, observacao: '',
  };
}

export function DialogAfastamento({ pessoa, tipoInicial = 'atestado', onFechar, onSalvo }: Props) {
  const empresaId = pessoa?.empresaId ?? null;
  const hoje = getTodayISO();
  const [r, setR] = useState<RascunhoAfastamento>(() => vazio(tipoInicial, hoje));
  const [salvando, setSalvando] = useState(false);

  // Cada abertura começa limpa, no motivo pedido.
  useEffect(() => {
    if (pessoa) setR(vazio(tipoInicial, getTodayISO()));
  }, [pessoa, tipoInicial]);

  const motivo = motivoDoTipo(r.tipo);
  const erro = validarAfastamento(r, hoje);
  const fora = foraDasContasEfetivo(r);

  function escolherMotivo(tipo: string) {
    const m = motivoDoTipo(tipo);
    setR(x => ({
      ...x, tipo,
      foraDasContas: m?.foraPadrao ?? false,
      // Férias não aceitam volta indeterminada: desmarca em vez de travar o botão.
      semVolta: m?.exigeVolta ? false : x.semVolta,
    }));
  }

  async function confirmar() {
    if (!pessoa || !empresaId || erro) return;
    setSalvando(true);
    try {
      const res = await afastar({
        empresaId, operadorId: pessoa.id, tipo: r.tipo, inicio: r.inicio,
        fim: r.semVolta ? null : r.fim, foraDasContas: fora, observacao: r.observacao.trim(),
      });
      if (!res.ok) { toast.error(res.erro ?? 'Não foi possível lançar o afastamento.'); return; }
      toast.success(`${pessoa.nome}: ${rotuloDoAfastamento(
        { tipo: r.tipo, inicio: r.inicio, fim: r.semVolta ? null : r.fim, observacao: r.observacao }, hoje,
      )}.`);
      onSalvo();
      onFechar();
    } finally { setSalvando(false); }
  }

  return (
    <Dialog open={!!pessoa} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-lg" aria-describedby="dlg-afast-desc">
        <DialogHeader>
          <DialogTitle>Afastar {pessoa?.nome}</DialogTitle>
          <DialogDescription id="dlg-afast-desc">
            Por que a pessoa não está trabalhando, e até quando.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Motivo</Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Motivo do afastamento">
              {MOTIVOS_DE_AFASTAMENTO.map(m => (
                <button
                  key={m.tipo} type="button" role="radio" aria-checked={r.tipo === m.tipo}
                  onClick={() => escolherMotivo(m.tipo)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    r.tipo === m.tipo
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:border-primary/50 hover:bg-accent',
                  )}
                >
                  {m.rotulo}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="afast-obs" className="text-xs">
              {r.tipo === 'outros' ? 'Qual é o motivo?' : 'Observação (opcional)'}
            </Label>
            <Textarea
              id="afast-obs" rows={2} maxLength={500} value={r.observacao}
              placeholder={r.tipo === 'outros' ? 'Ex.: curso externo, cirurgia, mudança de cidade…' : ''}
              onChange={e => setR(x => ({ ...x, observacao: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="afast-ini" className="text-xs">Primeiro dia</Label>
              <Input
                id="afast-ini" type="date" className="h-9" value={r.inicio}
                onChange={e => setR(x => ({ ...x, inicio: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="afast-fim" className="text-xs">Último dia</Label>
              <Input
                id="afast-fim" type="date" className="h-9" value={r.semVolta ? '' : r.fim}
                min={r.inicio > hoje ? r.inicio : hoje} disabled={r.semVolta}
                onChange={e => setR(x => ({ ...x, fim: e.target.value }))}
              />
              <label className={cn(
                'flex items-center gap-2 text-xs',
                motivo?.exigeVolta ? 'cursor-not-allowed text-muted-foreground/60' : 'cursor-pointer text-muted-foreground',
              )}>
                <input
                  type="checkbox" className="h-3.5 w-3.5 accent-primary"
                  checked={r.semVolta} disabled={!!motivo?.exigeVolta}
                  onChange={e => setR(x => ({ ...x, semVolta: e.target.checked }))}
                />
                Tempo indeterminado
              </label>
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="afast-fora" className="text-xs font-semibold">Tirar dos rankings e quartis</Label>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {fora
                  ? <>Enquanto durar, a pessoa não aparece nos rankings, nos quartis, nos desafios e no Modo TV.
                      {' '}<strong>O recebimento dela continua contando</strong> para a equipe em que está cadastrada e para o setor.</>
                  : <>A pessoa continua aparecendo nos rankings e nos quartis, como qualquer ativo.</>}
                {motivo?.foraTravado && ' Em férias é sempre assim.'}
              </p>
            </div>
            <Switch
              id="afast-fora" checked={fora} disabled={!!motivo?.foraTravado}
              onCheckedChange={v => setR(x => ({ ...x, foraDasContas: v }))}
            />
          </div>

          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {r.semVolta
              ? <>Sem data de volta: a pessoa só volta para <strong>ativo</strong> quando alguém encerrar o afastamento (na ficha dela, ou escolhendo «Ativo» na lista).</>
              : <>No dia seguinte ao último dia, a pessoa volta para <strong>ativo</strong> sozinha. Ninguém precisa lembrar de desligar.</>}
          </p>
        </div>

        <DialogFooter className="items-center gap-2">
          {erro && (r.fim || r.semVolta || r.tipo === 'outros') && (
            <span className="mr-auto text-xs text-destructive">{erro}</span>
          )}
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={() => void confirmar()} disabled={!!erro || salvando || !empresaId}>
            {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
