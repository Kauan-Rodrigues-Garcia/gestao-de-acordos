/**
 * src/lib/tenant-config.ts
 *
 * Centraliza todas as variações de comportamento por tenant.
 * Substitui os 136+ calls espalhados a isPaguePlay(slug).
 *
 * Uso:
 *   const tenant = useTenant();
 *   if (tenant.isPaguePlay) { ... }
 *   const label = tenant.statusLabels['pago'];
 */
import { useMemo } from 'react';
import { useEmpresa } from '@/hooks/useEmpresa';
import {
  STATUS_LABELS,
  STATUS_LABELS_PAGUEPLAY,
  TIPO_LABELS,
  TIPO_LABELS_PAGUEPLAY,
  TIPO_OPTIONS_PAGUEPLAY,
  PARCELAS_MAX_DEFAULT,
  PARCELAS_MAX_PAGUEPLAY,
} from '@/lib/index';

export interface TenantCapabilities {
  /** true quando o tenant ativo é PaguePLAY */
  isPaguePlay: boolean;
  /** Usa o campo 'instituicao' como "Código" ao invés de nr_cliente */
  useInstituicaoAsCodigo: boolean;
  /** Só permite boleto e cartao como formas de pagamento */
  limitedTipos: boolean;
  /** Exibe campo de Estado (UF) no formulário */
  hasEstadoUF: boolean;
  /** Exibe distribuição H.O./Coren/Cofen nas métricas */
  showRevenueDistribution: boolean;
  /** Número máximo de parcelas */
  maxParcelas: number;
  /** Opções disponíveis de tipo de pagamento */
  tipoOptions: readonly string[];
  /** Labels para status do acordo */
  statusLabels: Record<string, string>;
  /** Labels para tipo de pagamento */
  tipoLabels: Record<string, string>;
  /** Slug do tenant atual */
  slug: string;
}

const BOOKPLAY_CAPABILITIES: Omit<TenantCapabilities, 'slug'> = {
  isPaguePlay:             false,
  useInstituicaoAsCodigo:  false,
  limitedTipos:            false,
  hasEstadoUF:             false,
  showRevenueDistribution: false,
  maxParcelas:             PARCELAS_MAX_DEFAULT,
  tipoOptions:             Object.keys(TIPO_LABELS),
  statusLabels:            STATUS_LABELS,
  tipoLabels:              TIPO_LABELS,
};

const PAGUEPLAY_CAPABILITIES: Omit<TenantCapabilities, 'slug'> = {
  isPaguePlay:             true,
  useInstituicaoAsCodigo:  true,
  limitedTipos:            true,
  hasEstadoUF:             true,
  showRevenueDistribution: true,
  maxParcelas:             PARCELAS_MAX_PAGUEPLAY,
  tipoOptions:             TIPO_OPTIONS_PAGUEPLAY,
  statusLabels:            STATUS_LABELS_PAGUEPLAY,
  tipoLabels:              TIPO_LABELS_PAGUEPLAY,
};

export function getTenantCapabilities(slug: string): TenantCapabilities {
  const base = slug === 'pagueplay' ? PAGUEPLAY_CAPABILITIES : BOOKPLAY_CAPABILITIES;
  return { ...base, slug };
}

/** Hook que retorna as capacidades do tenant ativo. */
export function useTenant(): TenantCapabilities {
  const { tenantSlug } = useEmpresa();
  return useMemo(() => getTenantCapabilities(tenantSlug), [tenantSlug]);
}
