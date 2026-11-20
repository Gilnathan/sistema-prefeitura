import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { listSecretarias } from "@/lib/firestore-repo";
import { queryEventosPaginados } from "@/lib/data-loaders";
import { EventosListClient } from "@/components/eventos-list-client";

export default async function DashboardPage() {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }

  const isAdmin = session.user.role === "ADMIN";

  const [secretariasRaw, initialData] = await Promise.all([
    isAdmin ? listSecretarias() : Promise.resolve([]),
    queryEventosPaginados({
      role: session.user.role,
      userSecretariaId: session.user.secretariaId,
      page: 1,
      pageSize: 10,
    }),
  ]);

  const secretarias = secretariasRaw.map((s) => ({
    id: s.id,
    nome: s.nome,
    sigla: s.sigla,
  }));

  return (
    <EventosListClient
      isAdmin={isAdmin}
      secretariaNome={session.user.secretariaNome ?? null}
      secretarias={secretarias}
      initialData={initialData}
    />
  );
}
