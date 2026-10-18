import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div>
        <p className="text-sm font-semibold text-hanko">404</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-950">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-neutral-500">Check the link, or start a new call from the home page.</p>
      </div>
      <Link href="/" className="rounded-xl bg-neutral-950 px-5 py-2.5 font-semibold text-white hover:bg-neutral-800">
        Go home
      </Link>
    </main>
  );
}
