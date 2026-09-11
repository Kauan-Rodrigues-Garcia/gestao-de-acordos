/**
 * VisaoLideranca — o setor inteiro, em duas leituras.
 *
 * ## Por que duas, e não uma lista com coluna «operador»
 *
 * As duas metades pedem ações diferentes. «Disponíveis» é uma fila de trabalho:
 * são números parados que alguém deveria estar usando. «Com operador» é um
 * cadastro: consulta-se para saber quem está com o quê.
 *
 * Numa lista só, com uma coluna a mais, os disponíveis se dissolveriam no meio
 * dos distribuídos — e o número parado há duas semanas continuaria parado.
 *
 * ## Os distribuídos são agrupados por PESSOA, e não listados por número
 *
 * A tabela plana respondia «de quem é este número?», uma pergunta que quase
 * ninguém faz. A que se faz é a inversa — «quantos o João está usando?» —, e
 * respondê-la exigia varrer a coluna Operador de cinquenta linhas somando de
 * cabeça, com o mesmo nome repetido em posições espalhadas.
 *
 * Agora cada pessoa é um bloco: rosto, nome, e os números dela dentro. A
 * liderança bate o olho e vê a distribuição do setor.
 *
 * A foto sai de `perfis.foto_url`, a mesma do resto do sistema. Quem não tem
 * cadastrada cai nas iniciais — o padrão que Usuários, Chat e o cabeçalho já
 * usam. Nada de regra paralela para este canto.
 *
 * ## O agrupamento não mexe em permissão nenhuma
 *
 * Ele rearranja o que chegou. Quem decide o que chega é `fn_numeros_visivel`, no
 * banco: a liderança recebe o setor inteiro, o operador recebe só o que foi
 * lançado para ele. Esta tela nunca é montada para o operador — ele cai em
 * `VisaoOperador` —, e mesmo que fosse, a lista dela viria com um bloco só: o
 * dele.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Send, Undo2, UserPlus, Users, Hash } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  EtiquetaMotivo, EtiquetasOperacionais,
} from '@/components/numeros/EtiquetasNumero';
import { DialogoMotivoRetorno } from '@/components/numeros/DialogoMotivoRetorno';
import { SeletorEtiquetas } from '@/components/numeros/SeletorEtiquetas';
import { SeletorSituacao } from '@/components/numeros/SeletorSituacao';
import { SituacaoDoNumero } from '@/components/numeros/SituacaoDoNumero';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import { podeLancarAoOperador, type MotivoRetorno } from '@/services/numeros/numerosRegras';
import {
  relancarAoNucleo, type NumeroRow, type OperadorDoSetor,
} from '@/services/numeros/numeros.service';
import { DialogoLancar } from './DialogoLancar';

/** Um operador e os números que estão com ele. */
interface BlocoOperador {
  id: string;
  nome: string;
  fotoUrl: string | null;
  numeros: NumeroRow[];
}

/**
 * As iniciais para quem não tem foto.
 *
 * Duas letras, do primeiro e do último pedaço do nome — a mesma conta de
 * `ListaPessoas` e do avatar do cabeçalho, para o mesmo rosto vazio aparecer
 * igual em todo lugar.
 */
function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const letras = partes.length === 1
    ? partes[0].slice(0, 2)
    : partes[0][0] + partes[partes.length - 1][0];
  return letras.toUpperCase();
}

export interface VisaoLiderancaProps {
  empresaId: string;
  semOperador: NumeroRow[];
  comOperador: NumeroRow[];
  nomeDoCelular: (celularId: string) => string;
  /**
   * As pessoas ativas do setor, com nome e foto.
   *
   * A tela recebe a lista e não uma função `nomeDoOperador`: o agrupamento
   * precisa da foto junto, e uma segunda função só para ela deixaria as duas
   * livres para discordar sobre quem é quem.
   */
  pessoas: OperadorDoSetor[];
  podeLancar: boolean;
  podeRelancar: boolean;
  /**
   * Os botões valem para o setor deste número?
   *
   * Lançar e relançar só funcionam no setor de quem age
   * (`fn_numeros_manda_no_setor`), com o super_admin atravessando. Para o líder
   * de um setor de cobrança isso é todo número da tela. Para quem é do Núcleo,
   * não: a RLS entrega a ele os números de todos os setores, e cada botão levaria
   * a uma recusa do banco. Ausente, vale para todos — o comportamento de antes.
   */
  podeAgirNoSetor?: (setorId: string) => boolean;
  /**
   * Situação e etiquetas de cada número. São do Núcleo (`numeros_administrar`)
   * — o Assistente ADM acompanha aqui os números que estão com os setores — e
   * valem em qualquer setor: `fn_numeros_alterar_situacao` confere o Núcleo, e
   * não o setor de quem age. Ausente, a tela só mostra a situação e o tempo.
   */
  podeAlterarSituacao?: boolean;
  onMudou: () => void;
  onVerHistorico: (numeroId: string, numero: string) => void;
}

export function VisaoLideranca({
  empresaId, semOperador, comOperador, nomeDoCelular, pessoas,
  podeLancar, podeRelancar, podeAgirNoSetor = () => true, podeAlterarSituacao = false,
  onMudou, onVerHistorico,
}: VisaoLiderancaProps) {
  const [paraLancar, setParaLancar]     = useState<NumeroRow | null>(null);
  const [paraRelancar, setParaRelancar] = useState<NumeroRow | null>(null);
  const [salvando, setSalvando]         = useState(false);

  const porPessoa = useMemo(() => new Map(pessoas.map(p => [p.id, p])), [pessoas]);

  const nomeDoOperador = (id: string | null) =>
    // Alguém transferido de setor continua no número até a liderança agir — e
    // some da lista de pessoas ativas do setor. Dizer isso é melhor do que
    // mostrar um espaço em branco.
    (id ? porPessoa.get(id)?.nome ?? 'Fora do setor' : '—');

  /**
   * Os blocos, um por pessoa que tem número.
   *
   * Quem não tem nenhum não aparece: o pedido é explícito, e um setor de trinta
   * pessoas com cinco números distribuídos viraria vinte e cinco cartões vazios.
   *
   * A ordem é por quantidade, do maior para o menor, com o nome desempatando.
   * É a leitura que a liderança faz — quem está com mais — e o desempate por
   * nome mantém a lista estável entre releituras de realtime.
   */
  const blocos = useMemo<BlocoOperador[]>(() => {
    const mapa = new Map<string, BlocoOperador>();

    for (const n of comOperador) {
      const id = n.operador_id;
      if (!id) continue;  // `comOperador` já filtra, mas o tipo permite null.
      let bloco = mapa.get(id);
      if (!bloco) {
        const pessoa = porPessoa.get(id);
        bloco = {
          id,
          nome: pessoa?.nome ?? 'Fora do setor',
          fotoUrl: pessoa?.foto_url ?? null,
          numeros: [],
        };
        mapa.set(id, bloco);
      }
      bloco.numeros.push(n);
    }

    return [...mapa.values()].sort((a, b) =>
      b.numeros.length - a.numeros.length || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [comOperador, porPessoa]);

  async function relancar(motivo: MotivoRetorno, observacao: string) {
    if (!paraRelancar) return;
    setSalvando(true);
    const r = await relancarAoNucleo(paraRelancar.id, motivo, observacao);
    setSalvando(false);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível relançar.'); return; }
    toast.success(`${mascararNumero(paraRelancar.numero)} voltou ao Núcleo.`);
    setParaRelancar(null);
    onMudou();
  }

  /** Os dois botões de ação, iguais nas duas leituras. */
  function acoes(n: NumeroRow, comDono: boolean) {
    if (!podeAgirNoSetor(n.setor_id)) return null;
    return (
      <div className="flex justify-end gap-1">
        {podeLancar && podeLancarAoOperador({
          situacao: n.situacao, posse: n.posse,
          operadorId: n.operador_id, tratamento: n.tratamento,
        }) && (
          <Button size="sm" variant="outline" onClick={() => setParaLancar(n)}>
            {comDono
              ? <><UserPlus className="mr-1 h-3.5 w-3.5" /> Trocar</>
              : <><Send className="mr-1 h-3.5 w-3.5" /> Lançar</>}
          </Button>
        )}
        {podeRelancar && (
          <Button size="sm" variant="ghost" onClick={() => setParaRelancar(n)}>
            <Undo2 className="mr-1 h-3.5 w-3.5" /> Relançar
          </Button>
        )}
      </div>
    );
  }

  function marcas(n: NumeroRow) {
    return (
      <>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* O Núcleo troca a situação e as etiquetas daqui mesmo; o resto vê a
              situação com o tempo dela — a contagem das esperas e da restrição,
              ou há quanto tempo o número está no proxy. */}
          {podeAlterarSituacao
            ? <SeletorSituacao numero={n} onMudou={onMudou} />
            : <SituacaoDoNumero numero={n} />}
          <EtiquetaMotivo motivo={n.motivo_retorno} />
          <EtiquetasOperacionais etiquetas={n.etiquetas} />
          {podeAlterarSituacao && <SeletorEtiquetas numero={n} onMudou={onMudou} />}
        </div>
        {n.observacao_retorno && (
          <p className="mt-1 max-w-[28ch] truncate text-xs text-muted-foreground"
             title={n.observacao_retorno}>
            {n.observacao_retorno}
          </p>
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── A fila: o que está parado esperando alguém ────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Disponíveis para lançar ({semOperador.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {semOperador.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Nenhum número livre no setor.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Celular</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {semOperador.map(n => (
                    <TableRow key={n.id}>
                      <TableCell>
                        <button
                          type="button"
                          className="font-mono text-sm underline-offset-2 hover:underline"
                          onClick={() => onVerHistorico(n.id, n.numero)}
                        >
                          {mascararNumero(n.numero)}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm">{nomeDoCelular(n.celular_id)}</TableCell>
                      <TableCell>{marcas(n)}</TableCell>
                      <TableCell className="text-right">{acoes(n, false)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── O cadastro: quem está com o quê ───────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">
            Distribuídos ({comOperador.length})
          </h2>
          {blocos.length > 0 && (
            <span className="text-sm text-muted-foreground">
              entre {blocos.length} {blocos.length === 1 ? 'pessoa' : 'pessoas'}
            </span>
          )}
        </div>

        {blocos.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center space-y-2">
              <Hash className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nenhum número distribuído.
              </p>
              <p className="text-xs text-muted-foreground">
                Use «Lançar» na lista acima para entregar um número a alguém do
                setor.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {blocos.map(bloco => (
              <Card key={bloco.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      {bloco.fotoUrl && (
                        <AvatarImage src={bloco.fotoUrl} alt={bloco.nome} />
                      )}
                      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                        {iniciaisDe(bloco.nome)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-base">{bloco.nome}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {bloco.numeros.length}{' '}
                        {bloco.numeros.length === 1 ? 'número' : 'números'}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 tabular-nums">
                      {bloco.numeros.length}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-2 pt-0">
                  {bloco.numeros.map(n => (
                    <div
                      key={n.id}
                      className="flex flex-wrap items-center justify-between gap-2
                                 rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <button
                          type="button"
                          className="font-mono text-sm underline-offset-2 hover:underline"
                          onClick={() => onVerHistorico(n.id, n.numero)}
                        >
                          {mascararNumero(n.numero)}
                        </button>
                        <p className="text-xs text-muted-foreground">
                          {nomeDoCelular(n.celular_id)}
                        </p>
                        <div className="mt-1">{marcas(n)}</div>
                      </div>
                      {acoes(n, true)}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <DialogoLancar
        numero={paraLancar}
        empresaId={empresaId}
        nomeAtual={paraLancar?.operador_id ? nomeDoOperador(paraLancar.operador_id) : null}
        onFechar={() => setParaLancar(null)}
        onLancado={onMudou}
      />

      <DialogoMotivoRetorno
        aberto={paraRelancar !== null}
        titulo="Relançar ao Núcleo"
        descricao={
          paraRelancar
            ? `${mascararNumero(paraRelancar.numero)} sai do setor e volta para o `
              + 'Núcleo tratar. O registro e o histórico são preservados.'
            : ''
        }
        rotuloConfirmar="Relançar"
        salvando={salvando}
        onConfirmar={relancar}
        onFechar={() => setParaRelancar(null)}
      />
    </div>
  );
}
