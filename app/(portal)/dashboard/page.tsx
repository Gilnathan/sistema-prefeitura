import { getAuthSession } from "@/lib/auth";
import { listSecretarias } from "@/lib/firestore-repo";
import { EventosListClient } from "@/components/eventos-list-client";

export default async function DashboardPage() {
  const session = await getAuthSession();
  const isAdmin = session?.user.role === "ADMIN";

  const secretarias = isAdmin
    ? (await listSecretarias()).map((s) => ({
        id: s.id,
        nome: s.nome,
        sigla: s.sigla,
      }))
    : [];

  return (
    <EventosListClient
      isAdmin={isAdmin}
      secretariaNome={session?.user.secretariaNome ?? null}
      secretarias={secretarias}
    />
  );
}
