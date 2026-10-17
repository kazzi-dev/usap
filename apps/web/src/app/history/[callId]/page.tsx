import { Suspense } from "react";
import { CallDetailClient } from "./CallDetailClient";

// The call id is only known at request time (see the room page for the same pattern).
export default function CallDetailPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-neutral-950" />}>
      <CallDetailClient />
    </Suspense>
  );
}
