import { FormEvent, useEffect, useState } from 'react';
import {
  AlertTriangle, Camera, CheckCircle2, Loader2, Navigation, RefreshCw, WifiOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CATEGORIES, Fiscal, SUBCATEGORIES, URGENCY_LEVELS } from '@/lib/types';
import { classifyByText } from '@/lib/classify';
import { PageTitle } from '@/components/ui';
import { PhotoUpload } from '@/components/PhotoUpload';
import { enqueue } from '@/lib/offlineQueue';

export function NewOccurrence({
  fiscal,
  onDone,
}: {
  fiscal: Fiscal | null;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    categoria: '',
    subcategoria: '',
    descricao: '',
    bairro: fiscal?.bairro ?? '',
    endereco: '',
    urgencia: 'Média' as string,
  });
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [classification, setClassification] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [offline, setOffline] = useState(!navigator.onLine);
  const [photos, setPhotos] = useState<string[]>([]);
  const [duplicateWarn, setDuplicateWarn] = useState('');

  useEffect(() => {
    const online = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', off); };
  }, []);

  const classify = () => {
    if (form.descricao.trim().length < 10) {
      setMessage('Escreva uma descrição mais detalhada para sugerir a classificação.');
      return;
    }
    setMessage('');
    const result = classifyByText(form.descricao);
    setForm((c) => ({ ...c, categoria: result.categoria, subcategoria: result.subcategoria, urgencia: result.urgencia }));
    setClassification(result.motivo);
  };

  const captureLocation = () => {
    if (!navigator.geolocation) { setMessage('Seu aparelho não disponibilizou a localização.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setMessage('Precisamos da localização para registrar a ocorrência.'),
    );
  };

  const checkDuplicate = async () => {
    if (!form.categoria || !form.bairro) return;
    const { data } = await supabase
      .from('ocorrencias')
      .select('id, descricao, created_at')
      .eq('categoria', form.categoria)
      .eq('bairro', form.bairro)
      .order('created_at', { ascending: false })
      .limit(5);
    if (data && data.length > 0) {
      const recent = data.find((d) => {
        const hours = (Date.now() - new Date(d.created_at).getTime()) / 3600000;
        return hours < 48;
      });
      if (recent) {
        setDuplicateWarn(`Possível duplicata: já existe uma ocorrência de "${form.categoria}" neste bairro nos últimos 2 dias. Verifique antes de salvar.`);
      } else {
        setDuplicateWarn('');
      }
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.descricao.trim().length < 20) { setMessage('Descreva a ocorrência com pelo menos 20 caracteres.'); return; }
    if (!form.categoria) { setMessage('Selecione uma categoria.'); return; }
    if (!location) { setMessage('Capture a localização antes de salvar.'); return; }
    if (!fiscal) return;
    setSaving(true);
    setMessage('');

    const basePayload = {
      fiscal_registrou: fiscal.id,
      categoria: form.categoria,
      subcategoria: form.subcategoria,
      descricao: form.descricao.trim(),
      bairro: form.bairro,
      endereco: form.endereco.trim(),
      urgencia: form.urgencia,
      latitude: location.lat,
      longitude: location.lng,
      fotos: photos,
    };

    if (offline || !navigator.onLine) {
      const deadline = new Date(Date.now() + 72 * 3600000).toISOString();
      enqueue('ocorrencias', { ...basePayload, sla_deadline: deadline }, `Ocorrência: ${form.categoria}`);
      setSaving(false);
      onDone();
      return;
    }

    const { data: sla } = await supabase.from('sla_config').select('prazo_horas').eq('categoria', form.categoria).maybeSingle();
    const deadline = new Date(Date.now() + (sla?.prazo_horas ?? 72) * 3600000).toISOString();

    const { error } = await supabase.from('ocorrencias').insert({ ...basePayload, sla_deadline: deadline });

    if (error) {
      // Falha de rede mesmo com navigator.onLine=true: garante que o registro não se perca.
      enqueue('ocorrencias', { ...basePayload, sla_deadline: deadline }, `Ocorrência: ${form.categoria}`);
      setMessage('Sem conexão estável: a ocorrência foi salva na fila e será enviada automaticamente.');
      setSaving(false);
      setTimeout(onDone, 1400);
      return;
    }
    onDone();
    setSaving(false);
  };

  return (
    <>
      <PageTitle
        eyebrow="Nova fiscalização"
        title="Registrar ocorrência"
        action={
          <span className={`connection ${offline ? 'offline' : ''}`}>
            {offline ? <WifiOff size={15} /> : <CheckCircle2 size={15} />}
            {offline ? 'Pendente' : 'Online'}
          </span>
        }
      />
      <form className="form-card" onSubmit={submit}>
        <div className="form-section">
          <h2>Classificação</h2>
          <label>
            Categoria
            <select required value={form.categoria} onChange={(e) => { setForm({ ...form, categoria: e.target.value, subcategoria: SUBCATEGORIES[e.target.value]?.[0] ?? '' }); setDuplicateWarn(''); }}>
              <option value="">Selecione uma categoria</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>
            Subcategoria
            <select required value={form.subcategoria} onChange={(e) => setForm({ ...form, subcategoria: e.target.value })}>
              <option value="">Selecione</option>
              {(SUBCATEGORIES[form.categoria] ?? []).map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
          <label>
            Descrição <span className="character-count">{form.descricao.length}/20 mín.</span>
            <textarea required minLength={20} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Descreva o que foi identificado, com detalhes..." />
          </label>
          <button type="button" className="outline-button" onClick={classify}>
            <RefreshCw size={16} /> Classificar automaticamente
          </button>
          {classification && (
            <div className="info-message"><CheckCircle2 size={16} />{classification}</div>
          )}
          {form.categoria && form.bairro && (
            <button type="button" className="ghost-button small" onClick={checkDuplicate}>
              Verificar duplicatas
            </button>
          )}
          {duplicateWarn && (
            <div className="form-message"><AlertTriangle size={16} />{duplicateWarn}</div>
          )}
        </div>

        <div className="form-section">
          <h2>Localização</h2>
          <label>
            Bairro
            <input required value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} placeholder="Bairro" />
          </label>
          <label>
            Endereço
            <input required value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} placeholder="Rua, número e complemento" />
          </label>
          <button type="button" className={`location-button ${location ? 'captured' : ''}`} onClick={captureLocation}>
            <Navigation size={18} />
            {location ? `Local capturado (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})` : 'Capturar localização atual'}
          </button>
        </div>

        <div className="form-section">
          <h2>Urgência</h2>
          <div className="urgency-options">
            {URGENCY_LEVELS.map((v) => (
              <button type="button" key={v} className={form.urgencia === v ? `selected ${v.toLowerCase()}` : ''} onClick={() => setForm({ ...form, urgencia: v })}>{v}</button>
            ))}
          </div>
        </div>

        <div className="form-section">
          <h2>Fotos</h2>
          <PhotoUpload photos={photos} onChange={setPhotos} max={5} label="Anexar fotos" hint="Até 5 imagens da ocorrência" />
        </div>

        {message && (
          <div className="form-message"><AlertTriangle size={16} />{message}</div>
        )}
        <button className="primary-button full" disabled={saving}>
          {saving ? <Loader2 className="spin" size={18} /> : 'Salvar ocorrência'}
        </button>
      </form>
    </>
  );
}
