/**
 * A capa do mês: o tema (a cor e o desenho da campanha), o título, a frase e o
 * expediente. Tudo opcional — em branco, vale o que o tema sugere.
 *
 * Os temas vêm em dois grupos: as campanhas do mês, que entram sozinhas no
 * «Automático», e as datas comemorativas (Páscoa, Dia das Mães, Halloween…),
 * que só valem escolhendo. A «Cor livre» guarda a cor no próprio id do tema
 * (`cor_0d9488`), sem migration. Em cima, a capa em gibi mostra a escolha.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Loader2, Palette, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  TEMAS, TEMA_AUTOMATICO, corDoIdLivre, idDaCorLivre, rotuloDoMesLongo, temaEfetivo,
  type TemaCalendario,
} from '@/lib/calendarioSetor';
import { paletaGibi, varsDaPaleta } from '@/lib/calendarioGibi';
import { salvarCapa, type CapaDoMes } from '@/services/calendario/calendario.service';
import { Motivo } from './gibi/desenhos';
import { carregarFontesGibi } from './gibi/fontes';
import './gibi/gibi.css';

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

const CAMPANHAS = TEMAS.filter(t => t.id === 'padrao' || t.mes);
const DATAS = TEMAS.filter(t => t.id !== 'padrao' && !t.mes);
const COR_LIVRE_INICIAL = '#0D9488';

export function DialogoCapa({ aberto, mes, capa, empresaId, setorId, tema, onMudou, onFechar }: Props) {
  const [valor, setValor] = useState<CapaDoMes>(VAZIA);
  const [salvando, setSalvando] = useState(false);
  const numeroDoMes = Number(mes.slice(5, 7));
  const corLivre = corDoIdLivre(valor.tema);
  const [ultimaCorLivre, setUltimaCorLivre] = useState(COR_LIVRE_INICIAL);

  useEffect(() => {
    if (!aberto) return;
    carregarFontesGibi();
    setValor(capa ?? VAZIA);
    const livre = corDoIdLivre(capa?.tema);
    if (livre) setUltimaCorLivre(livre);
  }, [aberto, capa]);

  const sugerido = temaEfetivo(valor.tema, numeroDoMes);
  const texto = (campo: keyof CapaDoMes) => (valor[campo] ?? '') as string;
  const muda = (campo: keyof CapaDoMes, v: string) => setValor(atual => ({ ...atual, [campo]: v }));
  const escolher = (id: string) => setValor(atual => ({ ...atual, tema: id }));

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

  const automatico = temaEfetivo(TEMA_AUTOMATICO, numeroDoMes);

  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a) onFechar(); }}>
      <DialogContent className="cal-raiz max-h-[92vh] overflow-y-auto sm:max-w-3xl" style={tema}>
        <DialogHeader>
          <DialogTitle>Personalizar o mês</DialogTitle>
          <DialogDescription>
            O tema muda as cores e o desenho do calendário. «Automático» usa a campanha do mês — Outubro Rosa em outubro,
            Novembro Azul em novembro. As datas comemorativas valem quando você escolhe.
          </DialogDescription>
        </DialogHeader>

        <PreviaDaCapa
          tema={sugerido}
          mes={mes}
          titulo={valor.titulo?.trim() || sugerido.titulo || 'Calendário do setor'}
          frase={valor.frase?.trim() || sugerido.frase}
        />

        <div className="space-y-2">
          <Label>Campanhas do mês</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <OpcaoTema
              tema={{ ...automatico, nome: `Automático · ${automatico.nome}` }}
              ligado={valor.tema === TEMA_AUTOMATICO}
              onClick={() => escolher(TEMA_AUTOMATICO)}
            />
            {CAMPANHAS.map(t => (
              <OpcaoTema key={t.id} tema={t} ligado={valor.tema === t.id} onClick={() => escolher(t.id)} />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Datas comemorativas</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DATAS.map(t => (
              <OpcaoTema key={t.id} tema={t} ligado={valor.tema === t.id} onClick={() => escolher(t.id)} />
            ))}
            <div
              data-ligado={!!corLivre}
              className="cal-opcao flex items-center gap-2 rounded-xl border border-border bg-card p-2 text-xs font-medium text-foreground"
            >
              <label className="relative grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-border"
                style={{ background: corLivre ?? ultimaCorLivre }} title="Escolher a cor">
                <Palette className="h-4 w-4 text-white mix-blend-difference" aria-hidden />
                <input
                  type="color"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={(corLivre ?? ultimaCorLivre).toLowerCase()}
                  onChange={e => { setUltimaCorLivre(e.target.value); escolher(idDaCorLivre(e.target.value)); }}
                  aria-label="Cor livre"
                />
              </label>
              <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => escolher(idDaCorLivre(ultimaCorLivre))}>
                Cor livre
              </button>
            </div>
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

function OpcaoTema({ tema, ligado, onClick }: { tema: TemaCalendario; ligado: boolean; onClick: () => void }) {
  const paleta = useMemo(() => paletaGibi(tema, false), [tema]);
  return (
    <button
      type="button"
      data-ligado={ligado}
      onClick={onClick}
      className="cal-opcao flex items-center gap-2 rounded-xl border border-border bg-card p-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border-2 p-1"
        style={{ background: paleta.soft, borderColor: paleta.ol }} aria-hidden>
        <Motivo id={tema.motivo} cores={paleta} className="h-full w-full" />
      </span>
      <span className="min-w-0 truncate">{tema.nome}</span>
    </button>
  );
}

/** A capa do gibi com o tema escolhido, do jeito que vai aparecer no mês. */
function PreviaDaCapa({ tema, mes, titulo, frase }: { tema: TemaCalendario; mes: string; titulo: string; frase: string }) {
  const paleta = useMemo(() => paletaGibi(tema, false), [tema]);
  return (
    <div className="gb" style={varsDaPaleta(paleta) as CSSProperties} aria-label="Prévia da capa">
      <div className="gb-in" style={{ padding: 14 }}>
        <div className="gb-capa">
          <div className="gb-motivo" aria-hidden><Motivo id={tema.motivo} cores={paleta} /></div>
          <div className="gb-capa-txt">
            <p className="gb-mes">{rotuloDoMesLongo(mes).replace(' de ', ' ')}</p>
            <p className="gb-titulo" style={{ fontSize: 34 }}>{titulo}</p>
            {frase && <p className="gb-frase">{frase}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
