interface TabItem {
  id: string;
  label: string;
}

interface ResponsiveTabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
}

export default function ResponsiveTabs({ tabs, activeId, onChange }: ResponsiveTabsProps) {
  return (
    <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`h-11 min-w-[118px] snap-start rounded-xl border px-3 text-sm font-semibold transition ${
              active
                ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
                : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
