import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import FeedTabs from "@/components/FeedTabs";
import NewPostButton from "@/components/NewPostButton";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <>
      <header className="sticky top-0 z-30 px-4 pt-4">
        <div className="liquid-glass px-4 py-3 flex items-center gap-4 flex-wrap">
          <Link href="/inbound" className="text-lg font-semibold mr-auto tracking-tight">
            postit
          </Link>
          <FeedTabs isAdmin={!!session.user.isAdmin} />
          <div className="text-xs text-white/60 whitespace-nowrap">
            @{session.user.handle}
          </div>
        </div>
      </header>
      <main className="p-4 pb-32 max-w-7xl mx-auto">{children}</main>
      <NewPostButton />
    </>
  );
}
