import { Sparkles } from "lucide-react";
import {
  ANATOMY_AI_DISCLAIMER,
  shouldShowAnatomyAiDisclaimer,
} from "@/lib/anatomy-disclaimer";
import { cn } from "@/lib/utils";

interface AnatomyAiDisclaimerProps {
  isReviewed: boolean;
  className?: string;
}

/**
 * Exact college-approved label for AI-drafted anatomy text that has not been
 * signed off by faculty. It must be visible wherever unreviewed text is shown,
 * and it disappears only when the structure has a valid sign-off. Editing the
 * structure clears that sign-off, so the label reappears automatically.
 */
export function AnatomyAiDisclaimer({
  isReviewed,
  className,
}: AnatomyAiDisclaimerProps) {
  if (!shouldShowAnatomyAiDisclaimer(isReviewed)) return null;

  return (
    <p
      role="note"
      data-testid="anatomy-ai-disclaimer"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-xs leading-relaxed text-warning",
        className,
      )}
    >
      <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
      <span>{ANATOMY_AI_DISCLAIMER}</span>
    </p>
  );
}

export { ANATOMY_AI_DISCLAIMER };
