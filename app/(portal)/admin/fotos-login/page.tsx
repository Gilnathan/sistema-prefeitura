import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { listLoginSlides } from "@/lib/firestore-repo";
import { AdminLoginSlidesClient } from "@/components/admin-login-slides-client";

export default async function AdminFotosLoginPage() {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const slides = await listLoginSlides();

  return <AdminLoginSlidesClient initialSlides={slides} />;
}
