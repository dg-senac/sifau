import { useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { FormatoRelatorio } from '@/lib/relatorios';

export function ExportarRelatorio({ titulo, escopo, onExport, permitirJSON = false }: {
  titulo: string; escopo: string; onExport: (formato: FormatoRelatorio | 'json') => Promise<void>; permitirJSON?: boolean;
}) {
  const [formato, setFormato] = useState<FormatoRelatorio | 'json'>('xlsx');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [concluido, setConcluido] = useState(false);
  const executando = useRef(false);
  const nomes = { xlsx: 'Excel', pdf: 'PDF', csv: 'CSV', json: 'JSON técnico' };
  async function exportar() {
    if (executando.current) return;
    executando.current = true; setOcupado(true); setErro(''); setConcluido(false);
    try { await onExport(formato); setConcluido(true); }
    catch (falha) { setErro(falha instanceof Error ? falha.message : 'Não foi possível exportar. Tente novamente.'); }
    finally { executando.current = false; setOcupado(false); }
  }
  return <section className="exportar-relatorio" aria-label={titulo} aria-busy={ocupado}>
    <h3>{titulo}</h3><p>{escopo}</p>
    <div className="exportar-controles">
      <label>Formato do arquivo
        <select value={formato} disabled={ocupado} onChange={(e) => setFormato(e.target.value as typeof formato)}>
          <option value="xlsx">Excel (.xlsx) — recomendado</option>
          <option value="pdf">PDF — para ler e imprimir</option>
          <option value="csv">CSV — para importar dados</option>
          {permitirJSON && <option value="json">JSON técnico — auditoria original</option>}
        </select>
      </label>
      <button className="primary-button" disabled={ocupado} onClick={() => void exportar()}>
        {ocupado ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
        {ocupado ? 'Preparando arquivo...' : `Baixar ${nomes[formato]}`}
      </button>
    </div>
    <p className="exportar-ajuda">{formato === 'xlsx' ? 'Cabeçalhos fixos, filtros e datas organizadas. IDs técnicos em uma aba separada.' :
      formato === 'pdf' ? 'Relatório paginado, com uma ficha legível por registro.' :
      formato === 'csv' ? 'Texto UTF-8 com acentos, separado por ponto e vírgula (;). Sem cores ou formatação visual.' :
      'Dados técnicos completos. O hash SHA-256 identifica os bytes do arquivo baixado.'}</p>
    {concluido && <p role="status">Download solicitado. Confira a pasta de downloads do dispositivo.</p>}
    {erro && <p className="form-message" role="alert">{erro}</p>}
    {ocupado && <span className="sr-only" role="status">Preparando exportação. Aguarde.</span>}
  </section>;
}
