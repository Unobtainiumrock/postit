import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id?: string;
      handle?: string;
      isAdmin?: boolean;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    /** Postgres `users.id` (UUID string) for API authorization */
    appUserId?: string;
    /** Postgres `users.handle` (short slug) */
    handle?: string;
    /** Postgres `users.is_admin` */
    isAdmin?: boolean;
  }
}
