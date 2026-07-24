import { generateQuickReviewPath } from "./quickReviewGenerator.js";

export const V2_GENERATION_STAGES = ["quickReview"];
export function activeV2GenerationStages() {
  return V2_GENERATION_STAGES;
}

export async function generateReviewPathV2(article, options = {}) {
  return generateQuickReviewPath(article, options);
}
