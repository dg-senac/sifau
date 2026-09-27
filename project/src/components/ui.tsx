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

export function Badge({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return <span className={`badge ${danger ? 'danger' : ''}`}>{children}</span>;
}

export function UrgencyBadge({ urgency }: { urgency: string }) {
  const urgent = urgency === 'Crítica' || urgency === 'Alta';
  return <span className={`urgency ${urgent ? 'urgent' : ''}`}>{urgency}</span>;
}
