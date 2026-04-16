// ============================================================
// Types: Serviços de Guincho
// Description: Tipos TypeScript para serviços disponíveis
// ============================================================

/**
 * Tipo de serviço disponível na plataforma
 */
export interface TipoServico {
  id: string;
  nome: string;
  descricao: string | null;
  icone: string | null;
  imagem_url: string | null;
  ativo: boolean;
  ordem: number;
}

/**
 * Serviço oferecido por um prestador
 */
export interface PrestadorServico {
  id: string;
  prestador_id: string;
  tipo_servico_id: string;
  preco_base: number;
  preco_por_km: number;
  tempo_estimado_chegada: number;
  ativo: boolean;
}

/**
 * Serviço disponível retornado pela função buscar_servicos_disponiveis
 */
export interface ServicoDisponivel {
  id: string;
  prestador_id: string;
  tipo_servico_id: string;
  tipo_servico_nome: string;
  tipo_servico_descricao: string | null;
  tipo_servico_icone: string | null;
  preco_base: number;
  preco_por_km: number;
  prestador_nome: string;
  prestador_foto_url: string | null;
  prestador_rating: number;
  prestador_total_servicos: number;
  prestador_telefone: string | null;
  distancia_km: number;
  tempo_estimado_min: number;
  distancia_viagem_km: number;
  preco_final: number;
}

/**
 * Estado de seleção de serviço
 */
export interface ServicoSelecionado {
  servico: ServicoDisponivel;
  selectedAt: Date;
}

/**
 * Props para o componente ServiceCard
 */
export interface ServiceCardProps {
  servico: ServicoDisponivel;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onExpand: () => void;
}

/**
 * Props para o componente ServicesList
 */
export interface ServicesListProps {
  services: ServicoDisponivel[];
  loading: boolean;
  error: string | null;
  selectedServiceId: string | null;
  onSelectService: (servico: ServicoDisponivel) => void;
  onRefresh?: () => void;
}

/**
 * Filtros para busca de serviços
 */
export interface ServiceFilters {
  tipo_servico?: string;
  preco_max?: number;
  rating_min?: number;
  distancia_max?: number;
}

/**
 * Response da função RPC buscar_servicos_disponiveis
 */
export interface BuscarServicosResponse {
  data: ServicoDisponivel[] | null;
  error: {
    message: string;
    code?: string;
  } | null;
}

/**
 * Dados para criar/atualizar serviço do prestador
 */
export interface PrestadorServicoInput {
  tipo_servico_id: string;
  preco_base: number;
  preco_por_km: number;
  tempo_estimado_chegada?: number;
  ativo?: boolean;
}
