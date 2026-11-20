import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }

  return <AppShell user={session.user}>{children}</AppShell>;
}
