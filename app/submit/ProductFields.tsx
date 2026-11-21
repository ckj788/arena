import Link from "@/app/components/NavigationLink";
import PricingFields from "@/app/components/PricingFields";
import ScreenshotInput from "@/app/components/ScreenshotInput";
import { DUPLICATE_PRODUCT_MESSAGE } from "@/lib/productSafety";
import { PRICING_MODELS, PRODUCT_CATEGORY_GROUPS, type PricingModel, type ProductCategory } from "@/lib/productTaxonomy";
import type { Product } from "@/lib/mockData";
import type useProductFields from "./useProductFields";

interface Props {
  fields: ReturnType<typeof useProductFields>;
  normalizedProductUrl?: string;
  duplicateProduct?: Product;
  isPaidSubmission: boolean;
  isSubmittingProduct: boolean;
  setSubmitError: (message: string | null) => void;
}

export default function ProductFields({ fields, normalizedProductUrl, duplicateProduct, isPaidSubmission, isSubmittingProduct, setSubmitError }: Props) {
  const {
    newTitle, setNewTitle,
    newTagline, setNewTagline,
    newUrl, setNewUrl,
    newDescription, setNewDescription,
    newCategory, setNewCategory,
    newPricingModel, setNewPricingModel,
    newPricingDetails, setNewPricingDetails,
    newPlatforms, setNewPlatforms,
    newTargetAudience, setNewTargetAudience,
    newMakerStory, setNewMakerStory,
    newFeedbackRequest, setNewFeedbackRequest,
    newMaker, setNewMaker,
    newTwitter, setNewTwitter,
    newLogo, setNewLogo,
    newScreenshot, setNewScreenshot,
    setPreparingScreenshot,
  } = fields;
  return <>
    <div className="flex flex-col gap-1">
      <label htmlFor="product-title" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Product Title *</label>
      <input
        type="text"
        required
        placeholder="e.g. SiteShot 📸"
        id="product-title"
        minLength={2}
        maxLength={80}
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        className="w-full bg-zinc-50/50 border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 p-2 text-xs rounded-lg focus:bg-white focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 outline-none h-9"
      />
      <p className="text-[10px] leading-4 text-zinc-500">Use your own product name. Explain any third-party models or integrations in the description.</p>
    </div>

    <div className="flex flex-col gap-1">
      <label htmlFor="product-tagline" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">One-Sentence Tagline *</label>
      <input
        type="text"
        required
        placeholder="e.g. High-def screenshot API with full-page scrolling..."
        id="product-tagline"
        minLength={10}
        maxLength={240}
        value={newTagline}
        onChange={(e) => setNewTagline(e.target.value)}
        className="w-full bg-zinc-50/50 border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 p-2 text-xs rounded-lg focus:bg-white focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 outline-none h-9"
      />
    </div>

    <div className="flex flex-col gap-1">
      <label htmlFor="product-url" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Product website *</label>
      <input
        type="text"
        inputMode="url"
        autoCapitalize="none"
        required
        placeholder="https://siteshot.net"
        id="product-url"
        value={newUrl}
        onBlur={() => { if (normalizedProductUrl) setNewUrl(normalizedProductUrl); }}
        onChange={(e) => { setNewUrl(e.target.value); setSubmitError(null); }}
        aria-invalid={!isPaidSubmission && Boolean(duplicateProduct)}
        aria-describedby="product-url-hint"
        className="w-full bg-zinc-50/50 border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 p-2 text-xs rounded-lg focus:bg-white focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 outline-none h-9"
      />
      {duplicateProduct && isPaidSubmission ? (
        <p id="product-url-hint" className="text-sm leading-6 text-zinc-600">This website already has an Indie Clash profile. A directory service can use the existing profile; no duplicate product will be created. <Link href={`/products/${duplicateProduct.id}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">View profile ↗</Link></p>
      ) : duplicateProduct ? (
        <p id="product-url-hint" role="alert" className="text-[11px] leading-5 text-red-700">
          {DUPLICATE_PRODUCT_MESSAGE}{" "}
          <Link href={`/products/${duplicateProduct.id}`} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
            View existing product ↗
          </Link>
          <span className="block">If this is yours, edit it in Dashboard instead. Changing www, the page path or URL parameters does not create a different website.</span>
        </p>
      ) : (
        <p id="product-url-hint" className="text-[10px] leading-4 text-zinc-500">One profile per website, not per page. Changing www, the page path or URL parameters does not allow another submission.</p>
      )}
    </div>

    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="product-description" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Product Description *</label>
        <span className="font-mono text-[9px] text-zinc-500">{newDescription.length}/2000</span>
      </div>
      <textarea
        required
        minLength={80}
        maxLength={2000}
        rows={5}
        placeholder="What does it do? Who is it for? What makes it different?"
        id="product-description"
        value={newDescription}
        onChange={(e) => setNewDescription(e.target.value)}
        className="w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50/50 p-2.5 text-xs leading-5 text-zinc-900 outline-none placeholder:text-zinc-400 focus:bg-white focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
      />
      <p className="text-[10px] leading-4 text-zinc-500">80–2,000 characters. Describe a real use case.</p>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <div className="flex flex-col gap-1">
      <label htmlFor="product-category" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Primary category *</label>
      <select
        id="product-category"
        required
        value={newCategory}
        onChange={(e) => setNewCategory(e.target.value as ProductCategory | "")}
        aria-describedby="product-category-hint"
        className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50/50 p-2 text-xs text-zinc-900 outline-none focus:bg-white focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
      >
        <option value="" disabled>Select a category</option>
        {PRODUCT_CATEGORY_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
          </optgroup>
        ))}
      </select>
      <p id="product-category-hint" className="text-[10px] leading-4 text-zinc-500">Choose the main use. Your profile shows this category; the discovery feed shows its broader group.</p>
    </div>
    <div className="flex flex-col gap-1">
      <label htmlFor="product-pricing" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Pricing model *</label>
      <select
        id="product-pricing"
        required
        value={newPricingModel === "unspecified" ? "" : newPricingModel}
        onChange={(e) => setNewPricingModel(e.target.value as PricingModel)}
        className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50/50 p-2 text-xs text-zinc-900 outline-none focus:bg-white focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
      >
        <option value="" disabled>Select a pricing model</option>
        {PRICING_MODELS.filter((pricing) => pricing.value !== "unspecified").map((pricing) => <option key={pricing.value} value={pricing.value}>{pricing.label}</option>)}
      </select>
    </div>
    </div>

    <PricingFields value={newPricingDetails} onChange={setNewPricingDetails} disabled={isSubmittingProduct} />

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <label htmlFor="product-audience" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Target Audience</label>
        <input
          type="text"
          maxLength={300}
          placeholder="e.g. Solo SaaS founders"
          id="product-audience"
        value={newTargetAudience}
          onChange={(e) => setNewTargetAudience(e.target.value)}
          className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50/50 p-2 text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:bg-white focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="product-platforms" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Platforms</label>
        <input
          type="text"
          maxLength={320}
          placeholder="Web, iOS, Windows"
          id="product-platforms"
        value={newPlatforms}
          onChange={(e) => setNewPlatforms(e.target.value)}
          className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50/50 p-2 text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:bg-white focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
        />
      </div>
    </div>

    <details className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3">
      <summary className="cursor-pointer select-none text-[10px] font-semibold uppercase tracking-wider text-zinc-700">Tell the maker story (optional)</summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest" htmlFor="product-story">Why did you build it?</label>
          <textarea
            maxLength={1000}
            rows={3}
            placeholder="The problem, moment, or personal experience behind the product."
            id="product-story" value={newMakerStory}
            onChange={(e) => setNewMakerStory(e.target.value)}
            className="w-full resize-y rounded-lg border border-zinc-200 bg-white p-2.5 text-xs leading-5 text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest" htmlFor="product-feedback">What feedback would help most?</label>
          <textarea
            maxLength={500}
            rows={2}
            placeholder="e.g. Is the onboarding clear? Would this workflow save you time?"
            id="product-feedback" value={newFeedbackRequest}
            onChange={(e) => setNewFeedbackRequest(e.target.value)}
            className="w-full resize-y rounded-lg border border-zinc-200 bg-white p-2.5 text-xs leading-5 text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
          />
        </div>
      </div>
    </details>

    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="product-maker" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Maker Name *</label>
        <input
          type="text"
          required
          maxLength={80}
          placeholder="Sarah"
          id="product-maker"
        value={newMaker}
          onChange={(e) => setNewMaker(e.target.value)}
          className="w-full bg-zinc-50/50 border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 p-2 text-xs rounded-lg focus:bg-white focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 outline-none h-9"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="product-twitter" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Twitter (X)</label>
        <input
          type="text"
          placeholder="@sarah_dev"
          id="product-twitter"
        value={newTwitter}
          onChange={(e) => setNewTwitter(e.target.value)}
          className="w-full bg-zinc-50/50 border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 p-2 text-xs rounded-lg focus:bg-white focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 outline-none h-9"
        />
      </div>
    </div>

    <div className="flex flex-col gap-1">
      <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Product Logo (Max 2MB)</label>
      <div className="flex items-center space-x-4">
        <label
          htmlFor="logo-upload"
          className="cursor-pointer flex flex-col items-center justify-center border border-dashed border-zinc-300 hover:border-zinc-400 bg-zinc-50 w-16 h-16 rounded-xl transition-all relative overflow-hidden group select-none shadow-2xs"
        >
          {newLogo ? (
            newLogo.startsWith("data:image") || newLogo.startsWith("http") ? (
              <img src={newLogo} alt="Preview" className="w-full h-full object-contain p-1.5" />
            ) : (
              <span className="text-xl animate-pixel-bounce">{newLogo}</span>
            )
          ) : (
            <span className="text-xl text-zinc-400">＋</span>
          )}

          <div className="absolute inset-0 bg-zinc-900/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
            <span className="text-[9px] uppercase font-medium">Upload</span>
          </div>
        </label>

        <input
          type="file"
          id="logo-upload"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              if (file.size > 2 * 1024 * 1024) {
                alert("File size exceeds the 2MB limit!");
                e.target.value = "";
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result;
                if (result && typeof result === "string") {
                  const img = new Image();
                  img.onload = () => {
                    const canvas = document.createElement("canvas");
                    const MAX_WIDTH = 128;
                    const MAX_HEIGHT = 128;
                    let width = img.width;
                    let height = img.height;
                    if (width > height) {
                      if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                      }
                    } else {
                      if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                      }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext("2d");
                    if (ctx) {
                      ctx.drawImage(img, 0, 0, width, height);
                      const resizedBase64 = canvas.toDataURL("image/jpeg", 0.85);
                      setNewLogo(resizedBase64);
                    } else {
                      setNewLogo(result);
                    }
                  };
                  img.src = result;
                }
              };
              reader.readAsDataURL(file);
            }
          }}
          className="hidden"
        />

        <div className="text-left flex-1">
          <span className="text-[9px] font-mono text-zinc-500 uppercase block mb-0.5">Image Specs</span>
          <p className="text-[10px] text-zinc-500 leading-normal">
            PNG, JPG, or WebP image. If skipped, default 🚀 rocket booster is used.
          </p>
        </div>
      </div>
    </div>

    <ScreenshotInput value={newScreenshot} onChange={setNewScreenshot} onBusy={setPreparingScreenshot} disabled={isSubmittingProduct} />
  </>;
}
