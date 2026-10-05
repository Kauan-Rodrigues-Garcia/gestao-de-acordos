/** As linhas e os números da aba «App no celular» — ver `AppNoCelular.tsx`. */

export interface LinhaAppCelular {
  perfil_id: string;
  nome: string;
  cargo: string | null;
  situacao: string;
  empresa_id: string;
  empresa_nome: string | null;
  setor_nome: string | null;
  instalado_em: string | null;
  ultima_abertura_em: string | null;
  aparelho: 'iphone' | 'android' | 'outro' | null;
  celulares: number;
  celular_desde: string | null;
}

/** Os números do topo — exportada para os testes. */
export function resumoAppCelular(linhas: readonly LinhaAppCelular[]) {
  return {
    instalaram:        linhas.filter(l => l.instalado_em).length,
    comCelular:        linhas.filter(l => l.celulares > 0).length,
    instalaramSemAviso: linhas.filter(l => l.instalado_em && l.celulares === 0).length,
  };
}
