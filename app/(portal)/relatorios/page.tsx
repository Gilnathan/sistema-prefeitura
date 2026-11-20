import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { listSecretarias } from "@/lib/firestore-repo";
import { buildRelatorioMensal } from "@/lib/data-loaders";
import { RelatoriosClient } from "@/components/relatorios-client";

export default async function RelatoriosPage() {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }

  const isAdmin = session.user.role === "ADMIN";
  const now = new Date();
  const initialMes = now.getUTCMonth() + 1;
  const initialAno = now.getUTCFullYear();

  const [secretariasRaw, initialData] = await Promise.all([
    isAdmin ? listSecretarias() : Promise.resolve([]),
    buildRelatorioMensal({
      role: session.user.role,
      userSecretariaId: session.user.secretariaId,
      mes: initialMes,
      ano: initialAno,
      requestedSecretariaId: isAdmin ? "TODAS" : session.user.secretariaId ?? undefined,
    }),
  ]);

  const secretarias = secretariasRaw.map((s) => ({
    id: s.id,
    nome: s.nome,
    sigla: s.sigla,
  }));

  return (
    <RelatoriosClient
      isAdmin={isAdmin}
      secretarias={secretarias}
      userSecretariaId={session.user.secretariaId}
      userSecretariaNome={session.user.secretariaNome}
      initialMes={initialMes}
      initialAno={initialAno}
      initialData={initialData}
    />
  );
}
