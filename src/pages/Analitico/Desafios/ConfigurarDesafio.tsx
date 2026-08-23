/**
 * ConfigurarDesafio — a janela de configuração da campanha.
 *
 * ## O que ela é, e o que ela não é
 *
 * É um formulário: nome, prêmio, modelo, período, modo de disputa, metas,
 * critério e as duas chaves de animação. Não é um editor de página — não há
 * arrastar card, escolher fonte nem definir largura. O desenho continua sendo
 * do sistema; o que se configura aqui é a GINCANA.
 *
 * ## A permissão
 *
 * O botão que abre esta janela só aparece com `desafios_configurar`, e a RLS de
 * `public.desafios` exige a mesma chave. Esconder o botão é conveniência; quem
 * recusa a gravação é o banco.
 *
 * ## O período não conhece mês
 *
 * Duas datas soltas. Uma campanha de 27/08 a 05/09 é gravada e lida como
 * qualquer outra: quem soma é `fn_desafio_dados`, com um `BETWEEN` sobre
 * `data_pagamento`.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { parseBRL } from '@/lib/money';
import { MODELOS_DESAFIO, modeloDoTipo } from '@/services/desafios/tiposDesafio';
import {
  atualizarDesafio, criarDesafio, type DadosGravacaoDesafio,
} from '@/services/desafios/desafios.service';
import type {
  CriterioRanking, Desafio, EscopoDisputa, Premiacao, StatusDesafio,
  TemaDesafio, TipoDesafio,
} from '@/services/desafios/types';
import { hojeISO } from './tema';

const CRITERIOS: { valor: CriterioRanking; rotulo: string }[] = [
  { valor: 'menor_falta',      rotulo: 'Mais perto da meta' },
  { valor: 'maior_recebido',   rotulo: 'Maior valor recebido' },
  { valor: 'maior_percentual', rotulo: 'Maior percentual da meta' },
];

const TEMAS: { valor: TemaDesafio; rotulo: string }[] = [
  { valor: 'padrao',  rotulo: 'Padrão' },
  { valor: 'cafe',    rotulo: 'Café' },
  { valor: 'corrida', rotulo: 'Corrida' },
  { valor: 'equipes', rotulo: 'Equipes' },
];

const STATUS: { valor: StatusDesafio; rotulo: string }[] = [
  { valor: 'rascunho',  rotulo: 'Rascunho' },
  { valor: 'ativo',     rotulo: 'Ativo' },
  { valor: 'encerrado', rotulo: 'Encerrado' },
];

const ESCOPOS: { valor: EscopoDisputa; rotulo: string }[] = [
  { valor: 'empresa', rotulo: 'Toda a empresa' },
  { valor: 'setor',   rotulo: 'Apenas o setor' },
];

const PREMIACOES: { valor: Premiacao; rotulo: string }[] = [
  { valor: 'todos_que_batem', rotulo: 'Todos que alcançarem a meta' },
  { valor: 'melhor_colocado', rotulo: 'Somente o primeiro colocado' },
];

/**
 * Metas por operador em texto: uma linha por pessoa, `login = valor`.
 *
 * É um `textarea` e não 27 campos porque as metas chegam de planilha e são
 * coladas em bloco. `#` abre comentário — dá para deixar anotado por que
 * alguém saiu da lista sem apagar a linha.
 */
function metasParaTexto(mapa: Record<string, number>): string {
  return Object.entries(mapa)
    .map(([chave, valor]) => `${chave} = ${valor.toFixed(2).replace('.', ',')}`)
    .join('\n');
}

function textoParaMetas(texto: string): Record<string, number> {
  const saida: Record<string, number> = {};
  for (const bruta of texto.split('\n')) {
    const linha = bruta.split('#')[0].trim();
    if (!linha) continue;
    // Separador `=` ou `:`; o resto da linha é o valor, que pode vir com
    // "R$" e ponto de milhar — é o formato que sai da planilha.
    const partes = linha.split(/\s*[=:]\s*/);
    if (partes.length < 2) continue;
    const chave = partes[0].trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const valor = parseBRL(partes.slice(1).join('=').replace(/r\$/i, '').trim());
    if (chave && Number.isFinite(valor) && valor > 0) saida[chave] = valor;
  }
  return saida;
}

interface Formulario {
  nome: string;
  descricao: string;
  premio: string;
  dataInicio: string;
  dataFim: string;
  tipo: TipoDesafio;
  escopoDisputa: EscopoDisputa;
  premiacao: Premiacao;
  individual: boolean;
  equipe: boolean;
  metaIndividual: string;
  /** Uma linha por pessoa: `login = valor`. Ver `textoParaMetas`. */
  metasPorOperador: string;
  metaEquipe: string;
  metaColetiva: string;
  criterio: CriterioRanking;
  tema: TemaDesafio;
  mostrarFotos: boolean;
  animarUltrapassagem: boolean;
  comemorarMeta: boolean;
  status: StatusDesafio;
}

function formularioVazio(): Formulario {
  const hoje = hojeISO();
  return {
    nome: '', descricao: '', premio: '',
    dataInicio: hoje, dataFim: hoje,
    tipo: 'bater_meta',
    escopoDisputa: 'empresa', premiacao: 'melhor_colocado',
    individual: true, equipe: true,
    metaIndividual: '', metasPorOperador: '', metaEquipe: '', metaColetiva: '',
    criterio: 'menor_falta',
    tema: 'padrao',
    mostrarFotos: true, animarUltrapassagem: true, comemorarMeta: true,
    status: 'rascunho',
  };
}

function formularioDe(d: Desafio): Formulario {
  const emReais = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));
  return {
    nome: d.nome,
    descricao: d.descricao ?? '',
    premio: d.premio ?? '',
    dataInicio: d.dataInicio,
    dataFim: d.dataFim,
    tipo: d.tipo,
    escopoDisputa: d.regra.escopoDisputa,
    premiacao: d.regra.premiacao,
    individual: d.regra.modo.includes('individual'),
    equipe:     d.regra.modo.includes('equipe'),
    metaIndividual: emReais(d.regra.metaIndividual),
    metasPorOperador: metasParaTexto(d.regra.metasPorOperador),
    metaEquipe:     emReais(d.regra.metaEquipe),
    metaColetiva:   emReais(d.regra.metaColetiva),
    criterio: d.regra.criterioRanking,
    tema: d.visual.tema,
    mostrarFotos: d.visual.mostrarFotos,
    animarUltrapassagem: d.visual.animarUltrapassagem,
    comemorarMeta: d.visual.comemorarMeta,
    status: d.status,
  };
}

/** `''` vira `null` — meta em branco é "este modelo não usa meta". */
function metaOuNulo(texto: string): number | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  const n = parseBRL(limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface Props {
  aberto: boolean;
  /** `null` = criando uma campanha nova. */
  desafio: Desafio | null;
  empresaId: string;
  autorId: string;
  autorNome: string;
  onFechar: () => void;
  onSalvo: () => void;
}

export function ConfigurarDesafio({
  aberto, desafio, empresaId, autorId, autorNome, onFechar, onSalvo,
}: Props) {
  const [form, setForm] = useState<Formulario>(formularioVazio);
  const [salvando, setSalvando] = useState(false);

  // Reabrir a janela para outra campanha precisa recarregar os campos; sem
  // isto, editar a segunda mostraria os valores da primeira.
  useEffect(() => {
    if (!aberto) return;
    setForm(desafio ? formularioDe(desafio) : formularioVazio());
  }, [aberto, desafio]);

  const modelo = useMemo(() => modeloDoTipo(form.tipo), [form.tipo]);

  function set<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setForm(f => ({ ...f, [campo]: valor }));
  }

  async function salvar() {
    if (!form.nome.trim()) { toast.error('O desafio precisa de um nome.'); return; }
    if (form.dataFim < form.dataInicio) {
      toast.error('A data final precisa ser igual ou posterior à data inicial.');
      return;
    }
    if (!form.individual && !form.equipe) {
      toast.error('Escolha ao menos um modo de disputa.');
      return;
    }

    const dados: DadosGravacaoDesafio = {
      nome: form.nome,
      descricao: form.descricao || null,
      premio: form.premio || null,
      dataInicio: form.dataInicio,
      dataFim: form.dataFim,
      tipo: form.tipo,
      regra: {
        versao: 1,
        metrica: 'valor_recebido',
        modo: [
          ...(form.individual ? ['individual' as const] : []),
          ...(form.equipe ? ['equipe' as const] : []),
        ],
        criterioRanking: form.criterio,
        escopoDisputa: form.escopoDisputa,
        premiacao: form.premiacao,
        metaIndividual: metaOuNulo(form.metaIndividual),
        metasPorOperador: textoParaMetas(form.metasPorOperador),
        metaEquipe:     metaOuNulo(form.metaEquipe),
        metaColetiva:   metaOuNulo(form.metaColetiva),
        // Recorte de participantes: por ora a campanha vale para quem o escopo
        // alcança. O campo existe na regra e é lido por `participaDaCampanha` —
        // uma tela de seleção entra aqui sem mexer no cálculo.
        participantes: desafio?.regra.participantes ?? { setores: [], equipes: [], operadores: [] },
      },
      visual: {
        tema: form.tema,
        icone: form.tema === 'cafe' ? 'coffee' : 'trophy',
        mostrarFotos: form.mostrarFotos,
        animarUltrapassagem: form.animarUltrapassagem,
        comemorarMeta: form.comemorarMeta,
      },
      status: form.status,
    };

    setSalvando(true);
    const { error } = desafio
      ? await atualizarDesafio({ desafioId: desafio.id, empresaId, autorId, dados })
      : await criarDesafio({ empresaId, autorId, autorNome, dados });
    setSalvando(false);

    if (error) { toast.error(error); return; }
    toast.success(desafio ? 'Desafio atualizado.' : 'Desafio criado.');
    onSalvo();
    onFechar();
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{desafio ? 'Editar desafio' : 'Novo desafio'}</DialogTitle>
          <DialogDescription>
            A campanha lê o recebimento do Analítico dentro do período escolhido.
            Nada aqui altera o Analítico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="desafio-nome">Nome</Label>
              <Input id="desafio-nome" value={form.nome}
                onChange={e => set('nome', e.target.value)} placeholder="Café no IBIS" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desafio-premio">Prêmio</Label>
              <Input id="desafio-premio" value={form.premio}
                onChange={e => set('premio', e.target.value)} placeholder="Café no IBIS" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desafio-descricao">Descrição</Label>
            <Textarea id="desafio-descricao" rows={2} value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
              placeholder="Quem chegar mais perto da meta leva o prêmio." />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="desafio-tipo">Tipo</Label>
              <select
                id="desafio-tipo"
                value={form.tipo}
                onChange={e => {
                  const tipo = e.target.value as TipoDesafio;
                  const m = modeloDoTipo(tipo);
                  // Trocar de modelo traz o padrão dele: critério e modo. As
                  // metas ficam — quem já digitou 20.000 não quer redigitar.
                  setForm(f => ({
                    ...f,
                    tipo,
                    criterio: m.criterioPadrao,
                    individual: m.modoPadrao.includes('individual'),
                    equipe:     m.modoPadrao.includes('equipe'),
                  }));
                }}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {MODELOS_DESAFIO.map(m => (
                  <option key={m.tipo} value={m.tipo}>{m.nome}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">{modelo.objetivo}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="desafio-criterio">Critério do ranking</Label>
              <select
                id="desafio-criterio"
                value={form.criterio}
                onChange={e => set('criterio', e.target.value as CriterioRanking)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {CRITERIOS.map(c => (
                  <option key={c.valor} value={c.valor}>{c.rotulo}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="desafio-inicio">Início</Label>
              <Input id="desafio-inicio" type="date" value={form.dataInicio}
                onChange={e => set('dataInicio', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desafio-fim">Fim</Label>
              <Input id="desafio-fim" type="date" value={form.dataFim}
                onChange={e => set('dataFim', e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="desafio-escopo">Contra quem se disputa</Label>
              <select
                id="desafio-escopo"
                value={form.escopoDisputa}
                onChange={e => set('escopoDisputa', e.target.value as EscopoDisputa)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {ESCOPOS.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
              <p className="text-[11px] text-muted-foreground">
                «Apenas o setor» dá a cada setor o próprio placar, em vez de um
                ranking único da empresa.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="desafio-premiacao">Quem leva o prêmio</Label>
              <select
                id="desafio-premiacao"
                value={form.premiacao}
                onChange={e => set('premiacao', e.target.value as Premiacao)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {PREMIACOES.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
              <p className="text-[11px] text-muted-foreground">
                É esta frase que o Hero anuncia — o critério acima só ordena a lista.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Disputa</Label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.individual}
                  onCheckedChange={v => set('individual', v)} /> Individual
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.equipe}
                  onCheckedChange={v => set('equipe', v)} /> Equipes
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="desafio-meta-ind">Meta individual (R$)</Label>
              <Input id="desafio-meta-ind" inputMode="decimal" value={form.metaIndividual}
                onChange={e => set('metaIndividual', e.target.value)} placeholder="20000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desafio-meta-eq">Meta por equipe (R$)</Label>
              <Input id="desafio-meta-eq" inputMode="decimal" value={form.metaEquipe}
                onChange={e => set('metaEquipe', e.target.value)} placeholder="80000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desafio-meta-col">Meta coletiva (R$)</Label>
              <Input id="desafio-meta-col" inputMode="decimal" value={form.metaColetiva}
                onChange={e => set('metaColetiva', e.target.value)} placeholder="—" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desafio-metas-op">Metas por operador</Label>
            <Textarea
              id="desafio-metas-op"
              rows={6}
              value={form.metasPorOperador}
              onChange={e => set('metasPorOperador', e.target.value)}
              className="font-mono text-xs"
              placeholder={'kauan_teixeira = 40857,14\nthiago_alves = 15714,29'}
            />
            <p className="text-[11px] text-muted-foreground">
              Uma linha por pessoa, <code>login = valor</code>. Preenchido, este
              campo passa a ser a LISTA de participantes: quem não estiver aqui
              fica fora do ranking. Vazio, todo mundo usa a meta individual acima.
              A meta de cada equipe vira a soma das metas de quem está nela.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="desafio-tema">Tema</Label>
              <select
                id="desafio-tema"
                value={form.tema}
                onChange={e => set('tema', e.target.value as TemaDesafio)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {TEMAS.map(t => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desafio-status">Status</Label>
              <select
                id="desafio-status"
                value={form.status}
                onChange={e => set('status', e.target.value as StatusDesafio)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {STATUS.map(s => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Só um desafio ativo aparece como campanha principal.
              </p>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <label className="flex items-center justify-between text-sm">
              Mostrar fotos
              <Switch checked={form.mostrarFotos} onCheckedChange={v => set('mostrarFotos', v)} />
            </label>
            <label className="flex items-center justify-between text-sm">
              Animar ultrapassagem
              <Switch checked={form.animarUltrapassagem}
                onCheckedChange={v => set('animarUltrapassagem', v)} />
            </label>
            <label className="flex items-center justify-between text-sm">
              Comemorar meta batida
              <Switch checked={form.comemorarMeta} onCheckedChange={v => set('comemorarMeta', v)} />
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {desafio ? 'Salvar' : 'Criar desafio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ConfigurarDesafio;
