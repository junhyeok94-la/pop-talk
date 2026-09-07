import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { MyReviews } from "@/components/MyReviews";
import { MyPreferences } from "@/components/MyPreferences";
import { getAuthSession } from "@/lib/auth/server";

export default async function MyPage() {
  const session = await getAuthSession();
  if (!session) redirect("/");
  const { user } = session;
  return (
    <div className="mx-auto min-h-full w-full max-w-7xl bg-white dark:bg-black">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 md:px-8 md:py-12">
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">마이페이지</h1>
        <section className="mt-6 rounded-2xl bg-zinc-50 p-6 dark:bg-zinc-900">
          <p className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">{user.nickname ?? "POP TALK 회원"}</p>
          {user.email ? <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p> : null}
          {user.role ? <span className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">{user.role}</span> : null}
        </section>
        <section className="mt-10">
          <div className="mb-4">
            <h2 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">나의 영화 취향</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">선택한 취향을 바탕으로 영화를 추천해드려요.</p>
          </div>
          <MyPreferences />
        </section>
        <section className="mt-10"><h2 className="mb-4 text-xl font-extrabold text-zinc-900 dark:text-zinc-50">내가 남긴 평점</h2><MyReviews /></section>
      </main>
    </div>
  );
}
