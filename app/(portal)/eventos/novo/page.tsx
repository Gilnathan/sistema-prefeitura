import { getAuthSession } from "@/lib/auth";
import { listSecretarias } from "@/lib/firestore-repo";
import { NovoEventoForm } from "@/components/novo-evento-form";

export default async function NovoEventoPage() {
  const session = await getAuthSession();
  const isAdmin = session?.user.role === "ADMIN";

  // Carrega todas as secretarias ativas para ADMIN (selecionar principal) e para todos (marcar parceiras)
  const secretarias = (await listSecretarias({ onlyActive: true })).map((s) => ({
    id: s.id,
    nome: s.nome,
  }));

  return (
    <NovoEventoForm
      isAdmin={isAdmin}
      userSecretariaId={session?.user.secretariaId ?? null}
      secretariaNome={session?.user.secretariaNome ?? null}
      secretarias={secretarias}
    />
  );
}
