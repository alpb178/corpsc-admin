// Only for typechecking this package, which doesn't install Next. Every site
// that receives the tracker has the real module. Not copied by `sync`.
declare module 'next/navigation' {
  export function usePathname(): string | null;
}
