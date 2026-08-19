/**
 * ImportarAcordosCard — devolver a um operador as tabulações do relatório.
 *
 * O contrário do "chegar limpo": a transferência de setor e a exclusão de
 * usuário baixam o .xlsx das tabulações antes de apagá-las, e este card lê
 * aquele mesmo arquivo de volta. A regra e as conversões vivem em
 * `importacaoAcordos.service`; aqui é só a conversa com o admin.
 *
 * O fluxo tem DOIS passos de propósito. O primeiro só lê o arquivo e confere os
 * NRs; o segundo grava. Entre um e outro a tela mostra quantas linhas entram,
 * quantas esbarram em NR de outra pessoa e quantas não deram para ler — porque
 * "importar 38 acordos" e "importar 31 acordos e 7 sumiram" são decisões
 * diferentes, e quem decide é quem está olhando.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useTenant } from '@/lib/tenant-config';
import {
  lerRelatorioAcordos, analisarImportacao, importarAcordos, RelatorioIlegivel,
  type PreviaImportacao, type AcordoDoRelatorio, type LinhaRecusada,
} from '@/services/admin/importacaoAcordos.service';

interface PerfilOpcao { id: string; nome: string; usuario: string | null; setor: string | null }

export default function ImportarAcordosCard() {
  const { empresa } = useEmpresa();
  const tenant = useTenant();
  const empresaId = empresa?.id ?? null;

  const [perfis, setPerfis] = useState<PerfilOpcao[]>([]);
  const [busca, setBusca] = useState('');
  const [operador, setOperador] = useState<PerfilOpcao | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [uf, setUf] = useState('');
  const [previa, setPrevia] = useState<PreviaImportacao | null>(null);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [feito, setFeito] = useState<{ gravados: number; falhas: LinhaRecusada[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // A lista inclui desligados: reimportar tabulação de quem saiu é justamente
  // um dos motivos de este card existir. Arquivado (desligado de mês anterior)
  // fica fora, como em toda lista de pessoas.
  useEffect(() => {
    if (!empresaId) return;
    let vivo = true;
    (async () => {
      const { data } = await supabase
        .from('perfis')
        .select('id, nome, usuario, arquivado, setores(nome)')
        .eq('empresa_id', empresaId)
        .order('nome');
      if (!vivo) return;
      setPerfis(((data ?? []) as unknown as {
        id: string; nome: string | null; usuario: string | null;
        arquivado: boolean | null; setores: { nome?: string } | null;
      }[])
        .filter(p => p.arquivado !== true)
        .map(p => ({
          id: p.id, nome: p.nome ?? '(sem nome)', usuario: p.usuario,
          setor: p.setores?.nome ?? null,
        })));
    })();
    return () => { vivo = false; };
  }, [empresaId]);

  const sugestoes = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return [];
    return perfis
      .filter(p => p.nome.toLowerCase().includes(t) || (p.usuario ?? '').toLowerCase().includes(t))
      .slice(0, 8);
  }, [busca, perfis]);

  /** Nome → id, para religar a coluna "Pareado com" ao operador do par EXTRA. */
  const perfisPorNome = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of perfis) m.set(p.nome.trim().toLowerCase(), p.id);
    return m;
  }, [perfis]);

  const campoNr = tenant.isPaguePlay ? 'instituicao' as const : 'nr_cliente' as const;

  function limpar() {
    setArquivo(null); setPrevia(null); setFeito(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function conferir(f: File) {
    if (!empresaId) return;
    setArquivo(f); setPrevia(null); setFeito(null); setLendo(true);
    try {
      const { linhas, recusadas } = await lerRelatorioAcordos(f);
      setPrevia(await analisarImportacao({ linhas, recusadas, empresaId, campoNr }));
    } catch (e) {
      setArquivo(null);
      if (inputRef.current) inputRef.current.value = '';
      toast.error(e instanceof RelatorioIlegivel ? e.message
        : `Falha ao ler o arquivo: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setLendo(false); }
  }

  async function gravar() {
    if (!previa || !operador || !empresaId) return;
    setGravando(true);
    try {
      const r = await importarAcordos({
        aptas: previa.aptas, operadorId: operador.id, empresaId,
        perfisPorNome, ufPadrao: uf.trim() || null,
      });
      setFeito(r);
      if (r.gravados) {
        toast.success(
          `${r.gravados} tabulaç${r.gravados === 1 ? 'ão' : 'ões'} devolvida${r.gravados === 1 ? '' : 's'} `
          + `a ${operador.nome}.`,
        );
      }
      if (r.falhas.length) toast.error(`${r.falhas.length} linha(s) o banco recusou — veja a lista.`);
    } catch (e) {
      toast.error(`Erro ao importar: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setGravando(false); }
  }

  const podeGravar = !!operador && !!previa && previa.aptas.length > 0 && !gravando;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Upload className="w-4 h-4 text-primary" /> Importar Recebimentos / Acordos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Lê o <strong>.xlsx que o próprio sistema baixa</strong> ao transferir ou excluir um
          usuário e devolve aquelas tabulações ao operador escolhido, com valor, vencimento,
          parcela, tipo, status, vínculo e observações como estavam. Nada muda na forma como o
          relatório é gerado — este card só o lê de volta.
        </p>

        {/* ── Operador de destino ─────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <Label className="text-xs">Operador que receberá as tabulações</Label>
          {operador ? (
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
              <span className="text-sm font-medium flex-1 truncate">
                {operador.nome}
                {operador.setor && <span className="text-muted-foreground font-normal"> · {operador.setor}</span>}
              </span>
              <Button variant="ghost" size="icon" className="w-6 h-6"
                onClick={() => { setOperador(null); setBusca(''); }}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Input value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Digite o nome ou o login do operador…" className="h-9" />
              {sugestoes.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden">
                  {sugestoes.map(p => (
                    <button key={p.id} type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60"
                      onClick={() => { setOperador(p); setBusca(''); }}>
                      {p.nome}
                      <span className="text-xs text-muted-foreground">
                        {p.usuario ? ` · ${p.usuario}` : ''}{p.setor ? ` · ${p.setor}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* PaguePlay barra acordo sem UF por trigger, e a coluna não existe no
            relatório — ver `fn_acordo_exige_estado`. Nas outras empresas o
            campo não faz sentido nenhum e nem aparece. */}
        {tenant.isPaguePlay && (
          <div className="space-y-1.5">
            <Label className="text-xs">Estado (UF) padrão</Label>
            <Input value={uf} onChange={e => setUf(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="SP" className="h-9 w-24" />
            <p className="text-[11px] text-muted-foreground">
              Usado só nas linhas cujo estado não vier nas observações. A PaguePlay não grava
              acordo sem UF.
            </p>
          </div>
        )}

        {/* ── Arquivo ─────────────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <Label className="text-xs">Relatório (.xlsx)</Label>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void conferir(f); }} />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2"
              onClick={() => inputRef.current?.click()} disabled={lendo || gravando}>
              {lendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              {arquivo ? 'Trocar arquivo' : 'Escolher arquivo'}
            </Button>
            {arquivo && (
              <span className="text-xs text-muted-foreground truncate flex-1">{arquivo.name}</span>
            )}
            {arquivo && (
              <Button variant="ghost" size="sm" onClick={limpar} disabled={gravando}>Limpar</Button>
            )}
          </div>
        </div>

        {/* ── Prévia ──────────────────────────────────────────────────────── */}
        {previa && !feito && (
          <div className="rounded-md border border-border p-3 space-y-2.5 text-xs">
            <p className="font-medium text-sm">
              {previa.totalLido} linha(s) lida(s) — {previa.aptas.length} entram
            </p>

            {previa.conflitos.length > 0 && (
              <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2.5 space-y-1">
                <p className="flex items-center gap-1.5 font-medium text-amber-600">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {previa.conflitos.length} NR já pertence(m) a outro operador — fica(m) de fora
                </p>
                <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                  {previa.conflitos.map(c => (
                    <li key={`${c.linha}-${c.nr}`} className="text-muted-foreground">
                      Linha {c.linha} · <span className="font-mono">{c.nr}</span> ({c.rotulo}) —
                      hoje é de <strong>{c.operadorNome}</strong>
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground">
                  Verifique com essa pessoa antes de retabular à mão: o NR só tem um dono.
                </p>
              </div>
            )}

            {previa.recusadas.length > 0 && (
              <div className="rounded border border-destructive/40 bg-destructive/5 p-2.5 space-y-1">
                <p className="font-medium text-destructive">
                  {previa.recusadas.length} linha(s) sem dados suficientes
                </p>
                <ul className="space-y-0.5 max-h-32 overflow-y-auto text-muted-foreground">
                  {previa.recusadas.map(r => (
                    <li key={r.linha}>Linha {r.linha} ({r.rotulo}) — {r.motivo}</li>
                  ))}
                </ul>
              </div>
            )}

            <AmostraDaPrevia aptas={previa.aptas} />

            <Button size="sm" className="w-full gap-2" disabled={!podeGravar} onClick={gravar}>
              {gravando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {operador
                ? `Importar ${previa.aptas.length} tabulação(ões) para ${operador.nome}`
                : 'Escolha o operador de destino'}
            </Button>
          </div>
        )}

        {/* ── Resultado ───────────────────────────────────────────────────── */}
        {feito && (
          <div className="rounded-md border border-border p-3 space-y-2 text-xs">
            <p className="flex items-center gap-1.5 font-medium text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" /> {feito.gravados} tabulação(ões) gravada(s)
            </p>
            {feito.falhas.length > 0 && (
              <ul className="space-y-0.5 text-muted-foreground max-h-40 overflow-y-auto">
                {feito.falhas.map(f => (
                  <li key={f.linha}>Linha {f.linha} ({f.rotulo}) — {f.motivo}</li>
                ))}
              </ul>
            )}
            <Button variant="outline" size="sm" onClick={limpar}>Importar outro arquivo</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** As cinco primeiras linhas, para o admin reconhecer o arquivo antes de gravar. */
function AmostraDaPrevia({ aptas }: { aptas: AcordoDoRelatorio[] }) {
  if (!aptas.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead className="text-muted-foreground">
          <tr className="text-left">
            <th className="py-1 pr-2">NR</th><th className="py-1 pr-2">Cliente</th>
            <th className="py-1 pr-2">Venc.</th><th className="py-1 pr-2">Valor</th>
            <th className="py-1 pr-2">Parc.</th><th className="py-1">Status</th>
          </tr>
        </thead>
        <tbody>
          {aptas.slice(0, 5).map(a => (
            <tr key={a.linha} className="border-t border-border/60">
              <td className="py-1 pr-2 font-mono">{a.nr_cliente || '—'}</td>
              <td className="py-1 pr-2 truncate max-w-[10rem]">{a.nome_cliente}</td>
              <td className="py-1 pr-2">{a.vencimento}</td>
              <td className="py-1 pr-2">{a.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
              <td className="py-1 pr-2">{a.numero_parcela}/{a.parcelas}</td>
              <td className="py-1">{a.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {aptas.length > 5 && (
        <p className="text-muted-foreground pt-1">…e mais {aptas.length - 5} linha(s).</p>
      )}
    </div>
  );
}
