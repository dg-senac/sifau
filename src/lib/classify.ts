import { CATEGORIES, SUBCATEGORIES, URGENCY_LEVELS } from './types';

export function classifyByText(descricao: string): {
  categoria: string;
  subcategoria: string;
  urgencia: string;
  motivo: string;
} {
  const text = descricao.toLowerCase();

  const keywordMap: Record<string, string[]> = {
    'Buraco na via': ['buraco', 'asfalto', ' cratera', 'onda', 'depressão', 'tampa', 'bueiro'],
    'Iluminação pública': ['luz', 'lâmpada', 'poste', 'iluminação', 'escuro', 'fiação', 'fio'],
    'Poluição sonora': ['barulho', 'som', 'música', 'ruído', 'algazarra', 'festa'],
    'Entulho / lixo irregular': ['entulho', 'lixo', 'descarte', 'caçamba', 'resíduo', 'sucata'],
    'Poda de árvore / risco de queda': ['árvore', 'poda', 'galho', 'queda', 'risco de cair', 'tronco'],
    'Vazamento de água / esgoto': ['vazamento', 'água', 'esgoto', 'cano', 'vazando', 'transbordando'],
    'Ocupação irregular de calçada': ['calçada', 'ocupação', 'barraca', 'mesa', 'banca', 'mercadoria'],
    'Sinalização de trânsito danificada': ['sinalização', 'placa', 'semáforo', 'faixa', 'trânsito', 'sinal'],
    'Comércio/obra sem licença': ['licença', 'comércio', 'obra', 'construção', 'alvará', 'publicidade'],
  };

  let best: string | null = null;
  let bestScore = 0;

  for (const categoria of CATEGORIES) {
    const keywords = keywordMap[categoria] ?? [];
    const score = keywords.reduce(
      (acc, kw) => acc + (text.includes(kw) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      best = categoria;
    }
  }

  const categoria = best ?? 'Buraco na via';
  const subcategoria = SUBCATEGORIES[categoria]?.[0] ?? '';
  const urgentWords = ['urgente', 'crítico', 'perigo', 'risco', 'grave', 'imediato', 'acidente'];
  const isUrgent = urgentWords.some(w => text.includes(w));
  const urgencia = isUrgent ? 'Crítica' : 'Média';

  return {
    categoria,
    subcategoria,
    urgencia,
    motivo: `Sugestão por palavras-chave (categoria: ${categoria}, urgência: ${urgencia}). Revise antes de salvar.`,
  };
}

export function urgencyRank(u: string): number {
  return URGENCY_LEVELS.indexOf(u as (typeof URGENCY_LEVELS)[number]);
}
