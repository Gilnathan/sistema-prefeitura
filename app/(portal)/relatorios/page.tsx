import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { listSecretarias } from "@/lib/firestore-repo";
import { RelatoriosClient } from "@/components/relatorios-client";

export default async function RelatoriosPage() {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }

  const isAdmin = session.user.role === "ADMIN";

  const secretarias = isAdmin
    ? (await listSecretarias()).map((s) => ({
        id: s.id,
        nome: s.nome,
        sigla: s.sigla,
      }))
    : [];

  return (
    <RelatoriosClient
      isAdmin={isAdmin}
      secretarias={secretarias}
      userSecretariaId={session.user.secretariaId}
      userSecretariaNome={session.user.secretariaNome}
    />
  );
}
