/**
 * AdminPetAba — painel do joguinho do pet em Configurações (admin/super_admin).
 *
 * Duas seções:
 *  • Jogadores: moedas/nível/streak/itens de cada usuário + ajuste manual
 *    de moedas (bônus de gincana, correção…). Tudo validado no servidor
 *    (fn_pet_admin_listar / fn_pet_admin_ajustar_moedas).
 *  • Catálogo da loja: editar preço e ativar/desativar itens (pet_itens,
 *    RLS de admin). Item novo ainda exige arte no código (PetAura) — o
 *    painel gerencia o que já existe.
 *
 * Se a migration 20260711b_pet_loja_servidor.sql não foi aplicada, mostra
 * um aviso com o nome do arquivo em vez de quebrar.
 */
import { useEffect, useState } from 'react';
import { PawPrint, RefreshCw, AlertTriangle, Coins } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import type { PetItem } from '@/lib/supabase';
import {
  listarJogadoresPet, listarItensPetAdmin, ajustarMoedasPet, atualizarItemPet,
  type PetJogador,
} from '@/services/pet/petAdmin.service';

const MIGRATION_PENDENTE = 'supabase/migrations/20260711b_pet_loja_servidor.sql';

export default function AdminPetAba() {
  const [jogadores, setJogadores] = useState<PetJogador[] | null>(null);
  const [itens, setItens]         = useState<PetItem[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [deltas, setDeltas]         = useState<Record<string, string>>({});
  const [motivos, setMotivos]       = useState<Record<string, string>>({});
  const [precos, setPrecos]         = useState<Record<string, string>>({});
  const [salvandoItem, setSalvandoItem] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    const [js, cat] = await Promise.all([listarJogadoresPet(), listarItensPetAdmin()]);
    setJogadores(js);
    setItens(cat);
    setCarregando(false);
  }

  useEffect(() => { void carregar(); }, []);

  async function aplicarAjuste(j: PetJogador) {
    const delta = parseInt(deltas[j.usuario_id] ?? '', 10);
    if (!delta) { toast.error('Informe um valor (ex.: 50 ou -20)'); return; }
    const motivo = (motivos[j.usuario_id] ?? '').trim();
    if (!motivo) { toast.error('Informe o motivo do ajuste (fica no log de auditoria)'); return; }
    const novoSaldo = await ajustarMoedasPet(j.usuario_id, delta, motivo);
    if (novoSaldo === null) {
      toast.error('Não deu — saldo ficaria negativo ou a migration está pendente');
      return;
    }
    toast.success(`${j.nome}: ${delta > 0 ? '+' : ''}${delta} 🪙 (saldo ${novoSaldo})`);
    setDeltas(d => ({ ...d, [j.usuario_id]: '' }));
    setMotivos(m => ({ ...m, [j.usuario_id]: '' }));
    setJogadores(prev => prev?.map(x =>
      x.usuario_id === j.usuario_id ? { ...x, moedas: novoSaldo } : x) ?? null);
  }

  async function salvarPreco(item: PetItem) {
    const preco = parseInt(precos[item.id] ?? '', 10);
    if (Number.isNaN(preco) || preco < 0) { toast.error('Preço inválido'); return; }
    setSalvandoItem(item.id);
    const ok = await atualizarItemPet(item.id, { preco_moedas: preco });
    setSalvandoItem(null);
    if (!ok) { toast.error('Erro ao salvar preço'); return; }
    toast.success(`${item.nome}: preço 🪙 ${preco}`);
    setItens(prev => prev?.map(i => (i.id === item.id ? { ...i, preco_moedas: preco } : i)) ?? null);
    setPrecos(p => ({ ...p, [item.id]: '' }));
  }

  async function alternarAtivo(item: PetItem) {
    const ok = await atualizarItemPet(item.id, { ativo: !item.ativo });
    if (!ok) { toast.error('Erro ao atualizar item'); return; }
    setItens(prev => prev?.map(i => (i.id === item.id ? { ...i, ativo: !item.ativo } : i)) ?? null);
  }

  const migrationPendente = !carregando && jogadores === null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <PawPrint className="w-4 h-4 text-primary" /> Joguinho do Pet
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Moedas dos jogadores e catálogo da loja — validados no servidor.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 h-8" onClick={() => void carregar()} disabled={carregando}>
          <RefreshCw className={carregando ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} /> Atualizar
        </Button>
      </div>

      {migrationPendente && (
        <Card className="border-amber-400/50">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="text-sm font-medium text-foreground">Migration pendente</p>
              <p>
                Execute <code className="font-mono bg-muted px-1 py-0.5 rounded">{MIGRATION_PENDENTE}</code>{' '}
                no Supabase Dashboard → SQL Editor para habilitar o painel (compra validada
                no servidor, catálogo no banco e ajuste de moedas).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Jogadores ─────────────────────────────────────────────────── */}
      {jogadores && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-500" /> Jogadores ({jogadores.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {jogadores.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Ninguém tem pet ainda.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium">Nome</th>
                    <th className="py-2 pr-3 font-medium">Cargo</th>
                    <th className="py-2 pr-3 font-medium text-right">🪙 Saldo</th>
                    <th className="py-2 pr-3 font-medium text-right">Ganhas</th>
                    <th className="py-2 pr-3 font-medium text-right">Gastas</th>
                    <th className="py-2 pr-3 font-medium text-right">Itens</th>
                    <th className="py-2 pr-3 font-medium">Último ativo</th>
                    <th className="py-2 font-medium">Ajustar moedas</th>
                  </tr>
                </thead>
                <tbody>
                  {jogadores.map(j => (
                    <tr key={j.usuario_id} className="border-b border-border/50">
                      <td className="py-1.5 pr-3 font-medium text-foreground whitespace-nowrap">{j.nome}</td>
                      <td className="py-1.5 pr-3 capitalize">{j.cargo.replace('_', ' ')}</td>
                      <td className="py-1.5 pr-3 text-right font-bold text-amber-600 dark:text-amber-400">
                        {j.moedas.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-1.5 pr-3 text-right">{Number(j.moedas_ganhas_total).toLocaleString('pt-BR')}</td>
                      <td className="py-1.5 pr-3 text-right">{Number(j.moedas_gastas_total).toLocaleString('pt-BR')}</td>
                      <td className="py-1.5 pr-3 text-right">{j.qtd_itens}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {j.ultimo_dia_ativo
                          ? new Date(`${j.ultimo_dia_ativo}T12:00:00`).toLocaleDateString('pt-BR')
                          : '—'}
                      </td>
                      <td className="py-1.5">
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            placeholder="+50 / -20"
                            className="h-7 w-20 text-xs"
                            value={deltas[j.usuario_id] ?? ''}
                            onChange={e => setDeltas(d => ({ ...d, [j.usuario_id]: e.target.value }))}
                          />
                          <Input
                            placeholder="Motivo"
                            className="h-7 w-28 text-xs"
                            value={motivos[j.usuario_id] ?? ''}
                            onChange={e => setMotivos(m => ({ ...m, [j.usuario_id]: e.target.value }))}
                          />
                          <Button size="sm" variant="outline" className="h-7 text-[11px] px-2"
                            onClick={() => void aplicarAjuste(j)}>
                            Aplicar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Catálogo da loja ──────────────────────────────────────────── */}
      {itens && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">🛍️ Catálogo da loja ({itens.length} itens)</CardTitle>
            <p className="text-[11px] text-muted-foreground font-normal">
              Preço e disponibilidade valem na hora (o servidor valida a compra).
              Item novo exige a arte no código (PetAura) antes de entrar aqui.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 pr-3 font-medium">Vitrine</th>
                  <th className="py-2 pr-3 font-medium text-right">🪙 Preço</th>
                  <th className="py-2 pr-3 font-medium">Novo preço</th>
                  <th className="py-2 font-medium">Ativo</th>
                </tr>
              </thead>
              <tbody>
                {itens.map(i => (
                  <tr key={i.id} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 font-medium text-foreground whitespace-nowrap">
                      <span className="mr-1.5">{i.emoji}</span>{i.nome}
                    </td>
                    <td className="py-1.5 pr-3 capitalize">{i.tipo}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {i.disponivel_ate
                        ? `até ${new Date(i.disponivel_ate).toLocaleDateString('pt-BR')}`
                        : 'sempre'}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-bold">
                      {i.preco_moedas === 0 ? 'grátis' : (i.preco_moedas ?? '—')}
                    </td>
                    <td className="py-1.5 pr-3">
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          placeholder={String(i.preco_moedas ?? 0)}
                          className="h-7 w-20 text-xs"
                          value={precos[i.id] ?? ''}
                          onChange={e => setPrecos(p => ({ ...p, [i.id]: e.target.value }))}
                        />
                        <Button size="sm" variant="outline" className="h-7 text-[11px] px-2"
                          disabled={salvandoItem === i.id || !(precos[i.id] ?? '').length}
                          onClick={() => void salvarPreco(i)}>
                          {salvandoItem === i.id ? '…' : 'Salvar'}
                        </Button>
                      </div>
                    </td>
                    <td className="py-1.5">
                      <Switch checked={i.ativo} onCheckedChange={() => void alternarAtivo(i)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
