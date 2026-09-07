import Link from "next/link";
import { AuthControls } from "@/components/AuthControls";
import { getAuthSession } from "@/lib/auth/server";

/** 상단 헤더 — POP TALK 팝콘 로고 + 워드마크 */
export async function AppHeader() {
  const session = await getAuthSession();
  return (
    <header className="sticky top-0 z-20 border-b border-black/5 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-black/80">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 md:px-8 md:py-4 lg:px-10">
        <Link href="/" className="flex items-center gap-2 md:gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt=""
            aria-hidden
            width={36}
            height={36}
            className="h-8 w-8 md:h-9 md:w-9"
          />
          <span className="text-xl font-extrabold tracking-tight text-amber-500 md:text-2xl">
            POP TALK
          </span>
        </Link>
        <AuthControls user={session?.user ?? null} />
      </div>
    </header>
  );
}
