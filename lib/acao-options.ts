import type { PublicoModo, TurnoAcao } from "@/lib/types";
import { formatarDataBR } from "@/lib/utils";

export const TURNOS_OPTIONS: { value: TurnoAcao; label: string }[] = [
  { value: "MANHA", label: "Manhã" },
  { value: "TARDE", label: "Tarde" },
  { value: "NOITE", label: "Noite" },
];

export const PUBLICO_ESTIMATIVA_OPTIONS = [
  "Menos de 50 pessoas",
  "50 a 100 pessoas",
  "Mais de 100 pessoas",
  "Mais de 300 pessoas",
  "Mais de 500 pessoas",
  "Mais de 1.000 pessoas",
] as const;

export const SERVICOS_SAUDE_PADRAO = [
  "Atendimento Médico (Clínico Geral)",
  "Atendimento Odontológico",
  "Enfermagem / Triagem",
  "Vacinação",
  "Testes Rápidos (ISTs)",
  "Aferição de Pressão e Glicemia",
  "Pré-Natal / Saúde da Mulher",
  "Preventivo (Papanicolau)",
  "Pediatria / Puericultura",
  "Saúde do Homem",
  "Curativos e Procedimentos",
  "Entrega de Medicamentos (Farmácia)",
  "Nutrição",
  "Psicologia",
  "Fisioterapia",
  "Visita Domiciliar (ACS)",
  "Palestra / Educação em Saúde",
] as const;

export function isSecretariaSaude(
  nome?: string | null,
  sigla?: string | null
): boolean {
  const normNome = (nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const normSigla = (sigla || "").trim().toLowerCase();
  return normNome.includes("saude") || normSigla === "sms" || normSigla === "sesau";
}

export function formatarTurnos(turnos?: TurnoAcao[] | null): string {
  if (!turnos || turnos.length === 0) return "";
  const ordem: TurnoAcao[] = ["MANHA", "TARDE", "NOITE"];
  const labels = ordem
    .filter((t) => turnos.includes(t))
    .map((t) => TURNOS_OPTIONS.find((opt) => opt.value === t)?.label || t);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
  return `${labels[0]}, ${labels[1]} e ${labels[2]}`;
}

export function formatarPeriodoAcao(
  dataRealizacao: string,
  dataFim?: string | null
): string {
  const inicio = formatarDataBR(dataRealizacao);
  if (!dataFim) return inicio;
  const fim = formatarDataBR(dataFim);
  if (!fim || fim === inicio) return inicio;
  return `${inicio} a ${fim}`;
}

export function formatarPublicoAtendido(params: {
  publicoModo?: PublicoModo | null;
  publicoExato?: number | null;
  publicoEstimativa?: string | null;
}): string {
  const { publicoModo, publicoExato, publicoEstimativa } = params;
  if (publicoModo === "EXATO" && typeof publicoExato === "number" && publicoExato > 0) {
    return `${publicoExato.toLocaleString("pt-BR")} pessoa${publicoExato === 1 ? "" : "s"} atendida${publicoExato === 1 ? "" : "s"} (número exato)`;
  }
  if (publicoModo === "ESTIMATIVA" && publicoEstimativa?.trim()) {
    return `${publicoEstimativa.trim()} (estimativa)`;
  }
  if (publicoModo === "NAO_INFORMADO") {
    return "Não contabilizado / Não sabemos ao certo";
  }
  return "";
}
