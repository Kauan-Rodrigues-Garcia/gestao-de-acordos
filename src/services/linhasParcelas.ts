/**
 * linhasParcelas.ts — as N parcelas de um acordo, existam elas ou não.
 * ─────────────────────────────────────────────────────────────────────────────
 * Um acordo BookPlay declara `parcelas` (o "de N") mas nem sempre tem N linhas
 * no banco. Acordos vindos do analítico nascem no meio do plano, e há grupos
 * antigos com só as primeiras parcelas registradas — daí um acordo de 17
 * parcelas com duas linhas.
 *
 * O detalhe do acordo já desenhava as que faltam como linhas "virtuais", só que
 * a tela de editar parcelas listava apenas as reais: abrir um acordo de 17 e ver
 * 2 para editar. Este módulo monta a lista inteira e marca quais ainda não
 * existem, para a edição poder criá-las.
 *
 * Puro de propósito: é data e dinheiro de parcela que ninguém confere na tela.
 */
import { datasDoLote } from '@/lib/vencimentos';

export interface RegistroDeParcela {
  id:             string;
  numero_parcela: number | null;
  vencimento:     string;
  valor:          number;
  tipo:           string;
  status:         string;
}

export interface LinhaEditavel {
  numero:     number;
  /** `null` quando a parcela ainda não existe como registro. */
  id:         string | null;
  vencimento: string;
  valor:      number;
  tipo:       string;
  /** Só as reais têm status; a virtual ainda não é nada. */
  status:     string | null;
}

/**
 * Lista das parcelas 1..N.
 *
 * `valoresCalculados` vem do acordo com entrada ([entrada, demais, demais…]);
 * sem ele, a parcela que falta assume `valorPadrao`. A data segue a cadência do
 * acordo a partir da primeira parcela real — a mesma regra do reagendamento,
 * que satura em mês curto em vez de inventar 31 de fevereiro.
 */
export function montarLinhasEditaveis(params: {
  registros:         readonly RegistroDeParcela[];
  totalDeclarado:    number;
  valoresCalculados: readonly number[] | null;
  valorPadrao:       number;
  tipoPadrao:        string;
  isPaguePlay:       boolean;
}): LinhaEditavel[] {
  const {
    registros, totalDeclarado, valoresCalculados, valorPadrao, tipoPadrao, isPaguePlay,
  } = params;

  const numeroDe = (r: RegistroDeParcela) => r.numero_parcela ?? 1;
  const reais    = [...registros].sort((a, b) => numeroDe(a) - numeroDe(b));
  const maior    = reais.length ? numeroDe(reais[reais.length - 1]) : 0;
  const total    = Math.max(totalDeclarado || 0, maior, reais.length, 1);

  // Âncora das datas: a primeira parcela real. Sem nenhuma real não há de onde
  // partir, e a lista sai só com o que existe (nada) — quem chama decide.
  const base       = reais[0];
  const numeroBase = base ? numeroDe(base) : 1;
  const vencBase   = base?.vencimento ?? '';
  // Uma passada só: as datas de numeroBase até o fim, na cadência do acordo.
  const datas = vencBase
    ? datasDoLote(vencBase, Math.max(1, total - numeroBase + 1), isPaguePlay)
    : [];

  const linhas: LinhaEditavel[] = [];
  for (let numero = 1; numero <= total; numero++) {
    const real = reais.find(r => numeroDe(r) === numero);
    if (real) {
      linhas.push({
        numero,
        id:         real.id,
        vencimento: real.vencimento,
        valor:      Number(real.valor),
        tipo:       real.tipo,
        status:     real.status,
      });
      continue;
    }
    // Anterior à primeira real (acordo que nasceu no meio do plano): fica sem
    // data calculável, e a edição trata como linha que não dá para criar.
    const vencimento = numero >= numeroBase ? (datas[numero - numeroBase] ?? '') : '';
    linhas.push({
      numero,
      id:         null,
      vencimento,
      valor:      valoresCalculados?.[numero - 1] ?? valorPadrao,
      tipo:       tipoPadrao,
      status:     null,
    });
  }
  return linhas;
}
