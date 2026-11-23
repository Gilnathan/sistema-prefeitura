import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import {
  getGeminiConfig,
  listEventos,
  listSecretarias,
} from "@/lib/firestore-repo";
import {
  formatarDataBR,
  normalizarStatusEvento,
  resolverTipoEventoEfetivo,
} from "@/lib/utils";

const querySchema = z.object({
  pergunta: z.string().trim().min(3, "Digite sua pergunta para consultar o banco.").max(1500),
  secretariaId: z.string().optional().default("TODAS"),
  ano: z.string().optional().default(""),
  mes: z.string().optional().default(""),
  situacao: z.enum(["TODAS", "REALIZADA", "FUTURA", "CANCELADA"]).optional().default("TODAS"),
  historico: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        text: z.string(),
      })
    )
    .max(10)
    .optional()
    .default([]),
});

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Acesso restrito ao administrador da agência." },
      { status: 403 }
    );
  }

  const config = await getGeminiConfig();
  if (!config?.apiKey) {
    return NextResponse.json(
      {
        error:
          "Chave da API do Google Gemini não configurada. Acesse a aba 'Configurações (API Key)' para cadastrar sua chave do Google AI Studio.",
      },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = querySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados inválidos" },
      { status: 400 }
    );
  }

  const { pergunta, secretariaId, ano, mes, situacao, historico } = parsed.data;

  // 1. Carrega SOMENTE os dados reais do Firestore conforme o filtro selecionado
  const [eventosRaw, secretarias] = await Promise.all([
    listEventos(secretariaId && secretariaId !== "TODAS" ? { secretariaId } : undefined),
    listSecretarias(),
  ]);

  const secMap = new Map(secretarias.map((s) => [s.id, s]));

  let filtrados = eventosRaw;

  if (ano && /^\d{4}$/.test(ano)) {
    const anoNum = Number(ano);
    const mesNum = mes && /^\d{1,2}$/.test(mes) ? Number(mes) : null;
    filtrados = filtrados.filter((ev) => {
      const d = new Date(ev.dataRealizacao);
      if (d.getUTCFullYear() !== anoNum) return false;
      if (mesNum && mesNum >= 1 && mesNum <= 12 && d.getUTCMonth() + 1 !== mesNum) {
        return false;
      }
      return true;
    });
  }

  const registrosEstruturados = filtrados
    .map((ev) => {
      const statusNorm = normalizarStatusEvento(ev.status);
      const tipoEfetivo = resolverTipoEventoEfetivo(ev.tipo, ev.dataRealizacao);
      const situacaoReal =
        statusNorm === "CANCELADA"
          ? "CANCELADA"
          : tipoEfetivo === "FUTURA"
          ? "FUTURA"
          : "REALIZADA";

      const sec = secMap.get(ev.secretariaId);
      const parceirasNomes = [
        ...(ev.secretariasParceirasIds || [])
          .map((id) => secMap.get(id)?.nome)
          .filter(Boolean),
        ...(ev.orgaosParceirosExternos || []),
      ];

      return {
        id: ev.id,
        titulo: ev.titulo,
        secretaria: sec?.nome || "Secretaria",
        parceiros: parceirasNomes,
        data: formatarDataBR(ev.dataRealizacao),
        local: ev.local,
        situacao: situacaoReal,
        resumo: ev.resumo,
        relatorioCompleto: ev.relatorioCompleto || "",
      };
    })
    .filter((r) => situacao === "TODAS" || r.situacao === situacao);

  const escopoSecretaria =
    secretariaId === "TODAS"
      ? "Todas as Secretarias"
      : secMap.get(secretariaId)?.nome || "Secretaria selecionada";

  const escopoPeriodo = ano
    ? mes
      ? `Mês ${String(mes).padStart(2, "0")}/${ano}`
      : `Ano ${ano}`
    : "Todo o período";

  // 2. Monta o System Prompt estritamente fechado nos dados do banco
  const systemInstruction = `Você é o Analista de Dados Interno da Prefeitura Municipal de Belmonte (Bahia).

REGRAS OBRIGATÓRIAS E INEGOCIÁVEIS:
1. Responda EXCLUSIVAMENTE com base nos registros do banco de dados fornecidos abaixo dentro de <BANCO_DE_DADOS>.
2. É ESTRITAMENTE PROIBIDO usar conhecimento externo, pesquisar na internet, supor fatos, ou inventar números, datas ou eventos que não estejam explicitamente nos registros abaixo.
3. Se a pergunta pedir informações que não existem nos registros fornecidos, responda de forma clara: "Não foram encontrados registros no banco de dados atual com essa informação para o filtro selecionado."
4. Ao fazer contagens (ex.: quantos eventos mencionam odontologia, atendimento médico, etc.), conte com precisão cirúrgica verificando os campos "titulo", "resumo" e "relatorioCompleto" de CADA registro e liste os eventos correspondentes citando **título**, **data** e **secretaria**.
5. Responda sempre em português brasileiro claro, direto, organizado em tópicos ou tabela markdown quando apropriado.

ESCOPO ATUAL DA CONSULTA:
- Secretaria: ${escopoSecretaria}
- Período: ${escopoPeriodo}
- Situação filtrada: ${situacao}
- Total de registros carregados neste escopo: ${registrosEstruturados.length}

<BANCO_DE_DADOS>
${JSON.stringify(registrosEstruturados)}
</BANCO_DE_DADOS>`;

  const contents = [
    ...historico.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.text }],
    })),
    {
      role: "user",
      parts: [{ text: pergunta }],
    },
  ];

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    config.model
  )}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  try {
    const geminiRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents,
        generationConfig: {
          temperature: 0.1,
          topP: 0.8,
          maxOutputTokens: 2048,
        },
      }),
      cache: "no-store",
    });

    const data = (await geminiRes.json().catch(() => ({}))) as {
      candidates?: {
        content?: { parts?: { text?: string }[] };
      }[];
      error?: { message?: string };
    };

    if (!geminiRes.ok) {
      return NextResponse.json(
        {
          error:
            data.error?.message ||
            `Erro na API do Google Gemini (HTTP ${geminiRes.status}).`,
        },
        { status: 502 }
      );
    }

    const resposta =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || "")
        .join("")
        .trim() ||
      "Não foi possível gerar uma resposta a partir dos registros do banco.";

    return NextResponse.json({
      resposta,
      meta: {
        registrosAnalisados: registrosEstruturados.length,
        escopoSecretaria,
        escopoPeriodo,
        model: config.model,
      },
    });
  } catch (err) {
    console.error("[GeminiIA] Falha na consulta:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erro ao consultar a API do Google Gemini.",
      },
      { status: 500 }
    );
  }
}
