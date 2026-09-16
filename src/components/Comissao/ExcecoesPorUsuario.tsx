/**
 * ExcecoesPorUsuario — percentuais próprios para uma ou mais pessoas do setor.
 *
 * ## A ordem (pedido de 16/09/2026)
 *
 *   exceção por usuário  >  exceção da equipe  >  padrão do setor
 *
 * Quem está aqui não usa nem o % da equipe nem o do setor. A regra de quando o
 * setor bate a meta continua a do padrão, como na exceção de equipe.
 *
 * ## Um grupo, várias pessoas
 *
 * «Se eu quiser um percentual diferente só para seis pessoas, seleciono as
 * seis.» As seis viram UMA exceção: um ajuste de % vale para as seis de uma vez.
 * Cada pessoa está em no máximo uma exceção por mês — o seletor mostra quem já
 * está em outra, e o banco recusa se duas telas tentarem ao mesmo tempo.
 *
 * Criar copia os percentuais do padrão, como a exceção de equipe: o ponto de
 * partida é o que a pessoa já recebia.
 */
import { useMemo, useState } from 'react';
import { Undo2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ConfigComissao, RegraSetor } from '@/services/comissao/comissao';
import { salvarConfig } from '@/services/comissao/comissao.service';
import { resumoDeNomes } from './bonusTexto';
import { FormConfigComissao } from './FormConfigComissao';
import { payloadDe, rascunhoParaExcecao, type AlvoConfig } from './rascunhoConfig';
import { SeletorPessoas, type PessoaSelecionavel } from './SeletorPessoas';

interface ExcecoesPorUsuarioProps {
  empresaId: string;
  setorId: string;
  ano: number;
  mes: number;
  isPaguePlay: boolean;
  padrao: ConfigComissao;
  grupos: ConfigComissao[];
  /** As pessoas do setor em tela. */
  pessoas: PessoaSelecionavel[];
  bloqueado: boolean;
  onMudou: () => void;
  /** Pede a confirmação de «voltar ao padrão» — o diálogo mora na aba. */
  onRemover: (grupo: ConfigComissao) => void;
}

function PessoasDoGrupo({ grupo, pessoas, ocupadas, alvo, bloqueado, onMudou }: {
  grupo: ConfigComissao;
  pessoas: PessoaSelecionavel[];
  /** Quem está em OUTRA exceção. */
  ocupadas: ReadonlySet<string>;
  alvo: AlvoConfig;
  bloqueado: boolean;
  onMudou: () => void;
}) {
  const [ids, setIds] = useState<string[]>(grupo.usuarioIds);
  const [salvando, setSalvando] = useState(false);
  const mudou = [...ids].sort().join(',') !== [...grupo.usuarioIds].sort().join(',');

  const opcoes = useMemo(() => pessoas.map(p => ({
    ...p,
    bloqueio: ocupadas.has(p.id) ? 'já em outra exceção' : null,
  })), [pessoas, ocupadas]);

  async function salvarPessoas() {
    if (ids.length === 0) {
      toast.warning('A exceção precisa de ao menos uma pessoa. Para desfazer, use «Voltar ao padrão».');
      return;
    }
    const payload = payloadDe(rascunhoParaExcecao(grupo), alvo);
    if (!payload) return;
    setSalvando(true);
    const r = await salvarConfig({ ...payload, usuarios: ids });
    setSalvando(false);
    if (!r.ok) {
      toast.error('As pessoas da exceção não foram salvas', { description: r.erro });
      return;
    }
    toast.success('Pessoas da exceção atualizadas.');
    onMudou();
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold">Pessoas nesta exceção</p>
      <SeletorPessoas
        rotulo="Pessoas da exceção"
        pessoas={opcoes}
        selecionadas={ids}
        onMudar={setIds}
        desabilitado={bloqueado}
        placeholder="Pesquisar para incluir ou tirar…"
      />
      {mudou && !bloqueado && (
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" className="h-7 text-xs" disabled={salvando} onClick={() => void salvarPessoas()}>
            Salvar pessoas
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setIds(grupo.usuarioIds)}>
            Desfazer
          </Button>
        </div>
      )}
    </div>
  );
}

export function ExcecoesPorUsuario({
  empresaId, setorId, ano, mes, isPaguePlay, padrao, grupos, pessoas, bloqueado, onMudou, onRemover,
}: ExcecoesPorUsuarioProps) {
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [criando, setCriando] = useState(false);

  const nomeDe = useMemo(() => new Map(pessoas.map(p => [p.id, p.nome])), [pessoas]);
  const grupoDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of grupos) for (const id of g.usuarioIds) m.set(id, g.id);
    return m;
  }, [grupos]);

  const opcoesNovas = useMemo(() => pessoas.map(p => ({
    ...p,
    bloqueio: grupoDe.has(p.id) ? 'já tem exceção' : null,
  })), [pessoas, grupoDe]);

  const alvoDe = (grupo: ConfigComissao | null): AlvoConfig => ({
    id: grupo?.id ?? null, empresaId, setorId, equipeId: null, grupoUsuarios: true, ano, mes,
  });

  async function criar() {
    if (escolhidas.length === 0) return;
    const payload = payloadDe(rascunhoParaExcecao(padrao), alvoDe(null));
    if (!payload) {
      toast.warning('Complete os percentuais do padrão antes de criar uma exceção.');
      return;
    }
    setCriando(true);
    const r = await salvarConfig({ ...payload, usuarios: escolhidas });
    setCriando(false);
    if (!r.ok) {
      toast.error('A exceção não foi criada', { description: r.erro });
      return;
    }
    toast.success(
      `Exceção criada para ${escolhidas.length === 1 ? nomeDe.get(escolhidas[0]) : `${escolhidas.length} pessoas`} com os percentuais do padrão. Ajuste abaixo.`,
    );
    setEscolhidas([]);
    onMudou();
  }

  const regraDoSetor: RegraSetor = padrao.regraSetor;

  return (
    <div className="space-y-3">
      {grupos.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhuma pessoa com percentual próprio neste mês.</p>
      )}

      {grupos.map(g => {
        const ocupadas = new Set([...grupoDe.entries()].filter(([, gid]) => gid !== g.id).map(([id]) => id));
        return (
          <details key={g.id} className="group rounded-lg border border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium">
              <span className="flex min-w-0 items-center gap-2">
                <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{resumoDeNomes(g.usuarioIds, nomeDe)}</span>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {g.usuarioIds.length === 1 ? '1 pessoa' : `${g.usuarioIds.length} pessoas`}
                </Badge>
              </span>
              {!bloqueado && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 gap-1 text-xs text-muted-foreground"
                  onClick={e => { e.preventDefault(); onRemover(g); }}
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Voltar ao padrão
                </Button>
              )}
            </summary>
            <div className="space-y-4 border-t border-border px-3 py-3">
              <PessoasDoGrupo
                key={g.usuarioIds.join(',')}
                grupo={g}
                pessoas={pessoas}
                ocupadas={ocupadas}
                alvo={alvoDe(g)}
                bloqueado={bloqueado}
                onMudou={onMudou}
              />
              <FormConfigComissao
                key={g.id}
                config={g}
                alvo={alvoDe(g)}
                ehPadrao={false}
                isPaguePlay={isPaguePlay}
                regraDoSetor={regraDoSetor}
                desabilitado={bloqueado}
                onSalvo={onMudou}
              />
            </div>
          </details>
        );
      })}

      {!bloqueado && (
        <div className="space-y-2 rounded-lg border border-dashed border-border px-3 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Nova exceção por usuário
          </p>
          <SeletorPessoas
            rotulo="Pessoas para a nova exceção"
            pessoas={opcoesNovas}
            selecionadas={escolhidas}
            onMudar={setEscolhidas}
          />
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            disabled={escolhidas.length === 0 || criando}
            onClick={() => void criar()}
          >
            {escolhidas.length > 1 ? `Criar exceção para ${escolhidas.length} pessoas` : 'Criar exceção'}
          </Button>
        </div>
      )}
    </div>
  );
}
