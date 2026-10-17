import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

// LoginForm reads ?next= from the URL, which is only known at request time.
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-neutral-950" />}>
      <LoginForm />
    </Suspense>
  );
}
