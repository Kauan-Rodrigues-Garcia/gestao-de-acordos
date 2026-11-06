/**
 * FormManifestacao — registrar ou editar uma manifestação da ouvidoria.
 *
 * Três blocos, na ordem da ligação: quem é o profissional, o que ele relatou e
 * a tratativa. O interruptor «Acompanhar» decide se o caso entra na fila de
 * acompanhamento (com status e retorno) ou fica só como histórico.
 *
 * O código do cliente é o mesmo «Código» do acordo na regra Cofen: só números,
 * e nunca um CPF (o banco também recusa). Texto livre com CPF dentro é
 * recusado, como no resto do sistema.
 */
import { useMemo, useState } from 'react';
import { ClipboardList, Loader2, MessageSquareWarning, Plus, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { AvatarChat } from '@/components/Chat/comum';
import { DatePickerField } from '@/components/DatePickerField';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ERRO_CPF_NO_CODIGO, contemCpf, ehCpf } from '@/lib/cpf';
import { getTodayISO } from '@/lib/index';
import { propsSoNumeros } from '@/lib/soNumeros';
import { cn } from '@/lib/utils';
import { salvarManifestacao, type DadosManifestacao } from '@/services/ouvidoriaCofen.service';
import {
  ASSUNTOS, CANAIS, SITUACOES, STATUS,
  type Assunto, type Canal, type Manifestacao, type PessoaOuvidoria, type SituacaoFinanceira, type Status,
} from './ouvidoria';
import { CampoLista, SeletorCoren } from './campos';
import { COR_FAIXA_STATUS } from './estilo';
import { IconeCanal, TituloSecao } from './visual';

/** O botão do calendário com a altura e os cantos dos outros campos. */
const CLASSE_DATA = 'h-10 rounded-lg font-sans text-sm';
/** Campos de texto com os cantos das listas e do calendário. */
const CANTOS = 'rounded-lg';

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  setorId: string;
  /** `null` = nova. */
  manifestacao: Manifestacao | null;
  atendentes: PessoaOuvidoria[];
  aoSalvar: (m: Manifestacao) => void;
}

interface Estado {
  data_manifestacao: string;
  canal: Canal | '';
  nome_profissional: string;
  codigo_cliente: string;
  conselho_uf: string;
  assunto: Assunto | '';
  descricao: string;
  anuidades: number[];
  situacao_financeira: SituacaoFinanceira | '';
  providencia: string;
  responsavel_id: string;
  data_resposta: string;
  status: Status;
  acompanhar: boolean;
  observacoes: string;
}

function estadoInicial(m: Manifestacao | null, hoje: string): Estado {
  if (!m) {
    return {
      data_manifestacao: hoje, canal: 'telefone', nome_profissional: '', codigo_cliente: '', conselho_uf: '',
      assunto: '', descricao: '', anuidades: [], situacao_financeira: '', providencia: '',
      responsavel_id: '', data_resposta: '', status: 'aberto', acompanhar: true, observacoes: '',
    };
  }
  return {
    data_manifestacao: m.data_manifestacao, canal: m.canal, nome_profissional: m.nome_profissional,
    codigo_cliente: m.codigo_cliente ?? '', conselho_uf: m.conselho_uf ?? '', assunto: m.assunto, descricao: m.descricao,
    anuidades: [...m.anuidades], situacao_financeira: m.situacao_financeira ?? '',
    providencia: m.providencia ?? '', responsavel_id: m.responsavel_id ?? '',
    data_resposta: m.data_resposta ?? '', status: m.status, acompanhar: m.acompanhar,
    observacoes: m.observacoes ?? '',
  };
}

const CAMPOS_LIVRES: { campo: keyof Estado; nome: string }[] = [
  { campo: 'nome_profissional', nome: 'nome' },
  { campo: 'descricao', nome: 'descrição' },
  { campo: 'providencia', nome: 'providência' },
  { campo: 'observacoes', nome: 'observações' },
];

export function FormManifestacao({ aberto, aoFechar, setorId, manifestacao, atendentes, aoSalvar }: Props) {
  const hoje = getTodayISO();
  const [e, setE] = useState<Estado>(() => estadoInicial(manifestacao, hoje));
  const [salvando, setSalvando] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [outroAno, setOutroAno] = useState('');

  const set = <K extends keyof Estado>(k: K, v: Estado[K]) => setE(s => ({ ...s, [k]: v }));
  const anoAtual = +hoje.slice(0, 4);
  const anosRapidos = useMemo(() => Array.from({ length: 8 }, (_, i) => anoAtual - i), [anoAtual]);

  const erros = useMemo(() => {
    const r: Partial<Record<keyof Estado, string>> = {};
    if (!e.nome_profissional.trim()) r.nome_profissional = 'Informe o nome.';
    if (!e.canal) r.canal = 'Escolha o canal.';
    if (!e.assunto) r.assunto = 'Escolha o assunto.';
    if (!e.descricao.trim()) r.descricao = 'Descreva a reclamação.';
    if (!e.data_manifestacao) r.data_manifestacao = 'Informe a data.';
    else if (e.data_manifestacao > hoje) r.data_manifestacao = 'Não pode ser no futuro.';
    if (e.data_resposta && e.data_manifestacao && e.data_resposta < e.data_manifestacao) {
      r.data_resposta = 'Antes da manifestação.';
    }
    if (ehCpf(e.codigo_cliente)) r.codigo_cliente = ERRO_CPF_NO_CODIGO;
    for (const { campo, nome } of CAMPOS_LIVRES) {
      if (contemCpf(e[campo])) r[campo] = `Tem um CPF no campo ${nome}. CPF não pode ser gravado.`;
    }
    return r;
  }, [e, hoje]);

  const alternarAno = (ano: number) =>
    set('anuidades', e.anuidades.includes(ano)
      ? e.anuidades.filter(a => a !== ano)
      : [...e.anuidades, ano].sort((a, b) => a - b));

  const somarOutroAno = () => {
    const ano = Number(outroAno);
    if (!Number.isInteger(ano) || ano < 1990 || ano > anoAtual + 1) {
      toast.error('Ano inválido.');
      return;
    }
    if (!e.anuidades.includes(ano)) alternarAno(ano);
    setOutroAno('');
  };

  async function salvar() {
    setTentou(true);
    if (Object.keys(erros).length) {
      toast.error('Confira os campos destacados.');
      return;
    }
    const dados: DadosManifestacao = {
      data_manifestacao: e.data_manifestacao,
      canal: e.canal,
      nome_profissional: e.nome_profissional.trim(),
      codigo_cliente: e.codigo_cliente.replace(/\D/g, '') || null,
      conselho_uf: e.conselho_uf || null,
      assunto: e.assunto,
      descricao: e.descricao.trim(),
      anuidades: e.anuidades,
      situacao_financeira: e.situacao_financeira || null,
      providencia: e.providencia.trim() || null,
      responsavel_id: e.responsavel_id || null,
      data_resposta: e.data_resposta || null,
      status: e.status,
      acompanhar: e.acompanhar,
      observacoes: e.observacoes.trim() || null,
    };
    setSalvando(true);
    try {
      const salva = await salvarManifestacao(setorId, manifestacao?.id ?? null, dados);
      toast.success(manifestacao ? 'Manifestação atualizada.' : `Manifestação ${salva.codigo} registrada.`);
      aoSalvar(salva);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const erro = (k: keyof Estado) => (tentou ? erros[k] : undefined);
  const mostrarErro = (k: keyof Estado) =>
    erro(k) ? <p className="text-[11px] text-destructive mt-1">{erro(k)}</p> : null;
  const classeErro = (k: keyof Estado) => (erro(k) ? 'border-destructive focus-visible:ring-destructive' : '');

  // O responsável que já estava gravado continua na lista mesmo sem acesso hoje.
  const opcoesResponsavel = useMemo(() => {
    const lista = atendentes.filter(p => p.tem_acesso).map(p => ({ id: p.perfil_id, nome: p.nome, foto: p.foto_url as string | null }));
    if (manifestacao?.responsavel_id && !lista.some(p => p.id === manifestacao.responsavel_id)) {
      lista.push({ id: manifestacao.responsavel_id, nome: manifestacao.responsavel_nome ?? 'Responsável anterior', foto: null });
    }
    return lista.sort((a, b) => a.nome.localeCompare(b.nome));
  }, [atendentes, manifestacao]);

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o && !salvando) aoFechar(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b sticky top-0 bg-background z-10">
          <DialogTitle className="flex items-center gap-2">
            {manifestacao ? `Editar ${manifestacao.codigo}` : 'Nova manifestação'}
          </DialogTitle>
          <DialogDescription>
            {manifestacao
              ? `Registrada por ${manifestacao.criado_por_nome ?? '—'}.`
              : 'O código é gerado ao salvar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">
          {/* Acompanhar: a primeira decisão, porque muda o resto do formulário. */}
          <label className={cn(
            'flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors',
            e.acompanhar ? 'border-primary/40 bg-primary/5' : 'bg-muted/40',
          )}>
            <Switch
              checked={e.acompanhar}
              onCheckedChange={v => setE(s => ({
                ...s, acompanhar: v,
                // Só histórico nasce concluída; voltar a acompanhar reabre.
                status: manifestacao ? s.status : (v ? 'aberto' : 'concluido'),
              }))}
              className="mt-0.5"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Acompanhar esta manifestação</p>
              <p className="text-xs text-muted-foreground">
                {e.acompanhar
                  ? 'Entra na fila de acompanhamento: status, retorno ao profissional e linha do tempo.'
                  : 'Fica só no histórico, sem pendência na fila.'}
              </p>
            </div>
          </label>

          <section className="space-y-3">
            <TituloSecao icone={UserRound}>Profissional</TituloSecao>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <div className="sm:col-span-6">
                <Label htmlFor="ouv-nome" className="mb-1.5 block">Nome completo *</Label>
                <Input id="ouv-nome" autoFocus value={e.nome_profissional}
                       onChange={ev => set('nome_profissional', ev.target.value)} className={cn(CANTOS, classeErro('nome_profissional'))} />
                {mostrarErro('nome_profissional')}
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="ouv-codigo" className="mb-1.5 block">Código do cliente</Label>
                <Input id="ouv-codigo" value={e.codigo_cliente} placeholder="Código"
                       {...propsSoNumeros(v => set('codigo_cliente', v), 'Código do cliente')}
                       className={cn('font-mono', CANTOS, classeErro('codigo_cliente'))} />
                {erro('codigo_cliente') ? mostrarErro('codigo_cliente') : (
                  <p className="text-[11px] text-muted-foreground mt-1">O mesmo código usado no acordo.</p>
                )}
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="ouv-coren" className="mb-1.5 block">Conselho Regional</Label>
                <SeletorCoren id="ouv-coren" valor={e.conselho_uf} aoMudar={uf => set('conselho_uf', uf)} />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <TituloSecao icone={MessageSquareWarning}>Manifestação</TituloSecao>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <div className="sm:col-span-2">
                <Label htmlFor="ouv-data" className="mb-1.5 block">Data *</Label>
                <DatePickerField value={e.data_manifestacao} maxDate={hoje} size="md"
                                 onChange={v => set('data_manifestacao', v)}
                                 triggerClassName={cn(CLASSE_DATA, classeErro('data_manifestacao'))} />
                {mostrarErro('data_manifestacao')}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="ouv-canal" className="mb-1.5 block">Canal de atendimento *</Label>
                <CampoLista id="ouv-canal" valor={e.canal} invalido={!!erro('canal')}
                            aoMudar={v => set('canal', v as Canal)}
                            opcoes={CANAIS.map(c => ({ valor: c.valor, rotulo: c.rotulo, marca: <IconeCanal canal={c.valor} /> }))} />
                {mostrarErro('canal')}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="ouv-situacao" className="mb-1.5 block">Situação financeira</Label>
                <CampoLista id="ouv-situacao" valor={e.situacao_financeira} vazio="Não informada"
                            aoMudar={v => set('situacao_financeira', v as SituacaoFinanceira)}
                            opcoes={SITUACOES.map(s => ({ valor: s.valor, rotulo: s.rotulo }))} />
              </div>

              <div className="sm:col-span-6">
                <Label className="mb-1.5 block">Assunto *</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {ASSUNTOS.map(a => (
                    <button key={a.valor} type="button" onClick={() => set('assunto', a.valor)}
                            className={cn(
                              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                              e.assunto === a.valor
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'hover:bg-muted',
                              erro('assunto') && e.assunto !== a.valor && 'border-destructive/50',
                            )}>
                      {a.rotulo}
                    </button>
                  ))}
                </div>
                {mostrarErro('assunto')}
              </div>

              <div className="sm:col-span-6">
                <Label htmlFor="ouv-descricao" className="mb-1.5 block">Descrição da reclamação *</Label>
                <Textarea id="ouv-descricao" rows={4} placeholder="Relato resumido do profissional"
                          value={e.descricao} onChange={ev => set('descricao', ev.target.value)}
                          className={cn(CANTOS, classeErro('descricao'))} />
                {mostrarErro('descricao')}
              </div>

              <div className="sm:col-span-6">
                <Label className="mb-1.5 block">Anuidade(s) envolvida(s)</Label>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {[...new Set([...anosRapidos, ...e.anuidades])].sort((a, b) => b - a).map(ano => (
                    <button key={ano} type="button" onClick={() => alternarAno(ano)}
                            className={cn(
                              'rounded-lg border px-2.5 py-1 text-xs font-mono tabular-nums transition-colors',
                              e.anuidades.includes(ano)
                                ? 'border-primary bg-primary/10 text-primary font-semibold'
                                : 'hover:bg-muted text-muted-foreground',
                            )}>
                      {ano}
                    </button>
                  ))}
                  <div className="flex items-center gap-1">
                    <Input value={outroAno} onChange={ev => setOutroAno(ev.target.value.replace(/\D/g, '').slice(0, 4))}
                           onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); somarOutroAno(); } }}
                           placeholder="Outro" inputMode="numeric" className="h-7 w-20 text-xs rounded-md" />
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={somarOutroAno}
                            disabled={outroAno.length !== 4} aria-label="Somar ano">
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {e.anuidades.length > 0 && (
                    <button type="button" onClick={() => set('anuidades', [])}
                            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
                      <X className="h-3 w-3" /> limpar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <TituloSecao icone={ClipboardList}>Tratativa</TituloSecao>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <div className="sm:col-span-2">
                <Label htmlFor="ouv-status" className="mb-1.5 block">Status</Label>
                <CampoLista id="ouv-status" valor={e.status} aoMudar={v => set('status', v as Status)}
                            opcoes={STATUS.map(s => ({
                              valor: s.valor, rotulo: s.rotulo,
                              marca: <span className={cn('h-2 w-2 rounded-full shrink-0', COR_FAIXA_STATUS[s.valor])} />,
                            }))} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="ouv-resp" className="mb-1.5 block">Responsável pela análise</Label>
                <CampoLista id="ouv-resp" valor={e.responsavel_id} vazio="Ninguém ainda"
                            aoMudar={v => set('responsavel_id', v)}
                            opcoes={opcoesResponsavel.map(p => ({
                              valor: p.id, rotulo: p.nome, marca: <AvatarChat nome={p.nome} foto={p.foto} tamanho={20} />,
                            }))} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="ouv-resposta" className="mb-1.5 block">Data da resposta</Label>
                <div className="flex gap-1.5">
                  <div className="flex-1 min-w-0">
                    <DatePickerField value={e.data_resposta} minDate={e.data_manifestacao} maxDate={hoje} size="md"
                                     placeholder="Sem retorno ainda" onChange={v => set('data_resposta', v)}
                                     triggerClassName={cn(CLASSE_DATA, classeErro('data_resposta'))} />
                  </div>
                  {e.data_resposta ? (
                    <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-lg"
                            onClick={() => set('data_resposta', '')} aria-label="Tirar a data da resposta">
                      <X className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" className="h-10 shrink-0 rounded-lg"
                            onClick={() => set('data_resposta', hoje)}>
                      Hoje
                    </Button>
                  )}
                </div>
                {erro('data_resposta') ? mostrarErro('data_resposta') : (
                  <p className="text-[11px] text-muted-foreground mt-1">Quando o profissional teve retorno.</p>
                )}
              </div>
              <div className="sm:col-span-6">
                <Label htmlFor="ouv-providencia" className="mb-1.5 block">Providência adotada</Label>
                <Textarea id="ouv-providencia" rows={3} placeholder="Medidas tomadas para tratar a demanda"
                          value={e.providencia} onChange={ev => set('providencia', ev.target.value)}
                          className={cn(CANTOS, classeErro('providencia'))} />
                {mostrarErro('providencia')}
              </div>
              <div className="sm:col-span-6">
                <Label htmlFor="ouv-obs" className="mb-1.5 block">Observações</Label>
                <Textarea id="ouv-obs" rows={2} placeholder="Informações complementares"
                          value={e.observacoes} onChange={ev => set('observacoes', ev.target.value)}
                          className={cn(CANTOS, classeErro('observacoes'))} />
                {mostrarErro('observacoes')}
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="px-6 py-4 border-t sticky bottom-0 bg-background">
          <Button variant="ghost" onClick={aoFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            {manifestacao ? 'Salvar alterações' : 'Registrar manifestação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
