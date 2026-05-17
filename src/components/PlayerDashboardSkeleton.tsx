export default function PlayerDashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="glass-panel h-28" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="glass-panel h-24" />
        <div className="glass-panel h-24" />
        <div className="glass-panel h-24" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass-panel h-64" />
        <div className="glass-panel h-64" />
      </div>
    </div>
  );
}
