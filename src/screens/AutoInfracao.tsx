import { FormEvent, useState } from 'react';
import { jsPDF } from 'jspdf';
import { AlertTriangle, CheckCircle2, FileDown, Loader2, ShieldAlert, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Fiscal, Occurrence, SCIENCE_TYPES } from '@/lib/types';
import { PageTitle } from '@/components/ui';
import { SignaturePad } from '@/components/SignaturePad';
import { enqueue } from '@/lib/offlineQueue';

export function AutoInfracaoForm({
  item,
  fiscal,
  valorMultaSugerido,
  numeroProcesso,
  onClose,
}: {
  item: Occurrence;
  fiscal: Fiscal | null;
  valorMultaSugerido: number;
  numeroProcesso: string;
  onClose: () => void;
}) {
  const [tipoInfracao, setTipoInfracao] = useState(item.categoria);
  const [artigoLegal, setArtigoLegal] = useState('');
  const [motivo, setMotivo] = useState(item.descricao);
  const [valorBase, setValorBase] = useState(String(valorMultaSugerido || 0));
  const [valorMulta, setValorMulta] = useState(String(valorMultaSugerido || 0));
  const [autuadoNome, setAutuadoNome] = useState('');
  const [autuadoDocumento, setAutuadoDocumento] = useState('');
  const [testemunhaNome, setTestemunhaNome] = useState('');
  const [ciencia, setCiencia] = useState<(typeof SCIENCE_TYPES)[number]>('Assinou');
  const [vencimento, setVencimento] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  );
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [lastAuto, setLastAuto] = useState<Record<string, unknown> | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!autuadoNome.trim() || !autuadoDocumento.trim()) {
      setMessage('Informe o nome e o documento do autuado.');
      return;
    }
    if (ciencia === 'Assinou' && !signature) {
      setMessage('Capture a assinatura do autuado ou altere a ciência para "Recusou"/"Ausente".');
      return;
    }
    if (!fiscal) return;
    setSaving(true);
    setMessage('');

    const payload = {
      ocorrencia_id: item.id,
      tipo_infracao: tipoInfracao,
      artigo_legal: artigoLegal.trim() || 'A definir',
      valor_base: parseFloat(valorBase) || 0,
      valor_multa: parseFloat(valorMulta) || 0,
      motivo: motivo.trim(),
      autuado_nome: autuadoNome.trim(),
      autuado_documento: autuadoDocumento.trim(),
      ciencia,
      testemunha_nome: testemunhaNome.trim() || null,
      pagamento: 'Pendente',
      vencimento,
    };

    if (!navigator.onLine) {
      enqueue('autos_infracao', payload, `Auto de infração: ${autuadoNome}`);
    } else {
      const { error } = await supabase.from('autos_infracao').insert(payload);
      if (error) enqueue('autos_infracao', payload, `Auto de infração: ${autuadoNome}`);
    }

    setLastAuto(payload);
    setSaving(false);
    setDone(true);
  };

  const generatePdf = () => {
    if (!lastAuto) return;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 48;
    let y = 60;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('AUTO DE INFRAÇÃO', margin, y);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('SIFAU — Sistema Municipal de Fiscalização e Atendimento Urbano', margin, y + 16);
    y += 40;

    doc.setDrawColor(200);
    doc.line(margin, y, 545, y);
    y += 24;

    const row = (label: string, value: string) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), margin + 130, y, { maxWidth: 545 - margin - 130 });
      y += 20;
    };

    row('Nº do processo', numeroProcesso || '—');
    row('Data/hora', new Date().toLocaleString('pt-BR'));
    row('Fiscal autuante', fiscal?.nome ?? '—');
    row('Categoria', item.categoria);
    row('Endereço', item.endereco);
    row('Bairro', item.bairro);
    y += 6;
    doc.line(margin, y, 545, y);
    y += 24;

    row('Autuado', String(lastAuto.autuado_nome));
    row('Documento', String(lastAuto.autuado_documento));
    row('Tipo de infração', String(lastAuto.tipo_infracao));
    row('Artigo legal', String(lastAuto.artigo_legal));
    row('Valor base', `R$ ${Number(lastAuto.valor_base).toFixed(2)}`);
    row('Valor da multa', `R$ ${Number(lastAuto.valor_multa).toFixed(2)}`);
    row('Vencimento', new Date(String(lastAuto.vencimento)).toLocaleDateString('pt-BR'));
    if (lastAuto.testemunha_nome) row('Testemunha', String(lastAuto.testemunha_nome));
    y += 6;
    doc.line(margin, y, 545, y);
    y += 24;

    doc.setFont('helvetica', 'bold');
    doc.text('Motivo / descrição:', margin, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    const motivoLines = doc.splitTextToSize(String(lastAuto.motivo), 545 - margin * 2);
    doc.text(motivoLines, margin, y);
    y += motivoLines.length * 14 + 20;

    doc.setFont('helvetica', 'bold');
    doc.text('Ciência do autuado:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(lastAuto.ciencia), margin + 140, y);
    y += 26;

    if (lastAuto.ciencia === 'Assinou' && signature) {
      doc.text('Assinatura do autuado:', margin, y);
      y += 8;
      doc.addImage(signature, 'PNG', margin, y, 200, 80);
      y += 96;
    } else {
      doc.setFont('helvetica', 'italic');
      doc.text(
        lastAuto.ciencia === 'Recusou'
          ? 'O autuado recusou-se a assinar este auto perante o fiscal e a testemunha presente.'
          : 'O autuado estava ausente; a notificação será encaminhada por via administrativa.',
        margin,
        y,
        { maxWidth: 545 - margin * 2 },
      );
      y += 30;
      doc.setFont('helvetica', 'normal');
    }

    doc.line(margin, y + 30, margin + 200, y + 30);
    doc.text('Assinatura do fiscal', margin, y + 44);

    doc.save(`auto-infracao-${(numeroProcesso || item.id).toString().slice(0, 10)}.pdf`);
  };

  if (done) {
    return (
      <>
        <PageTitle eyebrow="Auto emitido" title="Documento pronto"
          action={<button className="icon-button light" onClick={onClose}><X size={20} /></button>} />
        <div className="notice-card">
          <div className="notice-icon"><CheckCircle2 size={19} /></div>
          <div>
            <b>Auto de infração registrado</b>
            <span>Gere o PDF agora para colher a assinatura ou compartilhar com o autuado.</span>
          </div>
        </div>
        <button className="primary-button full" onClick={generatePdf}>
          <FileDown size={18} /> Gerar e baixar PDF
        </button>
        <button className="ghost-button small" style={{ marginTop: 12 }} onClick={onClose}>
          Concluir
        </button>
      </>
    );
  }

  return (
    <>
      <PageTitle eyebrow="Sanção aplicada" title="Emitir auto de infração"
        action={<button className="icon-button light" onClick={onClose}><X size={20} /></button>} />
      <div className="escalated-card">
        <div className="escalated-icon"><ShieldAlert size={18} /></div>
        <div>
          <b>{item.categoria}</b>
          <span>{item.endereco} · {item.bairro}</span>
        </div>
      </div>

      <form className="form-card" onSubmit={submit}>
        <div className="form-section">
          <h2>Dados do autuado</h2>
          <label>
            Nome completo / razão social
            <input required value={autuadoNome} onChange={(e) => setAutuadoNome(e.target.value)} placeholder="Nome do autuado" />
          </label>
          <label>
            CPF / CNPJ
            <input required value={autuadoDocumento} onChange={(e) => setAutuadoDocumento(e.target.value)} placeholder="000.000.000-00" />
          </label>
          <label>
            Testemunha <span className="optional">(opcional)</span>
            <input value={testemunhaNome} onChange={(e) => setTestemunhaNome(e.target.value)} placeholder="Nome da testemunha" />
          </label>
        </div>

        <div className="form-section">
          <h2>Infração</h2>
          <label>
            Tipo de infração
            <input required value={tipoInfracao} onChange={(e) => setTipoInfracao(e.target.value)} />
          </label>
          <label>
            Artigo / base legal
            <input required value={artigoLegal} onChange={(e) => setArtigoLegal(e.target.value)} placeholder="Ex: Art. 45, Código de Posturas Municipal" />
          </label>
          <label>
            Motivo / descrição
            <textarea required minLength={10} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          <div className="two-fields">
            <label>
              Valor base (R$)
              <input type="number" step="0.01" required value={valorBase} onChange={(e) => setValorBase(e.target.value)} />
            </label>
            <label>
              Valor da multa (R$)
              <input type="number" step="0.01" required value={valorMulta} onChange={(e) => setValorMulta(e.target.value)} />
            </label>
          </div>
          <label>
            Vencimento
            <input type="date" required value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </label>
        </div>

        <div className="form-section">
          <h2>Ciência e assinatura</h2>
          <div className="urgency-options">
            {SCIENCE_TYPES.map((v) => (
              <button type="button" key={v} className={ciencia === v ? 'selected' : ''} onClick={() => setCiencia(v)}>{v}</button>
            ))}
          </div>
          {ciencia === 'Assinou' && (
            <SignaturePad onChange={setSignature} />
          )}
        </div>

        {message && <div className="form-message"><AlertTriangle size={16} />{message}</div>}
        <button className="primary-button full" disabled={saving}>
          {saving ? <Loader2 className="spin" size={18} /> : 'Registrar auto de infração'}
        </button>
      </form>
    </>
  );
}
