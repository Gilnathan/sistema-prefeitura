import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import {
  listEventos,
  listSecretarias,
  listUsers,
} from "@/lib/firestore-repo";
import { AdminSecretariasClient } from "@/components/admin-secretarias-client";

export default async function AdminSecretariasPage() {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const [secretarias, usuarios, eventos] = await Promise.all([
    listSecretarias(),
    listUsers(),
    listEventos(),
  ]);

  const userCountBySec = new Map<string, number>();
  for (const u of usuarios) {
    if (u.secretariaId) {
      userCountBySec.set(u.secretariaId, (userCountBySec.get(u.secretariaId) ?? 0) + 1);
    }
  }

  const eventCountBySec = new Map<string, number>();
  for (const e of eventos) {
    eventCountBySec.set(e.secretariaId, (eventCountBySec.get(e.secretariaId) ?? 0) + 1);
  }

  const initialSecretarias = secretarias.map((s) => ({
    id: s.id,
    nome: s.nome,
    sigla: s.sigla,
    descricao: s.descricao,
    ativa: s.ativa,
    driveFolderId: s.driveFolderId,
    _count: {
      usuarios: userCountBySec.get(s.id) ?? 0,
      eventos: eventCountBySec.get(s.id) ?? 0,
    },
  }));

  return <AdminSecretariasClient initialSecretarias={initialSecretarias} />;
}
