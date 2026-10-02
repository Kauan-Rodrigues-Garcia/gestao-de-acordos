/**
 * PainelConfiguracao — quais setores entram no RH e sob qual regra.
 *
 * ## A cidade não se escolhe aqui
 *
 * A cidade do setor e o cadastro de cidades são do super admin, em
 * Configurações > Setores (`setores.cidade_id`, 20261003130000). Aqui ela só
 * aparece, e a linha do RH grava a mesma cidade do setor. Setor sem cidade não
 * entra no RH até o super admin definir.
 *
 * ## É esta tela que substitui o `if (setor === 'Play 4')`
 *
 * O pedido proíbe espalhar condicional por nome de setor pelo código, e a saída
 * não é uma constante num arquivo — é configuração de verdade: cada setor
 * aponta para uma cidade e declara premiação ou comissão. Amanhã são duas
 * cidades, ou quatro, ou um setor muda de regra, e nada disso é deploy.
 *
 * ## Setor sem configuração não entra no fechamento
 *
 * A semeadura da competência (`fn_rh_abrir_competencia`) só traz operadores de
 * setores configurados e ativos. Desligar o interruptor aqui tira o setor das
 * PRÓXIMAS competências — as já abertas continuam como estão, porque elas são
 * fotografia, não consulta.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, MapPin } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { TIPO_REMUNERACAO_LABEL, type TipoRemuneracao } from '@/services/rh/rhEstados';
import {
  listarCelulas, listarConfigSetores, salvarConfigSetor,
  type RhCelulaRow, type RhConfigSetorRow,
} from '@/services/rh/rhGestao.service';

export interface PainelConfiguracaoProps {
  aberto: boolean;
  empresaId: string;
  autorId: string;
  autorNome: string;
  onFechar: () => void;
  onMudou: () => void;
}

interface SetorSimples { id: string; nome: string; cidade_id: string | null }

export function PainelConfiguracao({
  aberto, empresaId, autorId, autorNome, onFechar, onMudou,
}: PainelConfiguracaoProps) {
  const [celulas, setCelulas] = useState<RhCelulaRow[]>([]);
  const [configs, setConfigs] = useState<RhConfigSetorRow[]>([]);
  const [setores, setSetores] = useState<SetorSimples[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    try {
      const [cel, cfg, sets] = await Promise.all([
        listarCelulas(empresaId),
        listarConfigSetores(empresaId),
        supabase.from('setores').select('id, nome, cidade_id')
          .eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
      ]);
      setCelulas(cel);
      setConfigs(cfg);
      setSetores((sets.data ?? []) as unknown as SetorSimples[]);
    } finally {
      setCarregando(false);
    }
  }, [empresaId]);

  useEffect(() => { if (aberto) void carregar(); }, [aberto, carregar]);

  const configDe = (setorId: string) => configs.find(c => c.setor_id === setorId) ?? null;

  const nomeDaCidade = (id: string | null) => celulas.find(c => c.id === id)?.nome ?? null;

  async function gravar(setor: SetorSimples, patch: { tipo?: TipoRemuneracao; ativo?: boolean }) {
    const setorId = setor.id;
    const atual = configDe(setorId);
    // Desligar um setor que perdeu a cidade ainda vale: grava a que a linha já tinha.
    const celulaId = setor.cidade_id ?? (patch.ativo === false ? atual?.celula_id : null);
    if (!celulaId) {
      toast.error('Este setor ainda não tem cidade. O super admin define em Configurações > Setores.');
      return;
    }
    setSalvandoId(setorId);
    try {
      const r = await salvarConfigSetor({
        empresaId, setorId, celulaId,
        tipoRemuneracao: patch.tipo ?? (atual?.tipo_remuneracao as TipoRemuneracao) ?? 'premiacao',
        ativo: patch.ativo ?? atual?.ativo ?? true,
        autorId, autorNome,
      });
      if (!r.ok) { toast.error(r.erro ?? 'Não foi possível salvar.'); return; }
      await carregar();
      onMudou();
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Setores do RH</DialogTitle>
          <DialogDescription>
            Só os setores ligados aqui entram nas próximas competências. As já abertas
            não mudam — elas são fotografia do momento em que foram criadas. A cidade
            de cada setor é definida pelo super admin em Configurações &gt; Setores.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* ── Setores ── */}
            <section className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Setores
              </Label>
              <div className="rounded-xl border border-border/70 divide-y divide-border/40">
                {setores.map(s => {
                  const cfg = configDe(s.id);
                  const ligado = cfg?.ativo ?? false;
                  return (
                    <div key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <span className="text-sm font-medium text-foreground flex-1 min-w-[120px] truncate">
                        {s.nome}
                      </span>

                      <span className="flex items-center gap-1 w-36 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {nomeDaCidade(s.cidade_id) ?? <span className="italic">Sem cidade</span>}
                      </span>

                      <Select
                        value={cfg?.tipo_remuneracao ?? 'premiacao'}
                        onValueChange={v => void gravar(s, { tipo: v as TipoRemuneracao, ativo: true })}
                        disabled={!s.cidade_id}
                      >
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(TIPO_REMUNERACAO_LABEL) as TipoRemuneracao[]).map(t => (
                            <SelectItem key={t} value={t}>{TIPO_REMUNERACAO_LABEL[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={ligado}
                          onCheckedChange={v => void gravar(s, { ativo: v })}
                          disabled={!s.cidade_id && !ligado}
                          aria-label={`Incluir ${s.nome} no RH`}
                        />
                        <span className="text-[11px] text-muted-foreground w-16">
                          {ligado ? 'no RH' : 'fora'}
                        </span>
                        {salvandoId === s.id && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  );
                })}
                {setores.length === 0 && (
                  <p className="text-xs text-muted-foreground px-3 py-6 text-center">
                    Nenhum setor ativo nesta empresa.
                  </p>
                )}
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default PainelConfiguracao;
