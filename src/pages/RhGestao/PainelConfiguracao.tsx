/**
 * PainelConfiguracao — quais setores entram no RH, em que cidade, e sob qual regra.
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
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  listarCelulas, listarConfigSetores, salvarCelula, salvarConfigSetor,
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

interface SetorSimples { id: string; nome: string }

export function PainelConfiguracao({
  aberto, empresaId, autorId, autorNome, onFechar, onMudou,
}: PainelConfiguracaoProps) {
  const [celulas, setCelulas] = useState<RhCelulaRow[]>([]);
  const [configs, setConfigs] = useState<RhConfigSetorRow[]>([]);
  const [setores, setSetores] = useState<SetorSimples[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [novaCelula, setNovaCelula] = useState('');

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    try {
      const [cel, cfg, sets] = await Promise.all([
        listarCelulas(empresaId),
        listarConfigSetores(empresaId),
        supabase.from('setores').select('id, nome')
          .eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
      ]);
      setCelulas(cel);
      setConfigs(cfg);
      setSetores((sets.data ?? []) as SetorSimples[]);
    } finally {
      setCarregando(false);
    }
  }, [empresaId]);

  useEffect(() => { if (aberto) void carregar(); }, [aberto, carregar]);

  const configDe = (setorId: string) => configs.find(c => c.setor_id === setorId) ?? null;

  async function gravar(setorId: string, patch: {
    celulaId?: string; tipo?: TipoRemuneracao; ativo?: boolean;
  }) {
    const atual = configDe(setorId);
    const celulaId = patch.celulaId ?? atual?.celula_id ?? celulas[0]?.id;
    if (!celulaId) {
      toast.error('Cadastre uma cidade antes de configurar setores.');
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

  async function criarCelula() {
    const nome = novaCelula.trim();
    if (!nome) return;
    const r = await salvarCelula({ empresaId, nome, ordem: celulas.length + 1 });
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível criar a cidade.'); return; }
    setNovaCelula('');
    await carregar();
    toast.success(`Cidade ${nome} criada.`);
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cidades e setores do RH</DialogTitle>
          <DialogDescription>
            Só os setores ligados aqui entram nas próximas competências. As já abertas
            não mudam — elas são fotografia do momento em que foram criadas.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* ── Cidades ── */}
            <section className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cidades / células
              </Label>
              <div className="flex flex-wrap gap-2">
                {celulas.map(c => (
                  <span key={c.id}
                        className="text-xs px-2.5 py-1 rounded-lg border border-border bg-muted/30">
                    {c.nome}
                  </span>
                ))}
                {celulas.length === 0 && (
                  <span className="text-xs text-muted-foreground">Nenhuma cidade cadastrada.</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={novaCelula} onChange={e => setNovaCelula(e.target.value)}
                  placeholder="Nova cidade (ex.: Birigui)" className="h-8 text-xs max-w-xs"
                  onKeyDown={e => { if (e.key === 'Enter') void criarCelula(); }}
                />
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                        onClick={() => void criarCelula()} disabled={!novaCelula.trim()}>
                  <Plus className="w-3 h-3" /> Adicionar
                </Button>
              </div>
            </section>

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

                      <Select
                        value={cfg?.celula_id ?? ''}
                        onValueChange={v => void gravar(s.id, { celulaId: v, ativo: true })}
                        disabled={celulas.length === 0}
                      >
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <SelectValue placeholder="Cidade" />
                        </SelectTrigger>
                        <SelectContent>
                          {celulas.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={cfg?.tipo_remuneracao ?? 'premiacao'}
                        onValueChange={v => void gravar(s.id, { tipo: v as TipoRemuneracao, ativo: true })}
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
                          onCheckedChange={v => void gravar(s.id, { ativo: v })}
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
