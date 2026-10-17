import { Suspense } from "react";
import { RoomClient } from "./RoomClient";

// The room id is only known at request time, so the client part (which reads
// it with useParams) renders inside a Suspense boundary.
export default function RoomPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-neutral-950" />}>
      <RoomClient />
    </Suspense>
  );
}
