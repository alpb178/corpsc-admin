// Stand-in for Next's module in this package's tests, which don't install
// Next. Each test replaces it with vi.mock; nothing here is copied to a site.
export function usePathname(): string | null {
  throw new Error('next/navigation must be mocked in the test');
}
