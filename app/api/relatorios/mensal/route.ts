import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { buildRelatorioMensal } from "@/lib/data-loaders";

export async function GET(req: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const ano = Number(searchParams.get("ano") || now.getUTCFullYear());
  const mes = Number(searchParams.get("mes") || now.getUTCMonth() + 1);
  const requestedSecretariaId = searchParams.get("secretariaId") || "TODAS";

  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return NextResponse.json({ error: "Ano inválido" }, { status: 400 });
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Mês inválido" }, { status: 400 });
  }

  const report = await buildRelatorioMensal({
    role: session.user.role,
    userSecretariaId: session.user.secretariaId,
    mes,
    ano,
    requestedSecretariaId,
  });

  return NextResponse.json(report);
}
