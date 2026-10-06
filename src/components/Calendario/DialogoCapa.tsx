/**
 * A capa do mês: o tema (a cor e o emoji da campanha), o título, a frase e o
 * expediente. Tudo opcional — em branco, vale o que o tema sugere.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { TEMAS, TEMA_AUTOMATICO, temaEfetivo } from '@/lib/calendarioSetor';
import { salvarCapa, type CapaDoMes } from '@/services/calendario/calendario.service';

interface Props {
  aberto: boolean;
  mes: string;
  capa: CapaDoMes | null;
  empresaId: string;
  setorId: string;
  tema: CSSProperties;
  onMudou: () => void;
  onFechar: () => void;
}

const VAZIA: CapaDoMes = {
  tema: TEMA_AUTOMATICO, titulo: null, frase: null, expediente_semana: null, expediente_sabado: null,
};

export function DialogoCapa({ aberto, mes, capa, empresaId, setorId, tema, onMudou, onFechar }: Props) {
  const [valor, setValor] = useState<CapaDoMes>(VAZIA);
  const [salvando, setSalvando] = useState(false);
  const numeroDoMes = Number(mes.slice(5, 7));

  useEffect(() => { if (aberto) setValor(capa ?? VAZIA); }, [aberto, capa]);

  const sugerido = temaEfetivo(valor.tema, numeroDoMes);
  const texto = (campo: keyof CapaDoMes) => (valor[campo] ?? '') as string;
  const muda = (campo: keyof CapaDoMes, v: string) => setValor(atual => ({ ...atual, [campo]: v }));

  async function salvar() {
    setSalvando(true);
    try {
      await salvarCapa(empresaId, setorId, mes, {
        tema: valor.tema,
        titulo: valor.titulo?.trim() || null,
        frase: valor.frase?.trim() || null,
        expediente_semana: valor.expediente_semana?.trim() || null,
        expediente_sabado: valor.expediente_sabado?.trim() || null,
      });
      toast.success('Mês personalizado.');
      onMudou();
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  const opcoes = [{ id: TEMA_AUTOMATICO, nome: 'Automático', acento: temaEfetivo(TEMA_AUTOMATICO, numeroDoMes).acento, emoji: '✨' }, ...TEMAS];

  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a) onFechar(); }}>
      <DialogContent className="cal-raiz max-h-[92vh] overflow-y-auto sm:max-w-2xl" style={tema}>
        <DialogHeader>
          <DialogTitle>Personalizar o mês</DialogTitle>
          <DialogDescription>
            O tema muda as cores do calendário. «Automático» usa a campanha do mês — Outubro Rosa em outubro, Novembro Azul em novembro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Tema</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {opcoes.map(t => (
              <button
                key={t.id}
                type="button"
                data-ligado={valor.tema === t.id}
                onClick={() => setValor(atual => ({ ...atual, tema: t.id }))}
                className="cal-opcao flex items-center gap-2 rounded-xl border border-border bg-card p-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <span
                  className="cal-amostra grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base"
                  style={{ '--amostra': t.acento ?? 'var(--primary)' } as CSSProperties}
                  aria-hidden
                >
                  {t.emoji}
                </span>
                <span className="min-w-0 truncate">{t.nome}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="capa-titulo">Título</Label>
            <Input id="capa-titulo" maxLength={60} value={texto('titulo')} onChange={e => muda('titulo', e.target.value)}
              placeholder={sugerido.titulo || 'Calendário do setor'} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="capa-frase">Frase do mês</Label>
            <Input id="capa-frase" maxLength={140} value={texto('frase')} onChange={e => muda('frase', e.target.value)}
              placeholder={sugerido.frase || 'Uma mensagem para o time'} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="capa-semana">Expediente de segunda a sexta</Label>
            <Input id="capa-semana" maxLength={40} value={texto('expediente_semana')} onChange={e => muda('expediente_semana', e.target.value)}
              placeholder="08:00 às 17:00" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="capa-sabado">Expediente de sábado</Label>
            <Input id="capa-sabado" maxLength={40} value={texto('expediente_sabado')} onChange={e => muda('expediente_sabado', e.target.value)}
              placeholder="08:30 às 12:00" />
          </div>
        </div>

        {(sugerido.titulo || sugerido.frase) && !valor.titulo && !valor.frase && (
          <button
            type="button"
            onClick={() => setValor(atual => ({ ...atual, titulo: sugerido.titulo || null, frase: sugerido.frase || null }))}
            className={cn('inline-flex items-center gap-1.5 self-start text-xs font-medium text-primary hover:underline')}
          >
            <Wand2 className="h-3.5 w-3.5" /> Usar o texto do tema «{sugerido.nome}»
          </button>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando} className="gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
