import { DOCUMENT_TYPES, OCCURRENCE_STATUSES, OS_STATUSES } from './types.ts';
export const MODULOS_ATIVIDADE = [
  { id: 'ocorrencias', tabela: 'ocorrencias', titulo: 'Ocorrências', campo: 'status', categorias: [...OCCURRENCE_STATUSES] },
  { id: 'os', tabela: 'ordens_servico', titulo: 'Ordens de serviço', campo: 'status', categorias: [...OS_STATUSES] },
  { id: 'documentos', tabela: 'documentos', titulo: 'Documentos', campo: 'tipo_documento', categorias: [...DOCUMENT_TYPES] },
  { id: 'vistorias', tabela: 'vistorias', titulo: 'Vistorias', campo: '', categorias: [] },
  { id: 'autos', tabela: 'autos_infracao', titulo: 'Autos de infração', campo: '', categorias: [] },
] as const;
export type ConsultaAtividade = { id: string; tabela: string; campo?: string; valor?: string };
export const CONSULTAS_ATIVIDADE: ConsultaAtividade[] = MODULOS_ATIVIDADE.flatMap(m => [
  { id: m.id, tabela: m.tabela },
  ...m.categorias.map(valor => ({ id: `${m.id}:${valor}`, tabela: m.tabela, campo: m.campo, valor })),
]);
export type ContagensAtividade = Record<string, number | null>;
// Somente contagens exatas no servidor: não baixa anexos nem trunca em 1.000 linhas.
// Uma consulta negada/sem rede é "indisponível", nunca convertida em zero.
export async function carregarAtividade(
  contar: (consulta: ConsultaAtividade) => PromiseLike<{ count: number | null; error: unknown }>,
  signal?: AbortSignal,
): Promise<ContagensAtividade> {
  const resultado: ContagensAtividade = {};
  let proxima = 0;
  async function trabalhar() {
    while (proxima < CONSULTAS_ATIVIDADE.length) {
      if (signal?.aborted) throw new DOMException('Carregamento cancelado', 'AbortError');
      const consulta = CONSULTAS_ATIVIDADE[proxima++];
      try {
        const { count, error } = await contar(consulta);
        resultado[consulta.id] = !error && typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : null;
      } catch { resultado[consulta.id] = null; }
    }
  }
  await Promise.all(Array.from({ length: 4 }, trabalhar));
  if (signal?.aborted) throw new DOMException('Carregamento cancelado', 'AbortError');
  return resultado;
}
export function larguraBarra(valor: number | null, maior: number) {
  return valor == null || valor <= 0 || maior <= 0 ? 0 : Math.min(100, valor / maior * 100);
}
export const ROTULOS_DOCUMENTOS: Record<string, string> = {
  foto: 'Fotos', assinatura: 'Assinaturas', documento: 'Documentos digitalizados', relatorio: 'Relatórios / PDFs', auto_infracao: 'Arquivos de autos',
};
