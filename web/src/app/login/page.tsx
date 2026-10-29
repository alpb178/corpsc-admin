import Image from 'next/image';
import { LoginForm } from './LoginForm';
import { SessionExpiredToast } from './SessionExpiredToast';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const { next, reason } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-elevated px-4">
      <div className="w-full max-w-[380px] animate-fade-up motion-reduce:animate-none">
        <div className="mb-7 flex flex-col items-center text-center">
          <Image
            src="/brand/corpsc-mark.png"
            alt=""
            width={64}
            height={64}
            priority
            className="h-16 w-16 rounded-[14px] shadow-sm ring-1 ring-line"
          />
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">CORPSC</p>
          <h1 className="font-serif-display mt-1 text-[28px] font-semibold text-fg">Hub de analítica</h1>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            Tráfico, SEO y KPIs de los sitios del grupo.
          </p>
        </div>

        <LoginForm next={next ?? '/'} />

        <p className="mt-5 text-center text-[12px] text-fg-faint">
          Panel interno. Si no tienes acceso, pídeselo a un administrador.
        </p>
      </div>

      {reason === 'expired' ? <SessionExpiredToast /> : null}
    </main>
  );
}
