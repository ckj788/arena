import { useState } from "react";
import { EMPTY_PRICING_DRAFT, type PricingDraft } from "@/lib/productPricing";
import type { ProductCategory, PricingModel } from "@/lib/productTaxonomy";

export default function useProductFields() {
  const [newTitle, setNewTitle] = useState("");
  const [newTagline, setNewTagline] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState<ProductCategory | "">("");
  const [newPricingModel, setNewPricingModel] = useState<PricingModel>("unspecified");
  const [newPricingDetails, setNewPricingDetails] = useState<PricingDraft>({ ...EMPTY_PRICING_DRAFT });
  const [newPlatforms, setNewPlatforms] = useState("");
  const [newTargetAudience, setNewTargetAudience] = useState("");
  const [newMakerStory, setNewMakerStory] = useState("");
  const [newFeedbackRequest, setNewFeedbackRequest] = useState("");
  const [newMaker, setNewMaker] = useState("");
  const [newTwitter, setNewTwitter] = useState("");
  const [newLogo, setNewLogo] = useState("🚀");
  const [newScreenshot, setNewScreenshot] = useState<string[]>([]);
  const [preparingScreenshot, setPreparingScreenshot] = useState(false);
  return {
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
    preparingScreenshot, setPreparingScreenshot,
  };
}
