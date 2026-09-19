"use client";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import useModalAccessibility from "./useModalAccessibility";

export default function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  useModalAccessibility(expanded, dialog, () => setExpanded(false));
  if (!images.length) return null;
  const step = (delta: number) => setActive(index => (index + delta + images.length) % images.length);
  return <section aria-label={`${title} product images`} className="mb-6" onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); step(e.key === "ArrowLeft" ? -1 : 1); } }}>
    <button type="button" onClick={() => setExpanded(true)} aria-label="Enlarge product image" className="block w-full overflow-hidden rounded-xl border border-white/10 bg-black/20 focus-visible:outline-2 focus-visible:outline-violet-400">
      <img src={images[active]} alt={`${title} product screenshot ${active + 1}`} width={1600} height={900} loading="lazy" decoding="async" className="aspect-video max-h-[600px] w-full object-contain" />
    </button>
    {images.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto pb-2">{images.map((src, i) => <button key={`${src}-${i}`} type="button" onClick={() => setActive(i)} aria-label={`View image ${i + 1}`} aria-pressed={active === i} className={`w-24 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${active === i ? "border-violet-400" : "border-transparent hover:border-white/30"}`}><img src={src} alt="" loading="lazy" className="aspect-video w-full bg-black/20 object-contain" /></button>)}</div>}
    {expanded && createPortal(<div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md" onClick={e => { if (e.target === e.currentTarget) setExpanded(false); }}><div ref={dialog} role="dialog" aria-modal="true" aria-label={`${title} image viewer`} tabIndex={-1} className="relative w-full max-w-6xl outline-none"><button type="button" onClick={() => setExpanded(false)} aria-label="Close image viewer" className="mb-3 ml-auto block rounded-lg border border-white/20 px-4 py-2 text-white">Close ×</button><img src={images[active]} alt={`${title} product screenshot ${active + 1}`} className="max-h-[75dvh] w-full object-contain" /><div className="flex items-center justify-center gap-4 py-3 text-sm text-zinc-300"><button type="button" aria-label="Previous image" onClick={() => step(-1)} disabled={images.length < 2} className="rounded-lg border border-white/10 px-4 py-2 disabled:opacity-30">←</button><span aria-live="polite">{active + 1} / {images.length}</span><button type="button" aria-label="Next image" onClick={() => step(1)} disabled={images.length < 2} className="rounded-lg border border-white/10 px-4 py-2 disabled:opacity-30">→</button></div></div></div>, document.body)}
  </section>;
}
