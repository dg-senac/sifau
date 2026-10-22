import type { ColunaRelatorio } from './relatorios.ts';

export const COLUNAS_OCORRENCIAS: ColunaRelatorio[] = [
  { chave: 'categoria', titulo: 'Categoria' }, { chave: 'subcategoria', titulo: 'Subcategoria' },
  { chave: 'descricao', titulo: 'Descrição da ocorrência', largura: 65 },
  { chave: 'status', titulo: 'Situação', tipo: 'status', largura: 20 },
  { chave: 'urgencia', titulo: 'Urgência', tipo: 'status', largura: 16 },
  { chave: 'bairro', titulo: 'Bairro' }, { chave: 'endereco', titulo: 'Endereço', largura: 48 },
  { chave: 'created_at', titulo: 'Registrada em', tipo: 'dataHora' },
  { chave: 'sla_deadline', titulo: 'Prazo de atendimento', tipo: 'dataHora' },
  { chave: 'id', titulo: 'Identificador da ocorrência (técnico)', tecnica: true, largura: 40 },
];
export const COLUNAS_FISCAIS: ColunaRelatorio[] = [
  { chave: 'nome', titulo: 'Nome do fiscal', largura: 35 }, { chave: 'email', titulo: 'E-mail', largura: 38 },
  { chave: 'telefone', titulo: 'Telefone', largura: 22 }, { chave: 'bairro', titulo: 'Bairro / região' },
  { chave: 'especialidade', titulo: 'Especialidade' }, { chave: 'situacao', titulo: 'Situação cadastral', tipo: 'status' },
  { chave: 'created_at', titulo: 'Cadastrado em', tipo: 'dataHora' },
  { chave: 'id', titulo: 'Identificador do fiscal (técnico)', tecnica: true, largura: 40 },
];
export const COLUNAS_AUDITORIA: ColunaRelatorio[] = [
  { chave: 'created_at', titulo: 'Data da movimentação', tipo: 'dataHora' },
  { chave: 'fiscal_nome', titulo: 'Fiscal responsável', largura: 35 },
  { chave: 'status_anterior', titulo: 'Situação anterior' }, { chave: 'status_novo', titulo: 'Nova situação', tipo: 'status' },
  { chave: 'observacao', titulo: 'Observação', largura: 65 },
  { chave: 'latitude', titulo: 'Latitude', tipo: 'numero', largura: 18 },
  { chave: 'longitude', titulo: 'Longitude', tipo: 'numero', largura: 18 },
  { chave: 'id', titulo: 'Identificador da movimentação (técnico)', tecnica: true, largura: 40 },
  { chave: 'ocorrencia_id', titulo: 'Identificador da ocorrência (técnico)', tecnica: true, largura: 40 },
  { chave: 'fiscal_id', titulo: 'Identificador do fiscal (técnico)', tecnica: true, largura: 40 },
];
