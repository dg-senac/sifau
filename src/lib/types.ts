export type Fiscal = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  bairro: string;
  especialidade?: string | null;
  ativo: boolean;
};

export type Occurrence = {
  id: string;
  categoria: string;
  subcategoria: string;
  descricao: string;
  status: string;
  urgencia: string;
  bairro: string;
  endereco: string;
  latitude: number | null;
  longitude: number | null;
  sla_deadline: string;
  created_at: string;
  fiscal_registrou: string;
  fiscal_designado?: string | null;
  fotos: string[];
};

export type Vistoria = {
  id: string;
  ocorrencia_id: string;
  fiscal_id: string;
  chegada_at: string;
  chegada_latitude: number;
  chegada_longitude: number;
  laudo: string;
  acao_tomada: string;
  valor_multa: number | null;
  numero_processo: string | null;
  fotos_depois: string[];
  created_at: string;
};

export type OrdemServico = {
  id: string;
  numero: string;
  origem: string;
  ocorrencia_id?: string | null;
  requerente: string;
  fiscal_abertura: string;
  fiscal_designado?: string | null;
  apoio_operacional: boolean;
  orgao_apoio?: string | null;
  descricao: string;
  legislacao: string[];
  endereco: string;
  latitude: number | null;
  longitude: number | null;
  emitida_em: string;
  prazo_resposta: string;
  status: string;
};

export type Auditoria = {
  id: string;
  ocorrencia_id: string;
  status_anterior: string | null;
  status_novo: string;
  fiscal_id: string;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  observacao: string | null;
};

export type Exportacao = {
  id: string;
  fiscal_id: string;
  hash: string;
  descricao: string;
  quantidade: number;
  created_at: string;
};

export type Notificacao = {
  id: string;
  fiscal_id: string;
  ocorrencia_id: string | null;
  tipo: 'atribuicao' | 'sla' | 'status' | 'info';
  titulo: string;
  mensagem: string;
  lida: boolean;
  created_at: string;
};

export const CATEGORIES = [
  'Buraco na via',
  'Iluminação pública',
  'Poluição sonora',
  'Entulho / lixo irregular',
  'Poda de árvore / risco de queda',
  'Vazamento de água / esgoto',
  'Ocupação irregular de calçada',
  'Sinalização de trânsito danificada',
  'Comércio/obra sem licença',
] as const;

export const SUBCATEGORIES: Record<string, string[]> = {
  'Buraco na via': ['Asfalto', 'Calçada', 'Tampa de bueiro'],
  'Iluminação pública': ['Lâmpada apagada', 'Poste danificado', 'Fiação exposta'],
  'Poluição sonora': ['Estabelecimento', 'Evento', 'Residência'],
  'Entulho / lixo irregular': ['Descarte em via', 'Terreno baldio', 'Caçamba irregular'],
  'Poda de árvore / risco de queda': ['Risco de queda', 'Galhos na rede', 'Poda irregular'],
  'Vazamento de água / esgoto': ['Vazamento de água', 'Esgoto a céu aberto', 'Bueiro transbordando'],
  'Ocupação irregular de calçada': ['Comércio', 'Obra', 'Veículos'],
  'Sinalização de trânsito danificada': ['Placa', 'Semáforo', 'Faixa de pedestres'],
  'Comércio/obra sem licença': ['Comércio', 'Construção', 'Publicidade'],
};

export const OCCURRENCE_STATUSES = [
  'Aberta',
  'Triada',
  'Atribuída',
  'Em vistoria',
  'Resolvida',
  'Arquivada',
  'Escalonada',
] as const;

export const URGENCY_LEVELS = ['Baixa', 'Média', 'Alta', 'Crítica'] as const;

export const ACTIONS = ['Notificação', 'Multa', 'Encaminhamento', 'Orientação', 'Sem ação'] as const;

export const OS_STATUSES = ['Aberta', 'Em vistoria', 'Concluída', 'Cancelada'] as const;
export const OS_ORIGINS = ['Preventiva', 'Denúncia', 'Ofício', 'Comunicação Interna', 'Gestão'] as const;

export const SCIENCE_TYPES = ['Assinou', 'Recusou', 'Ausente'] as const;
export const PAYMENT_STATUSES = ['Pendente', 'Pago', 'Cancelado'] as const;

export type Screen =
  | 'home'
  | 'new'
  | 'inspection'
  | 'dashboard'
  | 'orders'
  | 'audit'
  | 'users'
  | 'more'
  | 'profile'
  | 'notifications'
  | 'map';
