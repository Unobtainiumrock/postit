import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/inbound");

  const sp = await searchParams;
  const devMode =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DEV_AUTH === "true";

  return (
    <LoginForm
      initialError={sp.error}
      inviteAccepted={sp.invite === "accepted"}
      devMode={devMode}
    />
  );
}
