/**
 * Soft, slowly drifting color glows behind a page. Purely decorative
 * (aria-hidden, no pointer events) and still when "reduce motion" is on.
 */
export function Aurora() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="animate-float-slow absolute -left-40 -top-40 size-[34rem] rounded-full bg-sky-500/20 blur-3xl" />
      <div className="animate-float absolute -right-32 top-24 size-[30rem] rounded-full bg-violet-600/20 blur-3xl [animation-delay:-3s]" />
      <div className="animate-float-slow absolute bottom-[-12rem] left-1/3 size-[28rem] rounded-full bg-fuchsia-500/10 blur-3xl [animation-delay:-6s]" />
      {/* Faint grid for depth */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
    </div>
  );
}
