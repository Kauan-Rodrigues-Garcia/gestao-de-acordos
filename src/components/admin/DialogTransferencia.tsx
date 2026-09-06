/**
 * DialogTransferencia — a porta única para mover pessoas de setor ou empresa.
 *
 * ## Por que virou componente
 *
 * Isto morava dentro de `AdminSetoresAba`, junto de uma lista de pessoas que
 * repetia a da aba Usuários. A lista saiu de lá (a mesma verdade em dois
 * lugares diverge), e a transferência veio para onde as pessoas estão — a aba
 * Usuários. Um componente próprio foi o jeito de mudar de aba sem colar 300
 * linhas numa tela que já tinha 1.600.
 *
 * ## O que a mudança de endereço conserta
 *
 * `usuarios_transferir` liga por padrão para líder, elite, gerência e diretoria.
 * `ver_setores` liga só para gerência e diretoria. Enquanto a única porta era a
 * aba Setores, líder e elite tinham a permissão ligada e NENHUM lugar onde
 * exercê-la — uma chave alcançável no painel e inerte na tela.
 *
 * ## O que a transferência faz de verdade
 *
 * Não é um `update` de `setor_id`. Ela apaga (ou move) tabulação, libera NR,
 * tira de equipe e de clone, deixa fantasma na equipe de origem e grava
 * registro para poder ser desfeita. Tudo isso vive em `executarTransferencia`;
 * aqui é só a escolha do destino e o aviso honesto do que vai acontecer.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRightLeft, X, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase, type Perfil, type Setor } from '@/lib/supabase';
import { executarTransferencia } from '@/services/admin/transferenciaUsuario.service';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface Props {
  /** Quem vai ser transferido. `null` mantém o diálogo fechado. */
  alvos: Perfil[] | null;
  /** Setores da empresa ATUAL — o destino padrão. */
  setores: Setor[];
  empresaId: string | null | undefined;
  onFechar: () => void;
  /** Chamado só quando pelo menos uma transferência deu certo. */
  onConcluida: () => void;
}

export function DialogTransferencia({
  alvos, setores, empresaId, onFechar, onConcluida,
}: Props) {
  const { perfil: perfilAtual } = useAuth();

  const [destinoSetor,   setDestinoSetor]   = useState('');
  const [destinoEmpresa, setDestinoEmpresa] = useState('');
  const [setoresDestino, setSetoresDestino] = useState<Setor[]>([]);
  const [carregandoDestino, setCarregandoDestino] = useState(false);
  const [levarAcordos,   setLevarAcordos]   = useState(false);
  const [empresas,       setEmpresas]       = useState<{ id: string; nome: string }[]>([]);
  const [salvando,       setSalvando]       = useState(false);

  /*
   * Empresas de destino: só super_admin. `setores_select` usa
   * `fn_can_access_empresa`, que só abre a outra empresa para ele — um
   * administrador comum veria a lista vazia e o UPDATE seria barrado pela RLS.
   * Oferecer o campo a quem não pode usar é pior do que não oferecer.
   */
  const podeTrocarEmpresa = perfilAtual?.perfil === 'super_admin';

  /** O destino é outra empresa? Muda o título, some a escolha e o aviso troca. */
  const trocaDeEmpresa = !!destinoEmpresa && destinoEmpresa !== empresaId;

  // Reabrir SEMPRE recomeça em "chegar limpo": herdar a escolha da
  // transferência anterior é como se apaga um histórico sem querer.
  useEffect(() => {
    if (!alvos) return;
    setDestinoSetor('');
    setDestinoEmpresa(empresaId ?? '');
    setSetoresDestino(setores);
    setLevarAcordos(false);
  }, [alvos, empresaId, setores]);

  useEffect(() => {
    if (!podeTrocarEmpresa) { setEmpresas([]); return; }
    let cancel = false;
    void supabase.from('empresas').select('id, nome').order('nome').then(({ data }) => {
      if (!cancel) setEmpresas((data as { id: string; nome: string }[]) ?? []);
    });
    return () => { cancel = true; };
  }, [podeTrocarEmpresa]);

  /*
   * Setores da empresa de DESTINO.
   *
   * Sem isto o seletor listava sempre os da empresa atual: ao escolher a outra
   * empresa não aparecia setor nenhum e a transferência ficava impossível de
   * concluir.
   */
  useEffect(() => {
    if (!alvos || !destinoEmpresa) return;
    if (destinoEmpresa === empresaId) { setSetoresDestino(setores); return; }
    let cancel = false;
    setCarregandoDestino(true);
    void supabase.from('setores')
      .select('*').eq('empresa_id', destinoEmpresa).order('nome')
      .then(({ data }) => {
        if (cancel) return;
        setSetoresDestino((data as Setor[]) ?? []);
        setCarregandoDestino(false);
      });
    return () => { cancel = true; };
  }, [alvos, destinoEmpresa, empresaId, setores]);

  /**
   * Executa a transferência de todo mundo que está selecionado.
   *
   * ## Um de cada vez, de propósito
   *
   * Cada pessoa gera o próprio relatório de tabulações ANTES de qualquer
   * DELETE (regra de 20260805c). Em lote isso é um arquivo por pessoa — e é o
   * certo: as tabulações são de cada uma, e um arquivo só não diria de quem é o
   * quê. Sequencial também garante que a falha de uma não leve as outras junto.
   */
  const transferir = useCallback(async () => {
    if (!alvos?.length || !destinoSetor || !empresaId) return;
    setSalvando(true);

    const empresaDestino = destinoEmpresa || empresaId;
    let ok = 0, apagados = 0, movidos = 0;
    const falhas: string[] = [];

    for (const p of alvos) {
      const r = await executarTransferencia({
        alvo: {
          perfilId:         p.id,
          nome:             p.nome,
          usuario:          p.usuario ?? null,
          origemEmpresaId:  empresaId,
          origemSetorId:    p.setor_id ?? null,
          origemEquipeId:   p.equipe_id ?? null,
          destinoEmpresaId: empresaDestino,
          destinoSetorId:   destinoSetor,
        },
        levarAcordos,
        executadoPorId: perfilAtual?.id ?? null,
      });
      if (r.status === 'falha') { falhas.push(`${p.nome}: ${r.mensagem}`); continue; }
      ok++;
      apagados += r.acordosApagados;
      movidos  += r.acordosMovidos;
      if (r.avisoRegistro) toast.warning(`${p.nome} — ${r.avisoRegistro}`, { duration: 12000 });
    }

    if (ok > 0) {
      const partes = [ok === 1 ? '1 usuário transferido.' : `${ok} usuários transferidos.`];
      if (apagados > 0) {
        partes.push(`${apagados.toLocaleString('pt-BR')} tabulações apagadas (relatórios baixados).`);
      }
      if (movidos > 0) partes.push(`${movidos.toLocaleString('pt-BR')} tabulações foram junto.`);
      partes.push('O recebimento continua na equipe de origem até a liderança tirar.');
      toast.success(partes.join(' '), { duration: 9000 });
    }
    // Falha de uma pessoa não some no meio de um "sucesso" agregado.
    for (const f of falhas) toast.error(f, { duration: 12000 });

    setSalvando(false);
    if (ok > 0) onConcluida();
  }, [alvos, destinoSetor, destinoEmpresa, empresaId, levarAcordos, perfilAtual?.id, onConcluida]);

  return (
    <Dialog open={!!alvos} onOpenChange={o => { if (!o && !salvando) onFechar(); }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" aria-describedby="modal-transferir-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-primary" />
            Transferir {trocaDeEmpresa ? 'de empresa' : 'de setor'}
          </DialogTitle>
          <DialogDescription id="modal-transferir-desc" className="text-xs">
            {alvos && alvos.length === 1 ? (
              <>Escolha o destino de <strong>{alvos[0].nome}</strong>.</>
            ) : (
              <>Escolha o destino de <strong>{alvos?.length ?? 0} usuários</strong>.</>
            )}
          </DialogDescription>
        </DialogHeader>

        {alvos && alvos.length > 1 && (
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto -mt-1">
            {alvos.map(t => (
              <span key={t.id} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-foreground/80">
                {t.nome}
              </span>
            ))}
          </div>
        )}

        <div className="space-y-3 py-2">
          {podeTrocarEmpresa && empresas.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Empresa</Label>
              <Select
                value={destinoEmpresa}
                onValueChange={v => {
                  setDestinoEmpresa(v);
                  // O setor escolhido pertence à empresa anterior — mantê-lo
                  // gravaria um setor de outra empresa no perfil.
                  setDestinoSetor('');
                }}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione a empresa..." /></SelectTrigger>
                <SelectContent>
                  {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">
              Novo setor <span className="text-destructive">*</span>
            </Label>
            <Select value={destinoSetor} onValueChange={setDestinoSetor} disabled={carregandoDestino}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={carregandoDestino ? 'Carregando setores…' : 'Selecione o setor...'} />
              </SelectTrigger>
              <SelectContent>
                {setoresDestino.length === 0 ? (
                  <SelectItem value="__none__" disabled>Nenhum setor nesta empresa</SelectItem>
                ) : (
                  setoresDestino
                    // Esconde o setor de origem só quando TODOS os selecionados
                    // já estão nele — e só faz sentido na mesma empresa.
                    .filter(s => trocaDeEmpresa || !(alvos && alvos.every(t => t.setor_id === s.id)))
                    .map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.nome}{!s.ativo && ' (inativo)'}</SelectItem>
                    ))
                )}
              </SelectContent>
            </Select>
            {/* Setor é obrigatório: sem ele a pessoa some de todo painel escopado
                por setor, e é um estado que ninguém escolhe de propósito. */}
            {!destinoSetor && (
              <p className="text-[11px] text-muted-foreground">
                Escolha um setor de destino para continuar.
              </p>
            )}
          </div>

          {/* A escolha do destino das tabulações. Só troca de setor a tem. */}
          {!trocaDeEmpresa ? (
            <div className="space-y-1.5">
              <Label className="text-xs">As tabulações deles</Label>
              <button
                type="button" role="radio" aria-checked={!levarAcordos}
                onClick={() => setLevarAcordos(false)}
                className={cn(
                  'w-full text-left rounded-md border p-2.5 transition-colors',
                  !levarAcordos ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                )}
              >
                <span className={cn('block text-sm font-medium', !levarAcordos && 'text-primary')}>
                  Chegar limpo
                </span>
                <span className="block text-[11px] text-muted-foreground leading-snug">
                  Baixa o relatório das tabulações e apaga o histórico. Os NRs voltam
                  a ficar livres para outros tabularem. Um arquivo por pessoa.
                </span>
              </button>
              <button
                type="button" role="radio" aria-checked={levarAcordos}
                onClick={() => setLevarAcordos(true)}
                className={cn(
                  'w-full text-left rounded-md border p-2.5 transition-colors',
                  levarAcordos ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                )}
              >
                <span className={cn('block text-sm font-medium', levarAcordos && 'text-primary')}>
                  Levar as tabulações junto
                </span>
                <span className="block text-[11px] text-muted-foreground leading-snug">
                  As tabulações mudam de setor com eles e os vínculos continuam de pé.
                  Nada é apagado. Use só quando o setor mudou de nome na prática.
                </span>
              </button>
            </div>
          ) : (
            <p className="text-[11px] rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
              Troca de empresa é sempre limpa: o relatório das tabulações é baixado e
              o histórico apagado. Tabulação não muda de empresa — são cadastros de
              clientes de CNPJs diferentes.
            </p>
          )}

          <p className="text-[11px] text-muted-foreground rounded-md border border-border bg-muted/30 p-2.5">
            Eles saem de qualquer equipe e dos vínculos de clone. O recebimento
            deste mês <strong>continua na equipe de origem</strong>, marcado como
            transferido, até a liderança de lá tirar. Dá para desfazer depois.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onFechar} disabled={salvando}>
            <X className="w-3.5 h-3.5 mr-1" /> Cancelar
          </Button>
          <Button size="sm" onClick={() => void transferir()} disabled={salvando || !destinoSetor} className="gap-2">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            {salvando
              ? 'Transferindo...'
              : alvos && alvos.length > 1 ? `Transferir ${alvos.length}` : 'Transferir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
