import { getAuthSession } from "@/lib/auth";
import { getSystemSettings, listSecretarias } from "@/lib/firestore-repo";
import { NovoEventoForm } from "@/components/novo-evento-form";

export default async function NovoEventoPage() {
  const session = await getAuthSession();
  const isAdmin = session?.user.role === "ADMIN";

  const [secretariasRaw, settings] = await Promise.all([
    listSecretarias({ onlyActive: true }),
    getSystemSettings(),
  ]);

  // Carrega todas as secretarias ativas para ADMIN (selecionar principal) e para todos (marcar parceiras)
  const secretarias = secretariasRaw.map((s) => ({
    id: s.id,
    nome: s.nome,
    sigla: s.sigla,
  }));

  return (
    <NovoEventoForm
      isAdmin={isAdmin}
      userSecretariaId={session?.user.secretariaId ?? null}
      secretariaNome={session?.user.secretariaNome ?? null}
      secretarias={secretarias}
      permitirAcoesFuturas={settings.permitirAcoesFuturas}
      permitirEnvioVideos={settings.permitirEnvioVideos}
    />
  );
}
