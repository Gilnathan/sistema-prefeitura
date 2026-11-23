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

  // 2. Monta o System Prompt estritamente fechado nos dados do banco + formato humano sem markdown cru
  const systemInstruction = `Você é o Analista de Dados Interno da Prefeitura Municipal de Belmonte (Bahia).

REGRAS OBRIGATÓRIAS E INEGOCIÁVEIS:
1. Responda EXCLUSIVAMENTE com base nos registros do banco de dados fornecidos abaixo dentro de <BANCO_DE_DADOS>.
2. É ESTRITAMENTE PROIBIDO usar conhecimento externo, pesquisar na internet, supor fatos ou inventar números, datas ou eventos.
3. Se a informação solicitada não existir nos registros fornecidos, diga claramente: "Não foram encontrados registros no banco de dados atual com essa informação para o filtro selecionado."
4. ESTILO DE ESCRITA HUMANA:
   - Escreva em português brasileiro natural, claro, cordial e direto, como um assessor respondendo pessoalmente ao gestor.
   - NUNCA use asteriscos (* ou **), cerquilhas (# ou ###), chaves ({}), crases, traços de separação (---) ou qualquer formatação Markdown.
   - Para relatórios gerais, contagens ou resumos (ex.: quantos atendimentos médicos, odontológicos ou pediátricos houve no período), escreva em texto corrido bem organizado em parágrafos curtos e fáceis de ler.
   - Quando listar vários itens no texto, use apenas frases naturais ou numeração simples (1., 2., 3.) sem símbolos técnicos.
5. LINKS INTERNOS DO SISTEMA:
   - Sempre inclua no campo "eventosRelacionadosIds" os IDs exatos (campo "id" do banco) de todos os eventos mencionados ou encontrados na sua resposta, para que o sistema exiba links clicáveis diretos para cada um deles.
   - Se nenhum evento específico corresponder, retorne "eventosRelacionadosIds": [].

FORMATO OBRIGATÓRIO DA RESPOSTA (JSON válido):
{
  "resposta": "Texto humano limpo, sem asteriscos, sem markdown e sem símbolos técnicos.",
  "eventosRelacionadosIds": ["id_do_evento_1", "id_do_evento_2"]
}

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

  const FALLBACK_MODELS = [
    config.model,
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
  ].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

  const requestBody = JSON.stringify({
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    contents,
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
  });

  function limparTextoHumano(raw: string): string {
    return raw
      .replace(/^#{1,6}\s*/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^\s*[-*_]{3,}\s*$/gm, "")
      .replace(/^\s*\*\s+/gm, "• ")
      .replace(/[{}]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const registrosById = new Map(registrosEstruturados.map((r) => [r.id, r]));

  try {
    let lastStatus = 502;
    let lastErrorMsg =
      "Os modelos do Google Gemini estão com alta demanda no momento. Tente novamente em instantes.";

    for (const modelName of FALLBACK_MODELS) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        modelName
      )}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

      const geminiRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
        cache: "no-store",
      });

      const data = (await geminiRes.json().catch(() => ({}))) as {
        candidates?: {
          content?: { parts?: { text?: string }[] };
        }[];
        error?: { message?: string };
      };

      if (geminiRes.ok) {
        const rawText =
          data.candidates?.[0]?.content?.parts
            ?.map((p) => p.text || "")
            .join("")
            .trim() || "";

        let respostaLimpa = "";
        let idsRelacionados: string[] = [];

        try {
          const parsedJson = JSON.parse(rawText) as {
            resposta?: string;
            eventosRelacionadosIds?: string[];
          };
          respostaLimpa = limparTextoHumano(parsedJson.resposta || "");
          if (Array.isArray(parsedJson.eventosRelacionadosIds)) {
            idsRelacionados = parsedJson.eventosRelacionadosIds;
          }
        } catch {
          respostaLimpa = limparTextoHumano(rawText);
        }

        if (!respostaLimpa) {
          respostaLimpa =
            "Não foi possível gerar uma resposta a partir dos registros do banco.";
        }

        // Resolve apenas IDs reais existentes no escopo consultado (links 100% válidos)
        const eventosRelacionados = Array.from(new Set(idsRelacionados))
          .map((id) => registrosById.get(id))
          .filter((r): r is NonNullable<typeof r> => Boolean(r))
          .map((r) => ({
            id: r.id,
            titulo: r.titulo,
            data: r.data,
            secretaria: r.secretaria,
            local: r.local,
            situacao: r.situacao,
          }));

        return NextResponse.json({
          resposta: respostaLimpa,
          eventosRelacionados,
          meta: {
            registrosAnalisados: registrosEstruturados.length,
            escopoSecretaria,
            escopoPeriodo,
            model: modelName,
          },
        });
      }

      lastStatus = geminiRes.status;
      lastErrorMsg =
        data.error?.message ||
        `Erro na API do Google Gemini (HTTP ${geminiRes.status}).`;

      // Em pico de demanda (503/429) ou modelo indisponível (404), tenta automaticamente o próximo modelo
      if (![429, 500, 503, 404].includes(geminiRes.status)) {
        break;
      }
    }

    return NextResponse.json(
      { error: lastErrorMsg },
      { status: lastStatus === 429 ? 429 : 502 }
    );
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
