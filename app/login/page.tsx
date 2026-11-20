import { isFirebaseConfigured } from "@/lib/firebase-admin";
import { DEFAULT_LOGIN_SLIDES, listLoginSlides } from "@/lib/firestore-repo";
import { LoginClient, type LoginSlideItem } from "@/components/login-client";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  let slides: LoginSlideItem[] = DEFAULT_LOGIN_SLIDES.map((s, idx) => ({
    id: `default-${idx}`,
    titulo: s.titulo,
    imageUrl: s.imageUrl,
  }));

  if (isFirebaseConfigured()) {
    try {
      const stored = await listLoginSlides();
      if (stored.length > 0) {
        slides = stored.map((s) => ({
          id: s.id,
          titulo: s.titulo,
          imageUrl: s.imageUrl,
        }));
      }
    } catch (err) {
      console.error("[LoginPage] Fallback para slides padrão:", err);
    }
  }

  return <LoginClient slides={slides} />;
}
