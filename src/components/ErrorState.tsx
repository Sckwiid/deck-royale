interface ErrorStateProps {
  title: string;
  description: string;
  actionLabel: string;
  onRetry: () => void;
}

export default function ErrorState({ title, description, actionLabel, onRetry }: ErrorStateProps) {
  return (
    <div className="glass-panel border border-rose-300/25 bg-rose-400/10 p-5">
      <p className="font-display text-lg font-semibold text-rose-100">{title}</p>
      <p className="mt-2 text-sm text-rose-100/90">{description}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 h-11 rounded-lg border border-rose-200/40 px-4 text-sm font-semibold text-rose-100 transition hover:bg-rose-200/15"
      >
        {actionLabel}
      </button>
    </div>
  );
}
