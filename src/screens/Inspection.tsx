import { FormEvent, lazy, useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, RefreshCw, ChevronRight, ClipboardList, Clock3,
  Loader2, MapPin, Navigation, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ACTIONS, Fiscal, Occurrence } from '@/lib/types';
import { OCCURRENCE_COLUMNS } from '@/lib/columns';
import { PageTitle, EmptyState, Badge, NoticeCard, SkeletonList } from '@/components/ui';
import { PhotoUpload } from '@/components/PhotoUpload';
import { createQueueId, enqueueBatch, isRecoverableSyncError } from '@/lib/offlineQueue';
import { enviarArquivos, gravarAnexos, prepararAnexos, type AnexoPreparado } from '@/lib/anexos';
const AutoInfracaoForm = lazy(() => import('@/screens/AutoInfracao').then((module) => ({ default: module.AutoInfracaoForm })));

export function Inspection({ fiscal }: { fiscal: Fiscal | null }) {
  const [items, setItems] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Occurrence | null>(null);
  const [erro, setErro] = useState('');
  const [autoFor, setAutoFor] = useState<{ item: Occurrence; valorMulta: number; numeroProcesso: string } | null>(null);

  const fiscalId = fiscal?.id;
  const load = useCallback(async () => {
    if (!fiscalId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true); setErro('');
    const { data, error } = await supabase
      .from('ocorrencias').select(OCCURRENCE_COLUMNS)
      .eq('fiscal_registrou', fiscalId)
      .not('status', 'in', '(Resolvida,Arquivada)')
      .order('sla_deadline');
    if (error) setErro('Não foi possível carregar suas vistorias. Verifique a conexão e a atualização de privacidade do banco.');
    setItems(data ?? []);
    setLoading(false);
  }, [fiscalId]);

  useEffect(() => { void load(); }, [load]);

  if (autoFor) {
    return (
      <AutoInfracaoForm
        item={autoFor.item}
        fiscal={fiscal}
        valorMultaSugerido={autoFor.valorMulta}
        numeroProcesso={autoFor.numeroProcesso}
        onClose={() => { setAutoFor(null); load(); }}
      />
    );
  }

  if (active) {
    return (
      <InspectionForm
        item={active}
        fiscal={fiscal}
        onClose={(auto) => {
          setActive(null);
          load();
          if (auto) setAutoFor({ item: active, valorMulta: auto.valorMulta, numeroProcesso: auto.numeroProcesso });
        }}
      />
    );
  }

  return (
    <>
      <PageTitle eyebrow="Operação" title="Minha fila de vistorias"
        action={<button className="icon-button light" disabled={loading} aria-label="Atualizar minhas vistorias" onClick={() => void load()}><RefreshCw size={18} /></button>} />
      <NoticeCard
        icon={<Navigation size={19} />}
        title="Vistorias dos seus registros"
        text="Suas ocorrências ainda não encerradas aparecem aqui. Não é necessário receber uma atribuição para iniciar a vistoria."
      />
      {erro ? <p className="form-message" role="alert">{erro}</p> : loading ? (
        <SkeletonList linhas={3} label="Carregando fila de vistorias" />
      ) : items.length === 0 ? (
        <EmptyState icon={<ClipboardList size={28} />} title="Fila limpa" message="Você não tem ocorrências próprias pendentes de vistoria. Registre uma ocorrência no Início." />
      ) : (
        <div className="inspection-list">
          {items.map((item) => (
            <article className="inspection-card" key={item.id}>
              <div>
                <span className="eyebrow">{item.categoria}</span>
                <h3>{item.descricao}</h3>
                <span className="card-meta"><MapPin size={14} />{item.endereco}</span>
                <div className="inspection-sla">
                  <Clock3 size={13} />
                  {new Date(item.sla_deadline).getTime() < Date.now() ? 'SLA estourado' : `SLA ${new Date(item.sla_deadline).toLocaleDateString('pt-BR')}`}
                </div>
              </div>
              <div className="inspection-actions">
                <button className="primary-button small" onClick={() => setActive(item)}>
                  Iniciar <ChevronRight size={16} />
                </button>

              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function InspectionForm({
  item,
  fiscal,
  onClose,
}: {
  item: Occurrence;
  fiscal: Fiscal | null;
  onClose: (auto?: { valorMulta: number; numeroProcesso: string }) => void;
}) {
  const [laudo, setLaudo] = useState('');
  const [acao, setAcao] = useState<string>('Sem ação');
  const [valorMulta, setValorMulta] = useState('');
  const [numeroProcesso, setNumeroProcesso] = useState('');
  const [arrival, setArrival] = useState<{ lat: number; lng: number; time: Date } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  const registerArrival = () => {
    if (!navigator.geolocation) { setMessage('Seu aparelho não disponibilizou a localização.'); return; }
    setMessage('Obtendo localização...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setArrival({ lat: pos.coords.latitude, lng: pos.coords.longitude, time: new Date() });
        setMessage('');
      },
      (error) => {
        let errorMsg = 'Não foi possível obter a localização.';
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = 'Permita o acesso à localização nas configurações do aparelho.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMsg = 'Localização indisponível. Verifique o GPS.';
        } else if (error.code === error.TIMEOUT) {
          errorMsg = 'Tempo esgotado ao obter localização. Tente novamente.';
        }
        setMessage(errorMsg);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!arrival) { setMessage('Registre a chegada antes de finalizar a vistoria.'); return; }
    if (laudo.trim().length < 10) { setMessage('Escreva um laudo com pelo menos 10 caracteres.'); return; }
    if (photos.length < 1) { setMessage('Anexe pelo menos 1 foto "depois".'); return; }
    if (!fiscal) return;
    setSaving(true);
    setMessage('');

    const vistoriaId = createQueueId();
    let fotosPreparadas: AnexoPreparado[];
    try {
      fotosPreparadas = await prepararAnexos({
        fiscalId: fiscal.id,
        arquivos: photos,
        tipo: 'foto_depois',
        momento: 'depois',
        vinculo: { vistoria_id: vistoriaId },
      });
    } catch (error) {
      console.error('Erro ao preparar as fotos da vistoria:', error);
      setMessage('Não foi possível preparar as fotos. Remova as imagens e tente novamente.');
      setSaving(false);
      return;
    }

    const vistoriaPayload = {
      id: vistoriaId,
      ocorrencia_id: item.id,
      fiscal_id: fiscal.id,
      chegada_at: arrival.time.toISOString(),
      chegada_latitude: arrival.lat,
      chegada_longitude: arrival.lng,
      laudo: laudo.trim(),
      acao_tomada: acao,
      valor_multa: acao === 'Multa' ? parseFloat(valorMulta) || 0 : null,
      numero_processo: acao === 'Multa' ? numeroProcesso : null,
      // Caminhos no bucket. O RPC `complete_inspection` continua exigindo de 1 a
      // 5 fotos — o que mudou é que agora ele recebe o caminho, não o arquivo.
      fotos_depois: fotosPreparadas.map((foto) => foto.path),
    };
    const newStatus = acao === 'Sem ação' || acao === 'Orientação' ? 'Resolvida' : acao === 'Encaminhamento' ? 'Escalonada' : 'Resolvida';
    const queueInspection = () => enqueueBatch([
      { table: 'vistorias', op: 'insert', payload: vistoriaPayload, label: `Vistoria: ${item.categoria}`, uploads: fotosPreparadas },
      { table: 'ocorrencias', op: 'update', match: { id: item.id }, payload: { status: newStatus }, label: 'Atualização de status' },
    ]);

    if (!navigator.onLine) {
      try {
        queueInspection();
      } catch (error) {
        console.error('Não foi possível guardar a vistoria neste aparelho:', error);
        setMessage('Não foi possível salvar a vistoria offline. Libere espaço no aparelho e tente novamente.');
        setSaving(false);
        return;
      }
      setSaving(false);
      onClose(acao === 'Multa' ? { valorMulta: parseFloat(valorMulta) || 0, numeroProcesso } : undefined);
      return;
    }

    // Fotos primeiro, pelo mesmo motivo da ocorrência: a vistoria grava caminhos.
    try {
      await enviarArquivos(fotosPreparadas);
    } catch (uploadError) {
      console.error('Erro ao enviar as fotos da vistoria:', uploadError);
      try {
        queueInspection();
      } catch (queueError) {
        console.error('Não foi possível guardar a vistoria neste aparelho:', queueError);
        setMessage('Não foi possível salvar a vistoria offline. Libere espaço no aparelho e tente novamente.');
        setSaving(false);
        return;
      }
      setMessage('Não foi possível enviar as fotos agora: a vistoria ficou na fila e será enviada automaticamente.');
      setSaving(false);
      setTimeout(() => onClose(acao === 'Multa' ? { valorMulta: parseFloat(valorMulta) || 0, numeroProcesso } : undefined), 1400);
      return;
    }

    const { error: completionError } = await supabase.rpc('complete_inspection', {
      p_vistoria_id: vistoriaPayload.id,
      p_occurrence_id: item.id,
      p_fiscal_id: fiscal.id,
      p_arrival_at: arrival.time.toISOString(),
      p_arrival_latitude: arrival.lat,
      p_arrival_longitude: arrival.lng,
      p_laudo: laudo.trim(),
      p_acao_tomada: acao,
      p_valor_multa: acao === 'Multa' ? parseFloat(valorMulta) || 0 : null,
      p_numero_processo: acao === 'Multa' ? numeroProcesso : null,
      p_fotos_depois: vistoriaPayload.fotos_depois,
      p_status: newStatus,
      p_note: `Vistoria realizada. Ação: ${acao}.`,
    });

    if (completionError) {
      console.error('Erro ao concluir vistoria:', completionError);
      if (isRecoverableSyncError(completionError)) {
        try {
          queueInspection();
          setMessage('Sem conexão estável: vistoria e atualização foram salvas na fila para sincronização.');
          setSaving(false);
          setTimeout(() => onClose(acao === 'Multa' ? { valorMulta: parseFloat(valorMulta) || 0, numeroProcesso } : undefined), 1400);
        } catch (queueError) {
          console.error('Não foi possível guardar a vistoria neste aparelho:', queueError);
          setMessage('Não foi possível salvar a vistoria offline. Libere espaço no aparelho e tente novamente.');
          setSaving(false);
        }
      } else {
        setMessage('Não foi possível concluir a vistoria. Verifique seus dados e permissões.');
        setSaving(false);
      }
      return;
    }

    // Com a vistoria gravada pelo RPC, as fotos ganham descrição em `anexos`.
    // O vínculo já existe, então a política de INSERT da tabela aprova.
    await gravarAnexos(fotosPreparadas);
    setSaving(false);
    onClose(acao === 'Multa' ? { valorMulta: parseFloat(valorMulta) || 0, numeroProcesso } : undefined);
  };

  return (
    <>
      <PageTitle eyebrow="Vistoria em andamento" title={item.categoria}
        action={<button className="icon-button light" onClick={() => onClose()}><X size={20} /></button>} />
      <div className="occurrence-detail">
        <p>{item.descricao}</p>
        <div className="card-meta">
          <span><MapPin size={14} />{item.endereco}</span>
          <span><Clock3 size={14} />SLA {new Date(item.sla_deadline).toLocaleDateString('pt-BR')}</span>
        </div>
        <Badge>{item.status}</Badge>
      </div>

      <form className="form-card" onSubmit={submit}>
        <div className="form-section">
          <h2>Chegada ao local</h2>
          <button type="button" className={`location-button ${arrival ? 'captured' : ''}`} onClick={registerArrival}>
            <Navigation size={18} />
            {arrival ? `Chegada registrada às ${arrival.time.toLocaleTimeString('pt-BR')}` : 'Registrar chegada com GPS'}
          </button>
        </div>

        <div className="form-section">
          <h2>Laudo da vistoria</h2>
          <label>
            Laudo
            <textarea required minLength={10} value={laudo} onChange={(e) => setLaudo(e.target.value)} placeholder="Descreva o que encontrou no local..." />
          </label>
          <label>
            Ação tomada
            <select value={acao} onChange={(e) => setAcao(e.target.value)}>
              {ACTIONS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          {acao === 'Multa' && (
            <>
              <label>
                Valor da multa (R$)
                <input type="number" step="0.01" required value={valorMulta} onChange={(e) => setValorMulta(e.target.value)} placeholder="0,00" />
              </label>
              <label>
                Número do processo
                <input required value={numeroProcesso} onChange={(e) => setNumeroProcesso(e.target.value)} placeholder="Nº do processo" />
              </label>
            </>
          )}
        </div>

        <div className="form-section">
          <h2>Fotos "depois"</h2>
          <PhotoUpload photos={photos} onChange={setPhotos} max={5} minRequired={1} label="Anexar foto" hint="Mínimo 1 foto obrigatória" />
        </div>

        {message && <div className="form-message"><AlertTriangle size={16} />{message}</div>}
        <button className="primary-button full" disabled={saving}>
          {saving ? <Loader2 className="spin" size={18} /> : 'Finalizar vistoria'}
        </button>
      </form>
    </>
  );
}
