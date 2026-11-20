import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { listSecretarias, listUsers } from "@/lib/firestore-repo";
import { AdminUsuariosClient } from "@/components/admin-usuarios-client";

export default async function AdminUsuariosPage() {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const [usuarios, todasSecretarias] = await Promise.all([
    listUsers(),
    listSecretarias(),
  ]);

  const secMap = new Map(todasSecretarias.map((s) => [s.id, s]));

  const initialUsuarios = usuarios.map((u) => {
    const sec = u.secretariaId ? secMap.get(u.secretariaId) : null;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      username: u.username,
      role: u.role,
      ativo: u.ativo,
      secretariaId: u.secretariaId,
      secretaria: sec
        ? { id: sec.id, nome: sec.nome, sigla: sec.sigla }
        : null,
    };
  });

  const secretariasAtivas = todasSecretarias
    .filter((s) => s.ativa)
    .map((s) => ({ id: s.id, nome: s.nome, sigla: s.sigla }));

  return (
    <AdminUsuariosClient
      initialUsuarios={initialUsuarios}
      secretarias={secretariasAtivas}
      currentUserId={session.user.id}
    />
  );
}
