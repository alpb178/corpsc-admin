import Image from 'next/image';
import { LoginForm } from './LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-elevated px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-6">
          <Image
            src="/brand/corpsc-mark.png"
            alt=""
            width={56}
            height={56}
            priority
            className="mb-4 h-14 w-14 rounded-[12px] shadow-sm"
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">CORPSC</p>
          <h1 className="mt-1 text-[26px] font-semibold text-fg">Hub de analítica</h1>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            Tráfico, SEO y KPIs de los sitios del grupo.
          </p>
        </div>

        <LoginForm next={next ?? '/'} />

        <p className="mt-5 text-[12px] text-fg-faint">
          Panel interno. Si no tienes acceso, pídeselo a un administrador.
        </p>
      </div>
    </main>
  );
}
