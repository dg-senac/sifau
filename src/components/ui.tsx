import { ReactNode } from 'react';

export function PageTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
      </div>
      {action}
    </div>
  );
}

/**
 * Estado vazio padrão do aplicativo. Um só desenho — ícone, título e uma frase
 * de apoio em linguagem de campo — para todas as telas.
 */
export function EmptyState({
  icon,
  title,
  message,
}: {
  icon: ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="empty-state">
      {icon}
      <b>{title}</b>
      <span>{message}</span>
    </div>
  );
}

/**
 * Esqueleto de carregamento: mostra a FORMA do conteúdo enquanto os dados
 * chegam, no lugar do spinner de tela inteira. `aria-busy` avisa o leitor de
 * tela; as barras em si são decorativas.
 */
export function Skeleton({ className = 'skeleton-linha' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function SkeletonList({
  linhas = 3,
  className = 'skeleton-cartao',
  label = 'Carregando conteúdo',
}: {
  linhas?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div className="esqueleto-lista" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: linhas }, (_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </div>
  );
}

/** Esqueleto da página inteira (título + lista), usado na troca de telas. */
export function SkeletonPage({ label = 'Carregando tela' }: { label?: string }) {
  return (
    <div aria-busy="true" aria-label={label} role="status">
      <div className="page-title">
        <div>
          <Skeleton className="skeleton-linha" />
          <Skeleton className="skeleton-titulo" />
        </div>
      </div>
      <SkeletonList linhas={3} label={label} />
    </div>
  );
}

/** Aviso com ícone — o mesmo cartão de aviso em todas as telas. */
export function NoticeCard({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="notice-card">
      <div className="notice-icon">{icon}</div>
      <div>
        <b>{title}</b>
        <span>{text}</span>
      </div>
    </div>
  );
}

/** Cabeçalho de seção com ação opcional à direita. */
export function SectionHeading({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

export function Badge({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return <span className={`badge ${danger ? 'danger' : ''}`}>{children}</span>;
}

export function UrgencyBadge({ urgency }: { urgency: string }) {
  const urgent = urgency === 'Crítica' || urgency === 'Alta';
  return <span className={`urgency ${urgent ? 'urgent' : ''}`}>{urgency}</span>;
}
