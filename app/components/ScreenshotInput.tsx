"use client";
import { useEffect, useRef, useState } from "react";
import { trustedProductImageUrl } from "@/lib/site";

export default function ScreenshotInput({ value, onChange, onBusy, disabled = false }: { value: string[]; onChange: (value: string[]) => void; onBusy: (busy: boolean) => void; disabled?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const task = useRef(0);
  useEffect(() => { const token = task; return () => { token.current++; onBusy(false); }; }, [onBusy]);
  const uploadDisabled = disabled || busy || value.length >= 5;
  return <div className="space-y-3">
    <div className="block text-xs font-semibold uppercase tracking-wider text-zinc-700">Product images (optional) · {value.length}/5
      <span className="block mt-1 text-xs normal-case font-normal text-zinc-500">Up to 5 images · 5 MB each · Product detail page only</span>
      <div className={`mt-2 flex min-h-14 items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 normal-case ${uploadDisabled ? "opacity-50" : ""}`}>
        <label htmlFor="product-images-input" className={`rounded-md bg-white border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-800 shadow-2xs transition-colors ${uploadDisabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-zinc-50"}`}>
          {busy ? "Preparing images…" : "Choose images"}
        </label>
        <span className="text-xs font-normal text-zinc-500" aria-live="polite">
          {value.length === 0 ? "No images selected" : `${value.length} of 5 images selected`}
        </span>
      </div>
      <input id="product-images-input" type="file" multiple disabled={uploadDisabled} accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={async event => {
        const files = Array.from(event.target.files || []); event.target.value = ""; if (!files.length) return;
        if (value.length + files.length > 5) { setError("You can upload no more than 5 images."); return; }
        const id = ++task.current; setError(""); onBusy(true); setBusy(true);
        const next = [...value];
        let bitmap: ImageBitmap | undefined;
        try {
          for (const file of files) {
          if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5_000_000) throw new Error("Choose a PNG, JPG or WebP image under 5 MB.");
          bitmap = await createImageBitmap(file);
          if (bitmap.width * bitmap.height > 40_000_000) throw new Error("Image dimensions are too large.");
          const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
          const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
          const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Unable to prepare image.");
          ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          let result = canvas.toDataURL("image/jpeg", 0.85);
          if (result.length > 1_300_000) result = canvas.toDataURL("image/jpeg", 0.65);
          if (result.length > 1_300_000) throw new Error("Image is too detailed. Choose a smaller screenshot.");
          bitmap.close(); bitmap = undefined;
          if (id !== task.current) return;
          next.push(result);
          }
          if (id === task.current) onChange(next);
        } catch (e) { if (id === task.current) setError(e instanceof Error ? e.message : "Unable to read image."); }
        finally { bitmap?.close(); if (id === task.current) { onBusy(false); setBusy(false); } }
      }} />
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{value.map((src, index) => <div key={`${index}-${src.slice(-32)}`} className="min-w-0 rounded-lg border border-zinc-200 bg-white p-2 shadow-2xs">
      <img src={src.startsWith("data:image/jpeg;base64,") ? src : trustedProductImageUrl(src)} alt={`Product image ${index + 1} preview`} className="aspect-video w-full rounded object-contain bg-zinc-50" />
      <div className="mt-2 flex justify-between text-xs text-zinc-600">
        <button type="button" disabled={disabled || busy || index === 0} aria-label={`Move image ${index + 1} earlier`} onClick={() => { const next = [...value]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }} className="p-2 disabled:opacity-25 hover:text-zinc-950">←</button>
        <button type="button" disabled={disabled || busy} aria-label={`Remove image ${index + 1}`} onClick={() => { onChange(value.filter((_, i) => i !== index)); setError(""); }} className="p-2 hover:text-red-600">Remove</button>
        <button type="button" disabled={disabled || busy || index === value.length - 1} aria-label={`Move image ${index + 1} later`} onClick={() => { const next = [...value]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange(next); }} className="p-2 disabled:opacity-25 hover:text-zinc-950">→</button>
      </div>
    </div>)}</div>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
  </div>;
}
