interface EmptyStateProps {
  title: string;
  description: string;
}

export default function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="glass-panel border-dashed p-5 text-center">
      <p className="font-display text-lg font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-300">{description}</p>
    </div>
  );
}
