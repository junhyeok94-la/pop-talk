export const AUTH_OPEN_EVENT = "pop-talk:open-auth";

export type AuthUser = {
  id: string | null;
  email: string | null;
  nickname: string | null;
  role: string | null;
};
