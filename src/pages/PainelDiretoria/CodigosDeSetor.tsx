/**
 * CodigosDeSetor — o código do ERP que faz o 59 encontrar o setor sozinho.
 *
 * ## O que esta aba resolve
 *
 * Cada carteira do relatório 59 precisava ser ligada a um setor à mão, uma por
 * uma, na aba Relatório 59. Funcionava e era frágil: nome de setor muda,
 * carteira nova aparece, e enquanto ninguém liga o dinheiro fica fora da conta.
 * Em 10/09/2026 havia seis carteiras sem setor, e uma delas — `MARILIA - COFEN`
 * — carregava R$ 741.778,11 do mês.
 *
 * O 59 traz `CodGrupoFiltro`, que é 1:1 com `NomeGrupoFiltro` nas duas direções
 * (medido: 16 códigos, 16 nomes, zero ambiguidade). É a versão estável do nome.
 * Guardando esse código NO SETOR, o vínculo deixa de ser um ato e vira uma
 * consequência.
 *
 * ## Esta é a ÚNICA via
 *
 * O vínculo manual de carteira foi REMOVIDO junto com a criação desta aba.
 * Dois caminhos para o mesmo fato não se sincronizam: um setor com código 25
 * e a mesma carteira ligada à mão a outro setor seriam duas verdades sobre o
 * mesmo dinheiro, e nada diria qual vale.
 *
 * O vínculo manual de EQUIPE continua, porque equipe não tem código no
 * relatório — para onde ela vai segue sendo decisão de gente.
 *
 * ## Apagar o código desfaz o vínculo
 *
 * E tem de desfazer. Enquanto existia o vínculo manual, deixar a carteira
 * amarrada era defensável: havia outra porta para soltá-la. Não há mais, e
 * uma carteira presa a um setor sem código que a justifique seria a mesma
 * «duas verdades» invertida — um vínculo sem dono.
 *
 * Trocar o código faz as duas coisas na mesma ação: solta a carteira do
 * código antigo e amarra a do novo. A tela conta as duas na mesma mensagem.
 *
 * ## Por que digitar, e não escolher numa lista
 *
 * A lista de carteiras vem do 59 já importado. Se a pessoa só pudesse escolher
 * do que já foi importado, o setor que ainda não apareceu em relatório nenhum
 * não teria como ser configurado — e é justamente ele que se quer deixar pronto
 * antes da próxima carga. Digitar aceita o código que ainda não chegou.
 *
 * O preço é digitar errado, e por isso a linha diz de volta qual carteira o
 * código encontrou. Código que o 59 não conhece aparece em âmbar: não é erro
 * (pode ser carteira que ainda vai chegar), é um aviso para conferir.
 *
 * ## Quem edita
 *
 * `super_admin`, e a tela não é a única guarda: `fn_setor_definir_codigo_erp`
 * recusa qualquer outro, e um gatilho em `setores` recusa a alteração da coluna
 * mesmo vindo por outro caminho. Trocar o código de um setor redireciona o
 * dinheiro de uma carteira inteira.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, Check, AlertTriangle, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  buscarCodigosDeSetor, definirCodigoDeSetor, buscarResumoGrupos,
  type CodigoDeSetor, type GrupoDoMestre,
} from '@/services/mestre/mestre.service';

interface Props { empresaId: string; mes: string; versao?: number }

export default function CodigosDeSetor({ empresaId, mes, versao = 0 }: Props) {
  const [setores, setSetores] = useState<CodigoDeSetor[]>([]);
  const [carteiras, setCarteiras] = useState<GrupoDoMestre[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  /** O que está digitado agora, por setor. Só existe enquanto difere do salvo. */
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    try {
      /*
       * As duas listas juntas: a de carteiras é referência para digitar, e sem
       * ela a tela pediria um número que a pessoa teria de ir procurar noutra
       * aba. `catch` separado no resumo — mês sem 59 importado é estado normal,
       * e não deve impedir a configuração dos códigos.
       */
      const [cods, grupos] = await Promise.all([
        buscarCodigosDeSetor(empresaId),
        buscarResumoGrupos(empresaId, mes).catch(() => [] as GrupoDoMestre[]),
      ]);
      setSetores(cods);
      setCarteiras(grupos);
      setRascunho({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível carregar.');
    } finally {
      setCarregando(false);
    }
  }, [empresaId, mes]);

  useEffect(() => { void carregar(); }, [carregar, versao]);

  async function salvar(s: CodigoDeSetor) {
    const digitado = (rascunho[s.setor_id] ?? '').trim();
    const atual = s.codigo_erp ?? '';
    if (digitado === atual) return;

    setSalvando(s.setor_id);
    try {
      const r = await definirCodigoDeSetor({
        setorId: s.setor_id,
        codigo: digitado === '' ? null : digitado,
      });
      // Recarrega em vez de remendar o estado: o vínculo mexe em `mestre_grupos`,
      // e a linha precisa voltar do banco para dizer a verdade sobre a carteira.
      await carregar();
      if (r.codigo === null) {
        toast.success(`Código removido de ${s.setor_nome}.`, {
          description: r.desvinculou ? `${r.desvinculou} ficou sem setor.` : undefined,
        });
      } else if (r.carteira) {
        toast.success(`${s.setor_nome} → ${r.carteira}`, {
          description: [
            r.vinculou ? 'Carteira vinculada agora.' : 'Já estava vinculada.',
            r.desvinculou ? `${r.desvinculou} ficou sem setor.` : null,
          ].filter(Boolean).join(' '),
        });
      } else {
        toast.warning(`Código ${r.codigo} salvo, mas o 59 deste mês não tem essa carteira.`, {
          description: 'Confira o número, ou aguarde a carteira aparecer numa próxima carga.',
          duration: 7000,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(null);
    }
  }

  /** Códigos já reivindicados, para a lista de referência dizer quem é de quem. */
  const donoDoCodigo = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of setores) if (s.codigo_erp) m.set(s.codigo_erp, s.setor_nome);
    return m;
  }, [setores]);

  const carteirasFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return carteiras;
    return carteiras.filter(c =>
      c.cod_grupo_filtro.includes(t)
      || (c.nome_no_relatorio || c.nome_cadastrado).toLowerCase().includes(t));
  }, [carteiras, busca]);

  const configurados = setores.filter(s => s.codigo_erp).length;

  if (carregando) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            Código do setor no relatório 59
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            O <code className="text-xs bg-muted px-1 py-0.5 rounded">CodGrupoFiltro</code> é
            único por carteira. Com ele preenchido, a carteira do 59 encontra o setor
            sozinha — inclusive as que ainda vão aparecer.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {configurados} de {setores.length} configurados
          </span>
          <Button variant="outline" size="sm" onClick={() => void carregar()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* ── Os setores ────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border divide-y divide-border">
        {setores.map(s => {
          const digitado = rascunho[s.setor_id] ?? s.codigo_erp ?? '';
          const mudou = digitado.trim() !== (s.codigo_erp ?? '');
          const ocupado = salvando === s.setor_id;

          return (
            <div key={s.setor_id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
              <div className="min-w-[180px] flex-1">
                <span className={cn('text-sm font-medium',
                  s.ativo ? 'text-foreground' : 'text-muted-foreground line-through')}>
                  {s.setor_nome}
                </span>
              </div>

              <input
                value={digitado}
                inputMode="numeric"
                placeholder="código"
                disabled={ocupado}
                onChange={e => setRascunho(r => ({ ...r, [s.setor_id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') void salvar(s); }}
                className="w-24 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              />

              <div className="min-w-[220px] flex-1 text-xs">
                {mudou ? (
                  <span className="text-muted-foreground">alterado — salve para vincular</span>
                ) : s.codigo_erp && s.carteira_ok ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    {s.carteira}
                  </span>
                ) : s.codigo_erp ? (
                  /* Código digitado que o 59 não conhece. Ver o cabeçalho: não é
                     erro, é o aviso que impede dinheiro de sumir em silêncio. */
                  <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-500">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    não está no 59 deste mês
                  </span>
                ) : (
                  <span className="text-muted-foreground">sem código</span>
                )}
              </div>

              <Button size="sm" variant={mudou ? 'default' : 'outline'}
                      disabled={!mudou || ocupado} onClick={() => void salvar(s)}>
                {ocupado ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          );
        })}
      </div>

      {/* ── A referência ──────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground">
            Carteiras no 59 de {mes}
          </h3>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="filtrar"
              className="w-48 rounded-md border border-border bg-background pl-8 pr-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {carteiras.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-4 py-6 text-center">
            Nenhum 59 importado neste mês. Os códigos podem ser configurados assim mesmo —
            valem na próxima carga.
          </p>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border">
            {carteirasFiltradas.map(c => {
              const dono = donoDoCodigo.get(c.cod_grupo_filtro);
              return (
                <div key={c.cod_grupo_filtro} className="flex items-center gap-3 px-4 py-2 text-sm flex-wrap">
                  <Badge variant="outline" className="font-mono">{c.cod_grupo_filtro}</Badge>
                  <span className="flex-1 min-w-[180px] text-foreground">
                    {c.nome_no_relatorio || c.nome_cadastrado}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatBRL(c.recebido_proprio)}
                  </span>
                  <span className="min-w-[160px] text-xs">
                    {dono
                      ? <span className="text-emerald-600 dark:text-emerald-400">→ {dono}</span>
                      : <span className="text-muted-foreground">nenhum setor usa este código</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
