import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Loader2, Navigation, RefreshCw, Settings, WifiOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CATEGORIES, Fiscal, SUBCATEGORIES, URGENCY_LEVELS } from '@/lib/types';
import { classifyByText } from '@/lib/classify';
import { PageTitle } from '@/components/ui';
import { PhotoUpload } from '@/components/PhotoUpload';
import { createQueueId, enqueue, isRecoverableSyncError } from '@/lib/offlineQueue';
import { enviarArquivos, gravarAnexos, prepararAnexos, type AnexoPreparado } from '@/lib/anexos';
import {
  abrirConfiguracoesDoAplicativo,
  capturarLocalizacao,
  emAplicativoNativo,
  type MotivoDeFalha,
} from '@/lib/geolocalizacao';

// Mensagem de cada motivo de falha, no idioma e tom do aplicativo. A de
// bloqueio difere entre APK (temos como abrir as configurações) e navegador
// (só orienta o caminho manual).
const MENSAGENS_DE_FALHA: Record<MotivoDeFalha, string> = {
  'permissao-negada':
    'Você não permitiu o acesso à localização. O formulário continua como estava — toque novamente em “Capturar localização atual” quando quiser tentar.',
  'permissao-bloqueada': emAplicativoNativo()
    ? 'O acesso à localização está bloqueado para o SIFAU neste aparelho. Toque em “Abrir configurações do aplicativo” e permita a localização “somente enquanto o aplicativo estiver em uso”; depois volte e capture novamente.'
    : 'O acesso à localização está bloqueado para este site no navegador. Libere a permissão de localização nas configurações do site (ícone ao lado do endereço) e tente novamente.',
  'gps-indisponivel':
    'Não foi possível obter a localização agora. Verifique se o serviço de localização (GPS) do aparelho está ativado e tente novamente.',
  'tempo-esgotado':
    'O GPS demorou demais para encontrar sua posição — comum em ambientes fechados. Se possível, aproxime-se de um local aberto e toque novamente.',
  'sem-suporte': 'Este aparelho não disponibilizou o serviço de localização.',
  inesperada: 'Não foi possível obter a localização. Tente novamente.',
};

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
  // Feedback da captura de localização, separado da `message` do formulário:
  // falha ou negativa de permissão não apaga nem mistura com o que o fiscal
  // já preencheu.
  const [capturandoLocal, setCapturandoLocal] = useState(false);
  const [avisoLocal, setAvisoLocal] = useState('');
  const [erroLocal, setErroLocal] = useState<{ motivo: MotivoDeFalha; detalhe?: string } | null>(null);
  // Guarda em `ref` também: cliques duplicados antes de o estado renderizar
  // não podem disparar duas caixas de permissão.
  const capturandoLocalRef = useRef(false);

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

  const capturarLocalizacaoAtual = async () => {
    // Um clique por vez: nada de duas caixas de permissão ou duas capturas.
    if (capturandoLocalRef.current) return;
    capturandoLocalRef.current = true;
    setCapturandoLocal(true);
    setErroLocal(null);
    setAvisoLocal('');

    const resultado = await capturarLocalizacao({
      // Explicação curta antes da caixa de diálogo do sistema: a localização
      // serve para identificar onde a ocorrência aconteceu.
      aoPedirPermissao: () =>
        setAvisoLocal(
          'Para identificar onde a ocorrência aconteceu, o SIFAU vai pedir acesso à sua localização — somente enquanto o aplicativo estiver em uso.',
        ),
    });

    if (resultado.ok) {
      setLocation({ lat: resultado.latitude, lng: resultado.longitude });
      setAvisoLocal(
        resultado.precisaoMetros
          ? `Localização capturada (precisão de ~${Math.round(resultado.precisaoMetros)} m). Toque no botão para atualizar.`
          : 'Localização capturada. Toque no botão para atualizar.',
      );
    } else {
      // Nada do formulário é alterado: o ponto anterior (se havia) continua.
      // O aviso de "vai pedir permissão" sai para não disputar com o erro.
      console.warn('Falha ao capturar a localização da ocorrência:', resultado);
      setAvisoLocal('');
      setErroLocal({ motivo: resultado.motivo, detalhe: resultado.detalhe });
    }
    capturandoLocalRef.current = false;
    setCapturandoLocal(false);
  };

  const abrirConfiguracoes = async () => {
    await abrirConfiguracoesDoAplicativo();
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

    // O id do registro é gerado aqui, e não pelo banco: é ele que amarra as
    // fotos ao registro antes de qualquer coisa subir (inclusive offline).
    const occurrenceId = createQueueId();
    let fotosPreparadas: AnexoPreparado[];
    try {
      fotosPreparadas = await prepararAnexos({
        fiscalId: fiscal.id,
        arquivos: photos,
        tipo: 'foto',
        momento: 'antes',
        vinculo: { ocorrencia_id: occurrenceId },
      });
    } catch (error) {
      console.error('Erro ao preparar as fotos:', error);
      setMessage('Não foi possível preparar as fotos. Remova as imagens e tente novamente.');
      setSaving(false);
      return;
    }

    const basePayload = {
      id: occurrenceId,
      fiscal_registrou: fiscal.id,
      categoria: form.categoria,
      subcategoria: form.subcategoria,
      descricao: form.descricao.trim(),
      bairro: form.bairro,
      endereco: form.endereco.trim(),
      urgencia: form.urgencia,
      latitude: location.lat,
      longitude: location.lng,
      // Caminhos no bucket, nunca o arquivo: era isto que fazia o banco encher.
      fotos: fotosPreparadas.map((foto) => foto.path),
    };

    const queue = (deadline: string) =>
      enqueue(
        'ocorrencias',
        { ...basePayload, sla_deadline: deadline },
        `Ocorrência: ${form.categoria}`,
        fotosPreparadas,
      );

    if (offline || !navigator.onLine) {
      const deadline = new Date(Date.now() + 72 * 3600000).toISOString();
      try {
        queue(deadline);
      } catch (error) {
        console.error('Não foi possível guardar a ocorrência neste aparelho:', error);
        setMessage('Não foi possível salvar offline. Libere espaço no aparelho e tente novamente.');
        setSaving(false);
        return;
      }
      setSaving(false);
      onDone();
      return;
    }

    const { data: sla } = await supabase.from('sla_config').select('prazo_horas').eq('categoria', form.categoria).maybeSingle();
    const deadline = new Date(Date.now() + (sla?.prazo_horas ?? 72) * 3600000).toISOString();

    // As fotos sobem primeiro: o registro grava caminhos, e caminho sem arquivo
    // é pior que arquivo sem registro. Se o envio falhar por qualquer motivo, a
    // ocorrência inteira vai para a fila — o fiscal não perde o que registrou.
    try {
      await enviarArquivos(fotosPreparadas);
    } catch (uploadError) {
      console.error('Erro ao enviar as fotos da ocorrência:', uploadError);
      try {
        queue(deadline);
      } catch (queueError) {
        console.error('Não foi possível guardar a ocorrência neste aparelho:', queueError);
        setMessage('Não foi possível salvar offline. Libere espaço no aparelho e tente novamente.');
        setSaving(false);
        return;
      }
      setMessage('Não foi possível enviar as fotos agora: a ocorrência ficou na fila e será enviada automaticamente.');
      setSaving(false);
      setTimeout(onDone, 1400);
      return;
    }

    const { error } = await supabase.from('ocorrencias').insert({ ...basePayload, sla_deadline: deadline });

    if (error) {
      console.error('Erro ao registrar ocorrência:', error);
      if (!isRecoverableSyncError(error)) {
        setMessage('Não foi possível salvar. Confira os campos e suas permissões e tente novamente.');
        setSaving(false);
        return;
      }
      // O mesmo ID torna seguro repetir um insert que possa ter sido confirmado
      // pelo servidor, mas cuja resposta tenha se perdido na rede.
      try {
        queue(deadline);
      } catch (queueError) {
        console.error('Não foi possível guardar a ocorrência neste aparelho:', queueError);
        setMessage('Não foi possível salvar offline. Libere espaço no aparelho e tente novamente.');
        setSaving(false);
        return;
      }
      setMessage('Sem conexão estável: a ocorrência foi salva na fila e será enviada automaticamente.');
      setSaving(false);
      setTimeout(onDone, 1400);
      return;
    }

    // Com o registro gravado, as fotos ganham descrição em `anexos`.
    await gravarAnexos(fotosPreparadas);
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
          <button
            type="button"
            className={`location-button ${location ? 'captured' : ''}`}
            onClick={capturarLocalizacaoAtual}
            disabled={capturandoLocal}
          >
            {capturandoLocal ? <Loader2 className="spin" size={18} /> : <Navigation size={18} />}
            {capturandoLocal
              ? 'Obtendo localização...'
              : location
                ? `Atualizar localização (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`
                : 'Capturar localização atual'}
          </button>
          {avisoLocal && !capturandoLocal && (
            <div className="info-message" role="status"><CheckCircle2 size={16} />{avisoLocal}</div>
          )}
          {erroLocal && (
            <div className="form-message" role="alert">
              <AlertTriangle size={16} />
              <span>
                {MENSAGENS_DE_FALHA[erroLocal.motivo]}
                {/* O detalhe técnico (mensagem do sistema) só ajuda em falha
                    inesperada; nos motivos conhecidos a orientação basta. */}
                {erroLocal.motivo === 'inesperada' && erroLocal.detalhe ? ` (${erroLocal.detalhe})` : ''}
              </span>
            </div>
          )}
          {erroLocal?.motivo === 'permissao-bloqueada' && emAplicativoNativo() && (
            <button type="button" className="ghost-button" onClick={abrirConfiguracoes}>
              <Settings size={16} /> Abrir configurações do aplicativo
            </button>
          )}
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
