import { useEffect, useRef, useState } from 'react';
import { Eraser, ShieldCheck, Upload, FileText, Info, CheckCircle, XCircle } from 'lucide-react';
import { signaturesApi, fileUtils } from '@/lib/documents';

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
  onSignatureComplete?: (signatureData: {
    assinatura: string;
    certificado?: string;
    certificadoValido?: boolean;
    metadata?: any;
  }) => void;
  enableCertificate?: boolean;
  fiscalId?: string;
  documentoId?: string;
}

interface CertificateData {
  certificado: string;
  emissor: string;
  validadeInicio: string;
  validadeFim: string;
}

export function SignaturePad({ 
  onChange, 
  onSignatureComplete,
  enableCertificate = false,
  fiscalId,
  documentoId,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [showCertificate, setShowCertificate] = useState(false);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificateData, setCertificateData] = useState<CertificateData | null>(null);
  const [certificateValid, setCertificateValid] = useState<boolean | null>(null);
  const [loadingCert, setLoadingCert] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [signatureTimestamp, setSignatureTimestamp] = useState<Date | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#173a6b';
    }
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    const { x, y } = point(e);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    const { x, y } = point(e);
    ctx?.lineTo(x, y);
    ctx?.stroke();
    setEmpty(false);
  };

  const end = async () => {
    drawing.current = false;
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      onChange(dataUrl);
      setSignatureTimestamp(new Date());

      // Se tiver certificado digital, salvar assinatura completa
      if (enableCertificate && certificateData && fiscalId) {
        try {
          const dispositivoInfo = signaturesApi.captureDeviceInfo();
          const ipAddress = await signaturesApi.captureIP();

          const assinaturaData = {
            fiscal_id: fiscalId,
            documento_id: documentoId || null,
            assinatura_data: dataUrl,
            certificado_digital: certificateData.certificado,
            certificado_emissor: certificateData.emissor,
            certificado_validade_inicio: certificateData.validadeInicio,
            certificado_validade_fim: certificateData.validadeFim,
            ip_address: ipAddress,
            dispositivo_info: dispositivoInfo,
          };

          const assinatura = await signaturesApi.create(assinaturaData);

          if (onSignatureComplete) {
            onSignatureComplete({
              assinatura: dataUrl,
              certificado: certificateData.certificado,
              certificadoValido: assinatura.certificado_valido,
              metadata: {
                assinaturaId: assinatura.id,
                hash: assinatura.hash_documento,
                timestamp: assinatura.criado_em,
                dispositivo: dispositivoInfo,
                ip: ipAddress,
              },
            });
          }
        } catch (error) {
          console.error('Erro ao salvar assinatura digital:', error);
        }
      } else if (onSignatureComplete) {
        onSignatureComplete({
          assinatura: dataUrl,
          metadata: {
            timestamp: new Date().toISOString(),
          },
        });
      }
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    onChange(null);
    setSignatureTimestamp(null);
  };

  const handleCertificateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCertificateFile(file);
    setLoadingCert(true);

    try {
      // Validar tamanho do arquivo
      if (!fileUtils.validateFileSize(file, 10)) {
        throw new Error('Arquivo de certificado muito grande. Máximo: 10MB');
      }

      // Simular leitura do certificado (em produção seria validação real)
      const certData = await file as any;
      
      // Extrair informações do certificado (simulado)
      const mockCertificateData: CertificateData = {
        certificado: await fileUtils.fileToBase64(file, false), // Não comprimir certificado
        emissor: 'Autoridade Certificadora Digital',
        validadeInicio: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        validadeFim: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      };

      setCertificateData(mockCertificateData);
      
      // Validar certificado
      const { data: valid } = await signaturesApi.validate({
        fiscal_id: fiscalId || '',
        documento_id: documentoId || null,
        assinatura_data: '',
        certificado_digital: mockCertificateData.certificado,
        certificado_valido: false,
        certificado_emissor: mockCertificateData.emissor,
        certificado_validade_inicio: mockCertificateData.validadeInicio,
        certificado_validade_fim: mockCertificateData.validadeFim,
        hash_documento: null,
        ip_address: null,
        dispositivo_info: {},
        criado_em: new Date().toISOString(),
      });

      setCertificateValid(valid.isValid);
    } catch (error) {
      console.error('Erro ao processar certificado:', error);
      setCertificateValid(false);
      alert(error instanceof Error ? error.message : 'Erro ao processar certificado');
    } finally {
      setLoadingCert(false);
    }
  };

  return (
    <div className="signature-pad-wrap">
      <div className="signature-header">
        <div className="signature-title">
          <span>Assinatura Digital</span>
          {enableCertificate && (
            <button
              className="info-button"
              onClick={() => setShowInfo(!showInfo)}
            >
              <Info size={16} />
            </button>
          )}
        </div>
        
        {enableCertificate && (
          <button
            className="certificate-toggle"
            onClick={() => setShowCertificate(!showCertificate)}
          >
            <ShieldCheck size={16} />
            {showCertificate ? 'Ocultar' : 'Adicionar'} Certificado
          </button>
        )}
      </div>

      {showInfo && (
        <div className="signature-info">
          <p>
            <strong>Assinatura Digital Avançada:</strong> Você pode assinar digitalmente 
            com ou sem certificado digital. Com certificado, a assinatura tem validade 
            jurídica garantida e é rastreável.
          </p>
        </div>
      )}

      {showCertificate && enableCertificate && (
        <div className="certificate-section">
          <div className="certificate-upload">
            <label className="upload-label">
              <Upload size={16} />
              <span>Carregar Certificado Digital</span>
              <input
                type="file"
                accept=".p12,.pfx,.cer,.crt"
                onChange={handleCertificateUpload}
                style={{ display: 'none' }}
              />
            </label>
            
            {loadingCert && (
              <div className="loading-cert">
                <span>Validando certificado...</span>
              </div>
            )}

            {certificateData && (
              <div className={`certificate-status ${certificateValid ? 'valid' : 'invalid'}`}>
                {certificateValid ? (
                  <CheckCircle size={16} />
                ) : (
                  <XCircle size={16} />
                )}
                <span>
                  {certificateValid ? 'Certificado Válido' : 'Certificado Inválido'}
                </span>
                {certificateFile && (
                  <span className="cert-file-name">{certificateFile.name}</span>
                )}
              </div>
            )}
          </div>

          {certificateData && (
            <div className="certificate-details">
              <div className="cert-detail">
                <FileText size={14} />
                <span>Emissor: {certificateData.emissor}</span>
              </div>
              <div className="cert-detail">
                <Info size={14} />
                <span>
                  Válido até: {new Date(certificateData.validadeFim).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="signature-canvas"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      {empty && <span className="signature-placeholder">Assine aqui com o dedo</span>}
      
      <div className="signature-footer">
        <button type="button" className="ghost-button small signature-clear" onClick={clear}>
          <Eraser size={13} /> Limpar
        </button>
        
        {signatureTimestamp && (
          <span className="signature-timestamp">
            Assinado em: {signatureTimestamp.toLocaleString('pt-BR')}
          </span>
        )}
        
        {certificateValid && (
          <span className="signature-badge valid">
            <ShieldCheck size={12} />
            Certificado Digital
          </span>
        )}
      </div>
    </div>
  );
}
