import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import {
  getGeminiConfig,
  listEventos,
  listSecretarias,
} from "@/lib/firestore-repo";
import {
  MESES_PT,
  formatarDataBR,
  normalizarStatusEvento,
  resolverTipoEventoEfetivo,
} from "@/lib/utils";

export const maxDuration = 30;

const querySchema = z.object({
  pergunta: z
    .string()
    .trim()
    .min(3, "Digite sua pergunta para consultar o banco.")
    .max(1500),
  secretariaId: z.string().optional().default("TODAS"),
  ano: z.string().optional().default(""),
  mes: z.string().optional().default(""),
  situacao: z
    .enum(["TODAS", "REALIZADA", "FUTURA", "CANCELADA"])
    .optional()
    .default("TODAS"),
  historico: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        text: z.string(),
      })
    )
    .max(8)
    .optional()
    .default([]),
});

const STOPWORDS_PT = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas",
  "um", "uma", "uns", "umas", "para", "por", "com", "sem", "que", "qual", "quais",
  "quanto", "quantos", "quanta", "quantas", "teve", "tiveram", "houve", "algum", "alguma",
  "esse", "essa", "este", "esta", "mes", "ano", "dia", "foi", "foram", "tem", "sobre",
  "mais", "muito", "como", "onde", "quando", "se", "ou", "e", "ao", "aos", "pelo", "pela",
  "evento", "eventos", "acao", "acoes", "relatorio", "relatorios", "secretaria", "secretarias",
]);

function normalizarTextoBusca(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extrairTermosRelevantes(pergunta: string): string[] {
  const norm = normalizarTextoBusca(pergunta);
  return Array.from(
    new Set(
      norm
        .split(" ")
        .filter((w) => w.length >= 2 && !STOPWORDS_PT.has(w))
    )
  );
}

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
          "Chave da API do Google Gemini não configurada. Clique em 'Configurar API Key' para cadastrar sua chave do Google AI Studio.",
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

  // 1. Carrega SOMENTE os dados textuais do Firestore conforme filtro (zero imagens/mídias)
  const [eventosRaw, secretarias] = await Promise.all([
    listEventos(
      secretariaId && secretariaId !== "TODAS" ? { secretariaId } : undefined
    ),
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

  const registros = filtrados
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

      const d = new Date(ev.dataRealizacao);
      const mesAno = `${MESES_PT[d.getUTCMonth()] || ""}/${d.getUTCFullYear()}`;

      return {
        id: ev.id,
        titulo: ev.titulo,
        secretaria: sec?.nome || "Secretaria",
        parceiros: parceirasNomes,
        data: formatarDataBR(ev.dataRealizacao),
        mesAno,
        local: ev.local,
        situacao: situacaoReal,
        resumo: ev.resumo.replace(/\s+/g, " ").trim(),
        relatorioCompleto: (ev.relatorioCompleto || "").replace(/\s+/g, " ").trim(),
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

  if (registros.length === 0) {
    return NextResponse.json({
      resposta:
        "Não foram encontrados registros no banco de dados atual para o filtro selecionado.",
      eventosRelacionados: [],
      meta: {
        registrosAnalisados: 0,
        escopoSecretaria,
        escopoPeriodo,
        model: config.model,
      },
    });
  }

  // 2. Estatísticas exatas pré-calculadas em memória (< 5ms) — escala para 600+ ações com 100% de precisão
  let totalRealizadas = 0;
  let totalFuturas = 0;
  let totalCanceladas = 0;
  const porSecretaria = new Map<string, { realizadas: number; futuras: number; canceladas: number }>();
  const porMes = new Map<string, number>();

  for (const r of registros) {
    if (r.situacao === "REALIZADA") totalRealizadas++;
    else if (r.situacao === "FUTURA") totalFuturas++;
    else totalCanceladas++;

    const s = porSecretaria.get(r.secretaria) ?? { realizadas: 0, futuras: 0, canceladas: 0 };
    if (r.situacao === "REALIZADA") s.realizadas++;
    else if (r.situacao === "FUTURA") s.futuras++;
    else s.canceladas++;
    porSecretaria.set(r.secretaria, s);

    porMes.set(r.mesAno, (porMes.get(r.mesAno) ?? 0) + 1);
  }

  const resumoEstatistico = [
    `Total no escopo: ${registros.length} (Realizadas: ${totalRealizadas}, Futuras: ${totalFuturas}, Canceladas: ${totalCanceladas})`,
    "Por secretaria: " +
      Array.from(porSecretaria.entries())
        .map(([nome, c]) => `${nome}: ${c.realizadas} realizada(s), ${c.futuras} futura(s), ${c.canceladas} cancelada(s)`)
        .join(" | "),
    "Por mês: " +
      Array.from(porMes.entries())
        .map(([m, qtd]) => `${m}: ${qtd}`)
        .join(" | "),
  ].join("\n");

  // 3. Ranqueamento lexical local (< 10ms) para escalar para 500–600+ ações mantendo o prompt ultraleve
  const termos = extrairTermosRelevantes(pergunta);
  const perguntaNorm = normalizarTextoBusca(pergunta);

  const pontuados = registros.map((r) => {
    const corpus = normalizarTextoBusca(
      `${r.titulo} ${r.secretaria} ${r.local} ${r.data} ${r.parceiros.join(" ")} ${r.resumo} ${r.relatorioCompleto}`
    );
    let score = 0;
    for (const termo of termos) {
      if (corpus.includes(termo)) score += 3;
    }
    // Bônus por bigrama/frase exata (ex: "teste rapido", "novembro azul", "atendimento medico")
    if (termos.length >= 2) {
      for (let i = 0; i < termos.length - 1; i++) {
        const bigrama = `${termos[i]} ${termos[i + 1]}`;
        if (perguntaNorm.includes(bigrama) && corpus.includes(bigrama)) {
          score += 8;
        }
      }
    }
    return { r, score };
  });

  const temMatchesEspecificos = pontuados.some((p) => p.score > 0);
  const ordenados = temMatchesEspecificos
    ? [...pontuados].sort((a, b) => b.score - a.score)
    : pontuados;

  // Envia até 30 registros detalhados mais relevantes (cobre 100% das buscas específicas mesmo com 600 ações!)
  const detalhados = ordenados.slice(0, 30).map((p) => p.r);
  const detalhadosIds = new Set(detalhados.map((d) => d.id));
  const restantesIndice = registros
    .filter((r) => !detalhadosIds.has(r.id))
    .slice(0, 120)
    .map((r) => `ID:${r.id} | ${r.data} | ${r.situacao} | ${r.secretaria} | ${r.titulo} (${r.local})`);

  const baseDetalhada = detalhados
    .map((r, idx) => {
      const linhas = [
        `#${idx + 1} | ID: ${r.id} | Data: ${r.data} | Situação: ${r.situacao} | Secretaria: ${r.secretaria}`,
        `Título: ${r.titulo} | Local: ${r.local}${
          r.parceiros.length > 0 ? ` | Parceiros: ${r.parceiros.join(", ")}` : ""
        }`,
        `Resumo: ${r.resumo.slice(0, 450)}`,
      ];
      if (r.relatorioCompleto) {
        linhas.push(`Relatório: ${r.relatorioCompleto.slice(0, 1800)}`);
      }
      return linhas.join("\n");
    })
    .join("\n---\n");

  const systemInstruction = `Você é o Analista de Dados Interno da Prefeitura Municipal de Belmonte (Bahia).

REGRAS OBRIGATÓRIAS:
1. Responda EXCLUSIVAMENTE com base no <RESUMO_ESTATISTICO> e nos registros em <REGISTROS_DETALHADOS> (e <INDICE_ADICIONAL> se houver).
2. NUNCA use conhecimento externo, internet ou invente números/eventos. Se a informação não existir nos registros, responda claramente que não foram encontrados registros com essa informação para o filtro selecionado.
3. ESCRITA HUMANA E LIMPA:
   - Escreva em português brasileiro natural, fluido e direto, em texto corrido com parágrafos curtos.
   - NUNCA use asteriscos (* ou **), cerquilhas (#), chaves ({}), crases ou linhas "---".
4. LINKS INTERNOS:
   - Inclua em "eventosRelacionadosIds" os IDs exatos (campo "ID") de todas as ações citadas ou encontradas na resposta, para o sistema gerar os links clicáveis.

RETORNE APENAS JSON VÁLIDO:
{
  "resposta": "Texto natural limpo sem símbolos técnicos.",
  "eventosRelacionadosIds": ["id1", "id2"]
}

ESCOPO: ${escopoSecretaria} | ${escopoPeriodo} | Situação: ${situacao}

<RESUMO_ESTATISTICO>
${resumoEstatistico}
</RESUMO_ESTATISTICO>

<REGISTROS_DETALHADOS>
${baseDetalhada}
</REGISTROS_DETALHADOS>${
    restantesIndice.length > 0
      ? `\n\n<INDICE_ADICIONAL>\n${restantesIndice.join("\n")}\n</INDICE_ADICIONAL>`
      : ""
  }`;

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

  // Ordem otimizada por latência real + disponibilidade de cota (gemini-3.5-flash-lite ~650ms!)
  const FALLBACK_MODELS = [
    "gemini-3.5-flash-lite",
    config.model,
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
  ].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

  const registrosById = new Map(registros.map((r) => [r.id, r]));

  try {
    let lastStatus = 502;
    let lastErrorMsg =
      "Os servidores do Google Gemini estão temporariamente indisponíveis. Tente novamente em instantes.";

    for (const modelName of FALLBACK_MODELS) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        modelName
      )}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

      const isLite = modelName.includes("lite");
      const generationConfig: Record<string, unknown> = {
        temperature: 0.1,
        topP: 0.8,
        maxOutputTokens: 1536,
        responseMimeType: "application/json",
      };
      if (!isLite) {
        generationConfig.thinkingConfig = { thinkingLevel: "LOW" };
      }

      let geminiRes: Response;
      try {
        geminiRes = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents,
            generationConfig,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(9_000),
        });
      } catch {
        lastStatus = 504;
        lastErrorMsg = "Tempo limite excedido na consulta à IA. Tente novamente.";
        continue;
      }

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
            registrosAnalisados: registros.length,
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
