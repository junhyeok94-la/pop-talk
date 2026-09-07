"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useId, useState, type FormEvent } from "react";
import { AUTH_OPEN_EVENT, type AuthUser } from "@/lib/auth/types";
import {
  DISPLAY_CATEGORY_OPTIONS,
  type DisplayCategoryId,
} from "@/lib/display-categories";

type AuthMode = "login" | "signup";
type FormState = { pending: boolean; error: string | null };
const initialState: FormState = { pending: false, error: null };

export function AuthControls({ user }: { user: AuthUser | null }) {
  const [mode, setMode] = useState<AuthMode | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();
  const titleId = useId();

  useEffect(() => {
    function openLogin() { setMode("login"); }
    window.addEventListener(AUTH_OPEN_EVENT, openLogin);
    return () => window.removeEventListener(AUTH_OPEN_EVENT, openLogin);
  }, []);

  useEffect(() => {
    if (!mode) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleEscape(event: KeyboardEvent) { if (event.key === "Escape") setMode(null); }
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [mode]);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setLoggingOut(false);
    router.push("/");
    router.refresh();
  }

  if (user) {
    return (
      <div className="flex items-center gap-1.5 md:gap-2">
        <Link href="/mypage" className="rounded-lg px-3 py-2 text-xs font-bold text-zinc-700 transition-colors hover:bg-zinc-100 md:px-4 md:text-sm dark:text-zinc-200 dark:hover:bg-zinc-800">
          마이페이지
        </Link>
        <button type="button" disabled={loggingOut} onClick={logout} className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 md:px-4 md:text-sm dark:bg-zinc-100 dark:text-zinc-900">
          {loggingOut ? "로그아웃 중" : "로그아웃"}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1.5 md:gap-2">
        <button type="button" onClick={() => setMode("login")} className="rounded-lg px-3 py-2 text-xs font-bold text-zinc-700 transition-colors hover:bg-zinc-100 md:px-4 md:text-sm dark:text-zinc-200 dark:hover:bg-zinc-800">로그인</button>
        <button type="button" onClick={() => setMode("signup")} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-amber-700 md:px-4 md:text-sm">회원가입</button>
      </div>
      {mode ? createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center md:p-6" onClick={() => setMode(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white px-5 pb-8 pt-6 shadow-2xl md:max-w-md md:rounded-3xl md:p-8 dark:bg-zinc-950" onClick={(event) => event.stopPropagation()}>
            <div className="mb-6 flex items-start justify-between gap-4">
              <div><p className="text-sm font-bold text-amber-600 dark:text-amber-400">POP TALK</p><h2 id={titleId} className="mt-1 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">{mode === "login" ? "다시 만나서 반가워요" : "취향 탐색을 시작해요"}</h2></div>
              <button type="button" onClick={() => setMode(null)} aria-label="닫기" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-2xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">×</button>
            </div>
            <div className="mb-6 grid grid-cols-2 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
              <AuthTab active={mode === "login"} onClick={() => setMode("login")}>로그인</AuthTab>
              <AuthTab active={mode === "signup"} onClick={() => setMode("signup")}>회원가입</AuthTab>
            </div>
            {mode === "login" ? <LoginForm onSuccess={() => { setMode(null); router.refresh(); }} onSignup={() => setMode("signup")} /> : <SignupForm onSuccess={() => { setMode(null); router.refresh(); }} onLogin={() => setMode("login")} />}
          </section>
        </div>, document.body) : null}
    </>
  );
}

function AuthTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-lg px-3 py-2.5 text-sm font-bold ${active ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50" : "text-zinc-500 dark:text-zinc-400"}`}>{children}</button>;
}

function LoginForm({ onSuccess, onSignup }: { onSuccess: () => void; onSignup: () => void }) {
  const [state, setState] = useState(initialState);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState({ pending: true, error: null });
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) return setState({ pending: false, error: typeof result.error === "string" ? result.error : "로그인에 실패했습니다." });
    onSuccess();
  }
  return <form onSubmit={submit} className="flex flex-col gap-4"><Field label="이메일" type="email" name="email" placeholder="name@example.com" autoComplete="email" /><Field label="비밀번호" type="password" name="password" placeholder="비밀번호 입력" autoComplete="current-password" />{state.error ? <FormError>{state.error}</FormError> : null}<SubmitButton pending={state.pending}>로그인</SubmitButton><p className="text-center text-sm text-zinc-500 dark:text-zinc-400">계정이 없나요? <button type="button" onClick={onSignup} className="font-bold text-amber-700 hover:underline dark:text-amber-400">회원가입</button></p></form>;
}

function SignupForm({ onSuccess, onLogin }: { onSuccess: () => void; onLogin: () => void }) {
  const [state, setState] = useState(initialState);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<DisplayCategoryId[]>([]);

  function toggleCategory(id: DisplayCategoryId) {
    setSelectedCategoryIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState({ pending: true, error: null });
    const form = new FormData(event.currentTarget); const password = String(form.get("password"));
    if (password !== form.get("password-confirm")) return setState({ pending: false, error: "비밀번호가 일치하지 않습니다." });
    const credentials = {
      nickname: form.get("nickname"),
      email: form.get("email"),
      password,
      movie_category_ids: selectedCategoryIds,
    };
    const registered = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) }).catch(() => null);
    const registerResult = registered ? await registered.json().catch(() => ({})) : {};
    if (!registered?.ok) return setState({ pending: false, error: typeof registerResult.error === "string" ? registerResult.error : "회원가입에 실패했습니다." });
    const loggedIn = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: credentials.email, password }) });
    if (!loggedIn.ok) return setState({ pending: false, error: "가입은 완료됐습니다. 로그인 탭에서 로그인해주세요." });
    onSuccess();
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="닉네임" type="text" name="nickname" placeholder="2자 이상 입력" autoComplete="nickname" minLength={2} />
      <Field label="이메일" type="email" name="email" placeholder="name@example.com" autoComplete="email" />
      <Field label="비밀번호" type="password" name="password" placeholder="8자 이상 입력" autoComplete="new-password" minLength={8} />
      <Field label="비밀번호 확인" type="password" name="password-confirm" placeholder="비밀번호 다시 입력" autoComplete="new-password" minLength={8} />

      <fieldset className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <legend className="text-sm font-extrabold text-zinc-800 dark:text-zinc-200">어떤 영화를 좋아하세요?</legend>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">좋아하는 취향을 여러 개 선택할 수 있어요.</p>
          </div>
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">{selectedCategoryIds.length}개 선택</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {DISPLAY_CATEGORY_OPTIONS.map((taste) => {
            const selected = selectedCategoryIds.includes(taste.id);
            return (
              <button
                key={taste.code}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleCategory(taste.id)}
                className={`rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${selected
                  ? "border-amber-500 bg-amber-500 text-white shadow-sm"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-amber-300 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                <span aria-hidden className="mr-1">{selected ? "✓" : "+"}</span>
                {taste.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-6 text-zinc-600 dark:text-zinc-300"><input type="checkbox" required className="mt-1 h-4 w-4 accent-amber-600" />이용약관 및 개인정보 처리방침에 동의합니다.</label>
      {state.error ? <FormError>{state.error}</FormError> : null}
      <SubmitButton pending={state.pending}>회원가입</SubmitButton>
      <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">이미 계정이 있나요? <button type="button" onClick={onLogin} className="font-bold text-amber-700 hover:underline dark:text-amber-400">로그인</button></p>
    </form>
  );
}

function Field({ label, ...props }: { label: string; type: "text" | "email" | "password"; name: string; placeholder: string; autoComplete: string; minLength?: number }) {
  return <label className="flex flex-col gap-2 text-sm font-bold text-zinc-800 dark:text-zinc-200">{label}<input {...props} required className="h-12 rounded-xl border border-zinc-200 bg-white px-4 font-normal text-zinc-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50" /></label>;
}
function FormError({ children }: { children: string }) { return <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{children}</p>; }
function SubmitButton({ children, pending }: { children: string; pending: boolean }) { return <button type="submit" disabled={pending} className="mt-1 h-12 rounded-xl bg-amber-600 font-extrabold text-white hover:bg-amber-700 disabled:cursor-wait disabled:opacity-60">{pending ? "처리 중..." : children}</button>; }
