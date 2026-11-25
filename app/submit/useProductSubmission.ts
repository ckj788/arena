import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import useModalAccessibility from "@/app/components/useModalAccessibility";
import type { Product } from "@/lib/mockData";
import { ApiRequestError, authenticatedJson, submitArenaProduct, updateArenaProduct, uploadArenaLogo } from "@/lib/arenaApi";
import { saveProducts } from "@/lib/arenaStore";
import { supabase } from "@/lib/supabaseClient";
import { EMPTY_SERVICE_DETAILS, getSubmissionPlan, launchOrderDashboardPath, SUBMISSION_PAGE_DRAFT_KEY, type SubmissionPlanId, type SubmissionServiceDetails } from "@/lib/submissionPlans";
import { EMPTY_PRICING_DRAFT, normalizeProductPricing, pricingDraftValue, productPricingError, type PricingDraft } from "@/lib/productPricing";
import { PRICING_MODELS, PRODUCT_CATEGORIES, type PricingModel, type ProductCategory } from "@/lib/productTaxonomy";
import { DUPLICATE_PRODUCT_MESSAGE, findProductWithSameDomain } from "@/lib/productSafety";
import { normalizeProductWebsite } from "@/lib/productWebsite";
import { OAUTH_RESTORE_EVENT } from "@/lib/browserOAuth";
import useProductFields from "./useProductFields";

export const OAUTH_SUBMIT_DRAFT_KEY = "indieclash_oauth_submit_draft_v1";

interface Options {
  submissionPlan: SubmissionPlanId | undefined;
  paidOrderId: string | undefined;
  initialSubmissionDraft: Record<string, unknown> | null | undefined;
  userLoggedIn: boolean;
  mockUserTwitter: string;
  userSupabaseId: string;
  products: Product[];
  setProducts: (value: Product[]) => void;
  retryOwnership: () => void;
  syncCloudData: () => Promise<void>;
  isSyncLockedRef: React.RefObject<boolean>;
  publicRevisionRef: React.RefObject<number>;
  setIsAuthOpen: (open: boolean) => void;
  synthClick: (frequency: number, type: OscillatorType, duration: number, volume?: number) => void;
  pushToast: (message: string, type?: "success" | "info") => void;
  onPublished: (product: Product) => void;
}

export default function useProductSubmission({
  submissionPlan, paidOrderId, initialSubmissionDraft, userLoggedIn, mockUserTwitter, userSupabaseId,
  products, setProducts, retryOwnership, syncCloudData, isSyncLockedRef, publicRevisionRef,
  setIsAuthOpen, synthClick, pushToast, onPublished,
}: Options) {
  const router = useRouter();
  const selectedSubmissionPlan = getSubmissionPlan(submissionPlan);
  const isSubmissionPage = Boolean(selectedSubmissionPlan);
  const isPaidSubmission = Boolean(selectedSubmissionPlan?.price);
  const submissionDraftKey = paidOrderId ? `${SUBMISSION_PAGE_DRAFT_KEY}:${paidOrderId}` : SUBMISSION_PAGE_DRAFT_KEY;
  const submitDialogRef = useRef<HTMLDivElement | null>(null);
  // Submit Drawer State
  const [isSubmitOpen, setIsSubmitOpen] = useState(isSubmissionPage);
  const [serviceDetails, setServiceDetails] = useState<SubmissionServiceDetails>({ ...EMPTY_SERVICE_DETAILS });
  const [submitSource, setSubmitSource] = useState<'home' | 'console'>('home');
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const submitPendingRef = useRef(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fields = useProductFields();
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
    preparingScreenshot,
  } = fields;
  const normalizedProductUrl = normalizeProductWebsite(newUrl);
  const duplicateProduct = useMemo(
    () => normalizedProductUrl ? findProductWithSameDomain(products, normalizedProductUrl, editingProduct) : undefined,
    [products, normalizedProductUrl, editingProduct],
  );

  const productFormDraft = () => ({
    title: newTitle, tagline: newTagline, url: newUrl, description: newDescription,
    category: newCategory, pricingModel: newPricingModel, pricingDetails: newPricingDetails,
    editingProductId: editingProduct?.id, platforms: newPlatforms,
    targetAudience: newTargetAudience, makerStory: newMakerStory, feedbackRequest: newFeedbackRequest,
    maker: newMaker, twitter: newTwitter, logo: newLogo, screenshot: newScreenshot,
    source: submitSource, serviceDetails, plan: submissionPlan,
  });

  const saveSubmissionDraft = () => {
    try {
      sessionStorage.setItem(submissionDraftKey, JSON.stringify(productFormDraft()));
      return true;
    } catch {
      setSubmitError("This browser could not save your draft. Keep this page open, or remove large images and try again.");
      return false;
    }
  };

  const uploadSubmissionImages = async (draft: { logo: string; screenshot: string[] }) => {
    const results = await Promise.allSettled([draft.logo, ...draft.screenshot].map(uploadArenaLogo));
    // Preserve successful uploads even if another image failed, so retrying
    // does not upload the same files again or overwrite edits made meanwhile.
    const logoResult = results[0];
    if (logoResult.status === "fulfilled") setNewLogo(current => current === draft.logo ? logoResult.value : current);
    setNewScreenshot(current => current.map((image, index) => {
      const result = results[index + 1];
      return image === draft.screenshot[index] && result?.status === "fulfilled" ? result.value : image;
    }));
    const urls = results.map(result => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    });
    return { logo: urls[0], screenshot: urls.slice(1) };
  };

  const savePaidDraft = async () => {
    if (!paidOrderId || submitPendingRef.current || preparingScreenshot) return false;
    submitPendingRef.current = true;
    setIsSavingDraft(true);
    setSubmitError(null);
    try {
      const draft = productFormDraft();
      const { logo, screenshot } = await uploadSubmissionImages(draft);
      await authenticatedJson(`/api/payments/orders/${paidOrderId}/draft`, { ...draft, logo, screenshot }, "PUT");
      pushToast("Saved. You can continue in Dashboard.");
      return true;
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Your draft could not be saved. Please retry.";
      setSubmitError(message);
      pushToast(message, "info");
      return false;
    } finally {
      submitPendingRef.current = false;
      setIsSavingDraft(false);
    }
  };

  const returnToDashboard = async () => {
    if (paidOrderId ? await savePaidDraft() : saveSubmissionDraft()) {
      router.push(paidOrderId ? launchOrderDashboardPath(paidOrderId) : "/?view=console");
    }
  };

  const changeSubmissionPlan = () => {
    if (paidOrderId) void returnToDashboard();
    else if (saveSubmissionDraft()) router.push("/submit");
  };

  useEffect(() => {
    let restoreTimer: number | undefined;
    const restoreUi = () => {
    const params = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const isOAuthCallback = params.has("code") || ["error", "error_code", "error_description"].some(key => params.has(key) || fragment.has(key));
    // Wait for the code exchange before consuming the draft/return context.
    if (isOAuthCallback) return;
    const shouldOpenFromQuery = params.get("submit") === "1";
    const shouldSignIn = params.get("signin") === "1";
    const shouldRestoreConsole = params.get("view") === "console";
    let savedDraft: string | null = null;
    try { savedDraft = sessionStorage.getItem(isSubmissionPage ? submissionDraftKey : OAUTH_SUBMIT_DRAFT_KEY); } catch { /* Storage may be restricted. */ }
    let restoredDraft: Record<string, unknown> | null = initialSubmissionDraft ?? null;

    if (!restoredDraft && savedDraft) {
      try {
        restoredDraft = JSON.parse(savedDraft) as Record<string, unknown>;
      } catch {
        // A malformed browser draft should never prevent the page from loading.
      }
    }

    if (!shouldOpenFromQuery && !restoredDraft && !shouldRestoreConsole && !shouldSignIn) return;

    if (!isSubmissionPage && shouldOpenFromQuery && !restoredDraft?.editingProductId) {
      if (restoredDraft) {
        try { sessionStorage.setItem(SUBMISSION_PAGE_DRAFT_KEY, JSON.stringify(restoredDraft)); sessionStorage.removeItem(OAUTH_SUBMIT_DRAFT_KEY); } catch { /* Leave the original draft available. */ }
      }
      router.replace(restoredDraft ? "/submit/details?plan=free" : "/submit");
      return;
    }

    restoreTimer = window.setTimeout(() => {
      if (shouldSignIn) { setIsAuthOpen(true); params.delete("signin"); }
      if (restoredDraft) {
        const draft = restoredDraft;
        setNewTitle(typeof draft.title === "string" ? draft.title : "");
        setNewTagline(typeof draft.tagline === "string" ? draft.tagline : "");
        setNewUrl(typeof draft.url === "string" ? draft.url : "");
        setNewDescription(typeof draft.description === "string" ? draft.description : "");
        setNewCategory(PRODUCT_CATEGORIES.some((item) => item.value === draft.category) ? draft.category as ProductCategory : "");
        setNewPricingModel(PRICING_MODELS.some((item) => item.value === draft.pricingModel) ? draft.pricingModel as PricingModel : "unspecified");
        if (draft.pricingDetails && typeof draft.pricingDetails === "object") {
          const savedPricing = draft.pricingDetails as Record<string, unknown>;
          setNewPricingDetails(Object.fromEntries(Object.keys(EMPTY_PRICING_DRAFT).map(key => [key, typeof savedPricing[key] === "string" ? savedPricing[key] : ""])) as unknown as PricingDraft);
        }
        if (!paidOrderId && typeof draft.editingProductId === "string") setEditingProduct({ id: draft.editingProductId } as Product);
        setNewPlatforms(typeof draft.platforms === "string" ? draft.platforms : "");
        setNewTargetAudience(typeof draft.targetAudience === "string" ? draft.targetAudience : "");
        setNewMakerStory(typeof draft.makerStory === "string" ? draft.makerStory : "");
        setNewFeedbackRequest(typeof draft.feedbackRequest === "string" ? draft.feedbackRequest : "");
        setNewMaker(typeof draft.maker === "string" ? draft.maker : "");
        setNewTwitter(typeof draft.twitter === "string" ? draft.twitter : "");
        setNewLogo(typeof draft.logo === "string" ? draft.logo : "🚀");
        setNewScreenshot(Array.isArray(draft.screenshot) ? draft.screenshot.filter((item): item is string => typeof item === "string").slice(0, 5) : typeof draft.screenshot === "string" && draft.screenshot ? [draft.screenshot] : []);
        setSubmitSource(draft.source === "console" ? "console" : "home");
        if (isSubmissionPage && draft.serviceDetails && typeof draft.serviceDetails === "object") {
          const details = draft.serviceDetails as Record<string, unknown>;
          setServiceDetails({
            email: typeof details.email === "string" ? details.email : "",
            history: details.history === "none" || details.history === "provided" || details.history === "unsure" ? details.history : "",
            directories: typeof details.directories === "string" ? details.directories : "",
            consent: details.consent === true,
          });
        }
      }
      if (shouldOpenFromQuery || savedDraft) setIsSubmitOpen(true);
      if (!isSubmissionPage) {
        try { sessionStorage.removeItem(OAUTH_SUBMIT_DRAFT_KEY); } catch { /* Optional draft storage. */ }
      }
    if (shouldOpenFromQuery) params.delete("submit");

    const remainingQuery = params.toString();
    const cleanUrl = `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", cleanUrl);
    }, 0);
    };
    restoreUi();
    window.addEventListener(OAUTH_RESTORE_EVENT, restoreUi);
    return () => {
      if (restoreTimer !== undefined) window.clearTimeout(restoreTimer);
      window.removeEventListener(OAUTH_RESTORE_EVENT, restoreUi);
    };
  }, [initialSubmissionDraft, isSubmissionPage, paidOrderId, router, submissionDraftKey, setIsAuthOpen]);

  const resetProductForm = () => {
    setNewTitle("");
    setNewTagline("");
    setNewUrl("");
    setNewDescription("");
    setNewCategory("");
    setNewPricingModel("unspecified");
    setNewPricingDetails({ ...EMPTY_PRICING_DRAFT });
    setNewPlatforms("");
    setNewTargetAudience("");
    setNewMakerStory("");
    setNewFeedbackRequest("");
    setNewMaker("");
    setNewTwitter("");
    setNewLogo("🚀");
    setNewScreenshot([]);
  };


  const closeSubmitModal = () => {
    if (isSubmittingProduct) return;
    if (isSubmissionPage) { changeSubmissionPlan(); return; }
    setSubmitError(null);
    setIsSubmitOpen(false);
    setEditingProduct(null);
  };

  useModalAccessibility(isSubmitOpen && !isSubmissionPage, submitDialogRef, closeSubmitModal);

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setSubmitSource("console");
    setSubmitError(null);
    setNewTitle(product.title);
    setNewTagline(product.tagline);
    setNewUrl(product.url);
    setNewDescription(product.description || "");
    setNewCategory(product.category || "");
    setNewPricingModel(product.pricingModel || "unspecified");
    setNewPricingDetails(product.pricingDetails ? { ...product.pricingDetails } : { ...EMPTY_PRICING_DRAFT });
    setNewPlatforms(product.platforms?.join(", ") || "");
    setNewTargetAudience(product.targetAudience || "");
    setNewMakerStory(product.makerStory || "");
    setNewFeedbackRequest(product.feedbackRequest || "");
    setNewMaker(product.makerName);
    setNewTwitter(product.makerTwitter);
    setNewLogo(product.logo || "🚀");
    setNewScreenshot(product.screenshots ?? (product.screenshot ? [product.screenshot] : []));
    setIsSubmitOpen(true);
  };

  function preserveOAuthDraft() {
    try {
      sessionStorage.setItem(isSubmissionPage ? submissionDraftKey : OAUTH_SUBMIT_DRAFT_KEY, JSON.stringify(productFormDraft()));
      return true;
    } catch {
      setSubmitError("Your draft is too large for this browser to preserve during sign-in. Remove the images, sign in, then add them again. Your current form has not been cleared.");
      return false;
    }
  }

  // Onboard Submission
  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitPendingRef.current || preparingScreenshot) return;
    setSubmitError(null);
    if (!newCategory) { setSubmitError("Please choose a primary category."); return; }
    if (newPricingModel === "unspecified") { setSubmitError("Please choose a pricing model."); return; }
    if (!newMaker.trim()) { setSubmitError("Please enter the maker name."); return; }

    if (isPaidSubmission) {
      if (!(e.currentTarget as HTMLFormElement).reportValidity()) return;
      if (!normalizedProductUrl) { setSubmitError("Please enter a valid public website URL."); return; }
      if (newDescription.trim().length < 80) { setSubmitError("Please describe the product in at least 80 characters."); return; }
      if (serviceDetails.history === "provided" && !serviceDetails.directories.trim()) { setSubmitError("Please include your previous directory submissions, or choose another answer."); return; }
      const pricingError = productPricingError(pricingDraftValue(newPricingDetails), newPricingModel);
      if (pricingError) { setSubmitError(pricingError); return; }
      if (!paidOrderId) { setSubmitError("A confirmed paid order is required before adding product details."); return; }
      submitPendingRef.current = true;
      setIsSubmittingProduct(true);
      try {
        const { logo, screenshot: screenshots } = await uploadSubmissionImages({ logo: newLogo, screenshot: newScreenshot });
        const input = {
          title: newTitle, tagline: newTagline, url: normalizedProductUrl, description: newDescription,
          makerName: newMaker.trim(), makerTwitter: newTwitter || "@anonymous",
          logo, screenshots, category: newCategory || undefined, pricingModel: newPricingModel,
          pricingDetails: pricingDraftValue(newPricingDetails) ? normalizeProductPricing(newPricingDetails) : null,
          platforms: newPlatforms.split(",").map(item => item.trim()).filter(Boolean), targetAudience: newTargetAudience,
          makerStory: newMakerStory, feedbackRequest: newFeedbackRequest,
        };
        await authenticatedJson(`/api/payments/orders/${paidOrderId}/details`, { product: input, serviceDetails }, "PUT");
        try { sessionStorage.removeItem(submissionDraftKey); } catch { /* Optional browser draft. */ }
        router.replace(launchOrderDashboardPath(paidOrderId));
      } catch (failure) {
        if (failure instanceof ApiRequestError && failure.code === "details_already_received") {
          try { sessionStorage.removeItem(submissionDraftKey); } catch { /* Optional browser draft. */ }
          router.replace(launchOrderDashboardPath(paidOrderId));
          return;
        }
        setSubmitError(failure instanceof Error ? failure.message : "Could not save your details. Your paid order remains available in Dashboard.");
      } finally { submitPendingRef.current = false; setIsSubmittingProduct(false); }
      return;
    }

    if (!userLoggedIn) {
      const message = "Please link and verify your Google or GitHub identity before submitting.";
      synthClick(150, "sawtooth", 0.12);
      setSubmitError(message);
      setIsAuthOpen(true);
      return;
    }
    if (!newTitle || !newTagline || !newUrl || !newDescription) {
      const message = "Please fill in the title, tagline, URL, and description.";
      synthClick(150, "sawtooth", 0.12);
      setSubmitError(message);
      return;
    }
    if (!normalizedProductUrl) {
      setSubmitError("Please enter a valid public website URL, such as https://example.com.");
      return;
    }
    if (duplicateProduct) {
      setSubmitError(DUPLICATE_PRODUCT_MESSAGE);
      return;
    }
    if (newDescription.trim().length < 80) {
      setSubmitError("Please describe the product in at least 80 characters so visitors can understand what makes it useful.");
      return;
    }

    const pricingDraft = pricingDraftValue(newPricingDetails);
    const pricingError = productPricingError(pricingDraft, newPricingModel);
    if (pricingError) {
      setSubmitError(pricingError);
      return;
    }
    const pricingDetails = pricingDraft ? normalizeProductPricing(pricingDraft) : null;

    const normalizedUrl = normalizedProductUrl;

    isSyncLockedRef.current = true;
    publicRevisionRef.current += 1;
    submitPendingRef.current = true;
    setIsSubmittingProduct(true);
    try {
      let newProd: Product;
      const makerName = newMaker.trim();
      const makerTwitter = newTwitter ? (newTwitter.startsWith("@") ? newTwitter : `@${newTwitter}`) : "@anonymous";
      const makerAvatar = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=faces";

      if (supabase) {
        const uploadedLogo = await uploadArenaLogo(newLogo);
        setNewLogo(uploadedLogo);
        const uploadedScreenshot = [...newScreenshot];
        for (let i = 0; i < uploadedScreenshot.length; i++) {
          uploadedScreenshot[i] = await uploadArenaLogo(uploadedScreenshot[i]);
          setNewScreenshot([...uploadedScreenshot]);
        }
        const input = {
          title: newTitle,
          tagline: newTagline,
          url: normalizedUrl,
          makerName,
          makerTwitter,
          makerAvatar,
          logo: uploadedLogo,
          screenshot: uploadedScreenshot[0] || "",
          screenshots: uploadedScreenshot,
          description: newDescription,
          category: newCategory || undefined,
          pricingModel: newPricingModel,
          ...(pricingDetails || editingProduct ? { pricingDetails } : {}),
          platforms: newPlatforms.split(",").map((item) => item.trim()).filter(Boolean),
          targetAudience: newTargetAudience,
          makerStory: newMakerStory,
          feedbackRequest: newFeedbackRequest,
        };
        newProd = editingProduct
          ? await updateArenaProduct(editingProduct.id, input)
          : await submitArenaProduct(input);
      } else {
        let parsedSlug = newTitle.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
        try {
          const host = new URL(normalizedUrl).hostname.toLowerCase().replace(/^www\./, "");
          parsedSlug = host.split(".")[0].replace(/[^a-z0-9-]/g, "") || parsedSlug;
        } catch {}
        if (!parsedSlug) parsedSlug = `product-${Date.now()}`;
        let uniqueSlug = parsedSlug;
        while (products.some(p => p.id.toLowerCase() === uniqueSlug.toLowerCase())) {
          uniqueSlug = `${parsedSlug}-${Math.random().toString(36).slice(2, 8)}`;
        }
        newProd = {
          ...(editingProduct || {}),
          id: editingProduct?.id || uniqueSlug,
          title: newTitle,
          tagline: newTagline,
          url: normalizedUrl,
          makerName,
          makerTwitter,
          makerAvatar: `${makerAvatar}#creator=${encodeURIComponent(mockUserTwitter)}&uid=${encodeURIComponent(userSupabaseId)}&pushed=false`,
          logo: newLogo,
          screenshot: newScreenshot[0],
          screenshots: newScreenshot,
          submittedAt: editingProduct?.submittedAt || new Date().toISOString(),
          queueStatus: editingProduct?.queueStatus || "waiting",
          votesCount: editingProduct?.votesCount || 0,
          creatorUsername: mockUserTwitter,
          creator_uid: userSupabaseId,
          arenaEnqueued: editingProduct?.arenaEnqueued || false,
          description: newDescription,
          category: newCategory || undefined,
          pricingModel: newPricingModel,
          pricingDetails: pricingDetails || undefined,
          platforms: newPlatforms.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean),
          targetAudience: newTargetAudience || undefined,
          makerStory: newMakerStory || undefined,
          feedbackRequest: newFeedbackRequest || undefined,
          publishedAt: editingProduct?.publishedAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          qualifiedImpressions: editingProduct?.qualifiedImpressions || 0,
          exposureStatus: editingProduct?.exposureStatus || "new",
        };
      }

      const updated = editingProduct
        ? products.map((product) => product.id === editingProduct.id ? newProd : product)
        : [...products, newProd];
      synthClick(600, "sine", 0.15, 0.06);
      setProducts(updated);
      if (!supabase) saveProducts(updated);
      if (supabase) retryOwnership();

      if (!supabase && typeof window !== "undefined") {
        try {
          const myIds = JSON.parse(localStorage.getItem("my_arena_products") || "[]");
          if (!myIds.includes(newProd.id)) myIds.push(newProd.id);
          localStorage.setItem("my_arena_products", JSON.stringify(myIds));
        } catch {}
      }

      const wasEditing = Boolean(editingProduct);
      resetProductForm();
      setSubmitError(null);
      setIsSubmitOpen(false);
      setEditingProduct(null);
      if (isSubmissionPage) {
        try { sessionStorage.removeItem(SUBMISSION_PAGE_DRAFT_KEY); } catch { /* Optional browser draft. */ }
        router.push(`/products/${encodeURIComponent(newProd.id)}`);
      } else if (wasEditing) {
        pushToast("Product profile updated!", "success");
      } else {
        onPublished(newProd);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit this product.";
      setSubmitError(message);
      pushToast(message, "info");
    } finally {
      submitPendingRef.current = false;
      setIsSubmittingProduct(false);
      isSyncLockedRef.current = false;
      if (supabase) void syncCloudData();
    }
  };

  return { fields, isSubmitOpen, setIsSubmitOpen, submitSource, submitPendingRef, isSubmittingProduct, isSavingDraft,
    returnToDashboard, changeSubmissionPlan, openEditProduct, closeSubmitModal, submitDialogRef, editingProduct,
    submitError, setSubmitError, serviceDetails, setServiceDetails, normalizedProductUrl, duplicateProduct,
    preparingScreenshot, savePaidDraft, saveSubmissionDraft, preserveOAuthDraft, handleSubmitProduct };
}
