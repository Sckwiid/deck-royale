import type { Dictionary } from "@/data/i18n";

interface FooterProps {
  dict: Dictionary;
}

export default function Footer({ dict }: FooterProps) {
  return (
    <footer className="section-wrap mt-12 pb-8 pt-4 sm:mt-16">
      <div className="glass-panel px-5 py-4">
        <p className="text-xs leading-relaxed text-slate-300">{dict.common.legal}</p>
      </div>
    </footer>
  );
}
