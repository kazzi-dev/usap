"use client";

import { useState } from "react";
import { markOnboarded, useOnboarded } from "@/lib/onboarding";
import { Onboarding } from "./Onboarding";

/**
 * Shows the intro automatically on a first visit; `replay` (from the "Replay
 * the intro" link) shows it again on purpose.
 */
export function OnboardingGate({ replay, onReplayDone }: { replay?: boolean; onReplayDone?: () => void }) {
  const onboarded = useOnboarded();
  const [dismissed, setDismissed] = useState(false);
  const open = replay || (!onboarded && !dismissed);
  if (!open) return null;
  return (
    <Onboarding
      onClose={() => {
        markOnboarded();
        setDismissed(true);
        onReplayDone?.();
      }}
    />
  );
}
