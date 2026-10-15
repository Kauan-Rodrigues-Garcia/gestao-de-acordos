/**
 * SecaoQuem — etapa 1: para quem é a festa, e quem vai vê-la.
 *
 * As regras de plateia são as de sempre (`REGRAS-DE-NEGOCIO.md` §13.4-b):
 * pessoas → o setor de cada uma; equipe → o setor da equipe; setor → a
 * empresa inteira, com o volume travado.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MAX_HOMENAGEADOS, type AlvoTipo } from '@/services/comemoracoes.service';
import { VOLUME_SETOR } from '@/pages/Comemoracoes/volume';
import { Opcoes } from './Etapa';
import { TITULO_PADRAO, type Rascunho } from './rascunho';
import type { DadosEstudio, MudarRascunho, PessoaEstudio } from './tipos';

const ALVOS: readonly { id: AlvoTipo; nome: string }[] = [
  { id: 'operadores', nome: 'Pessoas' },
  { id: 'equipe',     nome: 'Equipe' },
  { id: 'setor',      nome: 'Setor' },
];

function Inicial({ p, tamanho = 'h-6 w-6' }: { p: { nome: string; foto_url: string | null }; tamanho?: string }) {
  return (
    <Avatar className={tamanho}>
      {p.foto_url && <AvatarImage src={p.foto_url} alt="" className="object-cover" />}
      <AvatarFallback className="bg-primary/10 text-[10px] font-bold">{p.nome.charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

export function SecaoQuem({ r, mudar, dados }: { r: Rascunho; mudar: MudarRascunho; dados: DadosEstudio }) {
  const [busca, setBusca] = useState('');

  const sugestoes = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    if (!termo) return [];
    const ja = new Set(r.escolhidos.map((p) => p.id));
    return dados.pessoas
      .filter((p) => !ja.has(p.id) && p.nome.toLocaleLowerCase('pt-BR').includes(termo))
      .slice(0, 6);
  }, [busca, dados.pessoas, r.escolhidos]);

  function adicionar(p: PessoaEstudio) {
    if (r.escolhidos.length >= MAX_HOMENAGEADOS) {
      toast.error(`São no máximo ${MAX_HOMENAGEADOS} pessoas por comemoração.`);
      return;
    }
    mudar((atual) => ({ escolhidos: [...atual.escolhidos, { id: p.id, nome: p.nome, foto_url: p.foto_url }] }));
    setBusca('');
  }

  /**
   * Escolher a equipe ou o setor sugere o título. Sugestão, não trava: o
   * campo continua editável na etapa seguinte.
   */
  function escolherAlvo(tipo: AlvoTipo, equipeId = r.equipeId, setorId = r.setorId) {
    const nomeEquipe = dados.equipes.find((e) => e.id === equipeId)?.nome;
    const nomeSetor  = dados.setores.find((s) => s.id === setorId)?.nome;
    const titulo =
      tipo === 'equipe' && nomeEquipe ? `Equipe ${nomeEquipe} bateu a meta!`
      : tipo === 'setor' && nomeSetor ? `Setor ${nomeSetor} bateu a meta!`
      : tipo === 'operadores' && r.alvoTipo !== 'operadores' ? TITULO_PADRAO
      : r.titulo;
    mudar({
      alvoTipo: tipo,
      equipeId: tipo === 'equipe' ? equipeId : '',
      setorId:  tipo === 'setor'  ? setorId  : '',
      titulo:   titulo.slice(0, 48),
      somenteEquipe: tipo === 'setor' ? false : r.somenteEquipe,
    });
  }

  return (
    <>
      <Opcoes rotulo="A festa é de" opcoes={ALVOS} valor={r.alvoTipo} colunas={3}
        onEscolher={(t) => escolherAlvo(t)} />

      {r.alvoTipo === 'operadores' && (
        <div className="space-y-2">
          {r.escolhidos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {r.escolhidos.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 py-0.5 pl-0.5 pr-2 text-xs">
                  <Inicial p={p} />
                  {p.nome.split(' ')[0]}
                  <button type="button" aria-label={`Tirar ${p.nome}`}
                    onClick={() => mudar((a) => ({ escolhidos: a.escolhidos.filter((x) => x.id !== p.id) }))}
                    className="rounded-full text-muted-foreground hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)}
              className="h-9 pl-9 text-sm" placeholder="Buscar pelo nome…"
              aria-label="Buscar pessoa" />
            {sugestoes.length > 0 && (
              <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                {sugestoes.map((p) => (
                  <button key={p.id} type="button" onClick={() => adicionar(p)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent">
                    <Inicial p={p} />
                    <span className="truncate">{p.nome}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {r.escolhidos.length}/{MAX_HOMENAGEADOS} pessoas. Quem trabalha em dois setores gera uma pergunta na hora de enviar.
          </p>
        </div>
      )}

      {r.alvoTipo === 'equipe' && (
        <Select value={r.equipeId} onValueChange={(v) => escolherAlvo('equipe', v)}>
          <SelectTrigger className="h-9 text-sm" aria-label="Equipe"><SelectValue placeholder="Escolha a equipe…" /></SelectTrigger>
          <SelectContent>
            {dados.equipes.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {r.alvoTipo === 'setor' && (
        <>
          <Select value={r.setorId} onValueChange={(v) => escolherAlvo('setor', r.equipeId, v)}>
            <SelectTrigger className="h-9 text-sm" aria-label="Setor"><SelectValue placeholder="Escolha o setor…" /></SelectTrigger>
            <SelectContent>
              {dados.setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-200">
              Meta de setor aparece para <strong>a empresa inteira</strong>, em todos os setores.
              O volume fica travado em {VOLUME_SETOR}%.
            </p>
          </div>
        </>
      )}

      {r.alvoTipo !== 'setor' && (
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
          <span>
            <span className="block text-xs font-medium">Só a equipe vê</span>
            <span className="block text-[11px] text-muted-foreground">
              Desligado, o setor inteiro vê.
            </span>
          </span>
          <Switch checked={r.somenteEquipe} onCheckedChange={(v) => mudar({ somenteEquipe: v })} />
        </label>
      )}
    </>
  );
}
