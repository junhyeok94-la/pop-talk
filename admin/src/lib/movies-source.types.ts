/** movies-source는 server-only라 클라이언트에서 import할 수 없다. 타입만 여기서 공유한다. */
export type MovieSource = "database" | "snapshot" | "mock";
