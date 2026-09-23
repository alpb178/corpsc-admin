export function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert" className="rounded-[6px] border border-line bg-card p-5">
      <h2 className="text-[14px] font-semibold text-fg">{title}</h2>
      <p className="mt-1.5 text-[13px] text-fg-muted">{message}</p>
    </div>
  );
}

/** An honest empty state: with no data we don't draw a zero, we explain why. */
export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="rounded-[6px] border border-dashed border-line bg-card p-8 text-center">
      <p className="text-[14px] text-fg-muted">{message}</p>
      {hint ? <p className="mx-auto mt-1.5 max-w-[46ch] text-[12px] text-fg-faint">{hint}</p> : null}
    </div>
  );
}
