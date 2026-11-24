"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  HeartPulse,
  Moon,
  Plus,
  Sun,
  Sunrise,
  Users,
  X,
} from "lucide-react";
import type { PublicoModo, TurnoAcao } from "@/lib/types";
import {
  PUBLICO_ESTIMATIVA_OPTIONS,
  SERVICOS_SAUDE_PADRAO,
  TURNOS_OPTIONS,
} from "@/lib/acao-options";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface AcaoDetalhesExtrasFieldsProps {
  isSaude: boolean;
  turnos: TurnoAcao[];
  onTurnosChange: (next: TurnoAcao[]) => void;
  publicoModo: PublicoModo;
  onPublicoModoChange: (next: PublicoModo) => void;
  publicoExato: string;
  onPublicoExatoChange: (next: string) => void;
  publicoEstimativa: string;
  onPublicoEstimativaChange: (next: string) => void;
  servicosSaude: string[];
  onServicosSaudeChange: (next: string[]) => void;
  compact?: boolean;
}

const TURNO_ICON: Record<TurnoAcao, typeof Sunrise> = {
  MANHA: Sunrise,
  TARDE: Sun,
  NOITE: Moon,
};

export function AcaoDetalhesExtrasFields({
  isSaude,
  turnos,
  onTurnosChange,
  publicoModo,
  onPublicoModoChange,
  publicoExato,
  onPublicoExatoChange,
  publicoEstimativa,
  onPublicoEstimativaChange,
  servicosSaude,
  onServicosSaudeChange,
  compact = false,
}: AcaoDetalhesExtrasFieldsProps) {
  const [saudeOpen, setSaudeOpen] = useState(true);
  const [novoServico, setNovoServico] = useState("");

  function toggleTurno(t: TurnoAcao) {
    if (turnos.includes(t)) {
      onTurnosChange(turnos.filter((item) => item !== t));
    } else {
      onTurnosChange([...turnos, t]);
    }
  }

  function toggleServico(servico: string) {
    if (servicosSaude.includes(servico)) {
      onServicosSaudeChange(servicosSaude.filter((s) => s !== servico));
    } else {
      onServicosSaudeChange([...servicosSaude, servico]);
    }
  }

  function handleAddServicoCustom() {
    const clean = novoServico.trim();
    if (clean.length < 2) return;
    if (!servicosSaude.some((s) => s.toLowerCase() === clean.toLowerCase())) {
      onServicosSaudeChange([...servicosSaude, clean]);
    }
    setNovoServico("");
  }

  const servicosCustom = servicosSaude.filter(
    (s) => !(SERVICOS_SAUDE_PADRAO as readonly string[]).includes(s)
  );

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      {/* Turno(s) de Realização */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-sm">
          <Clock className="h-3.5 w-3.5 text-primary" />
          Turno da Ação{" "}
          <span className="text-xs font-normal text-muted-foreground">
            (opcional — marque um ou mais)
          </span>
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {TURNOS_OPTIONS.map((opt) => {
            const Icon = TURNO_ICON[opt.value];
            const selected = turnos.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleTurno(opt.value)}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs sm:text-sm font-medium transition-all ${
                  selected
                    ? "border-[#128C23] bg-emerald-50 text-[#0B5D17] shadow-xs"
                    : "border-input bg-white text-foreground hover:border-primary/40 hover:bg-muted/30"
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    selected ? "text-[#128C23]" : "text-muted-foreground"
                  }`}
                />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Público / Pessoas Atendidas */}
      <div className="rounded-xl border bg-muted/15 p-3.5 sm:p-4 space-y-3">
        <div className="space-y-0.5">
          <Label className="flex items-center gap-1.5 text-sm">
            <Users className="h-4 w-4 text-primary" />
            Quantas pessoas foram atendidas?{" "}
            <span className="text-xs font-normal text-muted-foreground">
              (opcional)
            </span>
          </Label>
          <p className="text-xs text-muted-foreground">
            Informe o número exato, escolha uma faixa estimada ou deixe como não contabilizado.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => onPublicoModoChange("NAO_INFORMADO")}
            className={`rounded-lg border px-3 py-2 text-xs font-medium text-center transition-all ${
              publicoModo === "NAO_INFORMADO"
                ? "border-primary bg-primary text-primary-foreground shadow-xs"
                : "border-input bg-white text-foreground hover:bg-muted/40"
            }`}
          >
            Não sabemos ao certo
          </button>
          <button
            type="button"
            onClick={() => onPublicoModoChange("ESTIMATIVA")}
            className={`rounded-lg border px-3 py-2 text-xs font-medium text-center transition-all ${
              publicoModo === "ESTIMATIVA"
                ? "border-primary bg-primary text-primary-foreground shadow-xs"
                : "border-input bg-white text-foreground hover:bg-muted/40"
            }`}
          >
            Estimativa / Média
          </button>
          <button
            type="button"
            onClick={() => onPublicoModoChange("EXATO")}
            className={`rounded-lg border px-3 py-2 text-xs font-medium text-center transition-all ${
              publicoModo === "EXATO"
                ? "border-primary bg-primary text-primary-foreground shadow-xs"
                : "border-input bg-white text-foreground hover:bg-muted/40"
            }`}
          >
            Número Exato
          </button>
        </div>

        {publicoModo === "EXATO" && (
          <div className="space-y-1.5 pt-1 animate-fade-in">
            <Label htmlFor="publico-exato-input" className="text-xs text-muted-foreground">
              Quantidade exata de pessoas atendidas
            </Label>
            <Input
              id="publico-exato-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={1000000}
              placeholder="Ex: 145"
              value={publicoExato}
              onChange={(e) => onPublicoExatoChange(e.target.value)}
              className="bg-white max-w-xs"
            />
          </div>
        )}

        {publicoModo === "ESTIMATIVA" && (
          <div className="space-y-2.5 pt-1 animate-fade-in">
            <div className="flex flex-wrap gap-1.5">
              {PUBLICO_ESTIMATIVA_OPTIONS.map((faixa) => {
                const selected = publicoEstimativa === faixa;
                return (
                  <button
                    key={faixa}
                    type="button"
                    onClick={() => onPublicoEstimativaChange(faixa)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      selected
                        ? "border-[#128C23] bg-[#128C23] text-white shadow-xs"
                        : "border-input bg-white text-foreground hover:border-[#128C23]/50"
                    }`}
                  >
                    {faixa}
                  </button>
                );
              })}
            </div>
            <div className="space-y-1">
              <Label htmlFor="publico-estimativa-custom" className="text-[11px] text-muted-foreground">
                Ou digite uma média aproximada personalizada
              </Label>
              <Input
                id="publico-estimativa-custom"
                placeholder="Ex: Cerca de 250 moradores, média de 80 por dia..."
                value={publicoEstimativa}
                onChange={(e) => onPublicoEstimativaChange(e.target.value)}
                className="bg-white text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Filtros / Especialidades da Secretaria de Saúde (opcional) */}
      {isSaude && (
        <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/35 overflow-hidden">
          <button
            type="button"
            onClick={() => setSaudeOpen((v) => !v)}
            aria-expanded={saudeOpen}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-emerald-50/70 transition-colors"
          >
            <span className="text-sm font-semibold flex items-center gap-2 text-emerald-950">
              <HeartPulse className="h-4 w-4 text-[#128C23] shrink-0" />
              <span>Atendimentos e Especialidades de Saúde (opcional)</span>
              {servicosSaude.length > 0 && (
                <span className="rounded-full bg-[#128C23] text-white px-2 py-0.5 text-[11px] font-semibold">
                  {servicosSaude.length}
                </span>
              )}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-emerald-800 shrink-0 transition-transform duration-200 ${
                saudeOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {saudeOpen && (
            <div className="px-4 pb-4 pt-2 border-t border-emerald-200/70 space-y-3.5 animate-fade-in">
              <p className="text-xs text-emerald-900/80">
                Marque os serviços oferecidos na ação (USF/PSF, mutirões, campanhas) para facilitar filtros e relatórios. Se precisar, adicione novas especialidades abaixo.
              </p>

              <div className="flex flex-wrap gap-1.5">
                {SERVICOS_SAUDE_PADRAO.map((servico) => {
                  const selected = servicosSaude.includes(servico);
                  return (
                    <button
                      key={servico}
                      type="button"
                      onClick={() => toggleServico(servico)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                        selected
                          ? "bg-[#128C23] text-white border-[#128C23] shadow-xs"
                          : "bg-white text-foreground border-emerald-200 hover:border-[#128C23]/60"
                      }`}
                    >
                      {selected && <Check className="h-3 w-3 shrink-0" />}
                      <span>{servico}</span>
                    </button>
                  );
                })}
              </div>

              {servicosCustom.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-emerald-900/75">
                    Especialidades personalizadas adicionadas:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {servicosCustom.map((servico) => (
                      <span
                        key={servico}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#0E3A5D] text-white px-3 py-1 text-xs font-medium"
                      >
                        {servico}
                        <button
                          type="button"
                          aria-label={`Remover ${servico}`}
                          onClick={() => toggleServico(servico)}
                          className="rounded-full hover:bg-white/20 p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5 pt-1">
                <Label htmlFor="novo-servico-saude" className="text-xs text-emerald-900/80">
                  Adicionar outra especialidade ou atendimento
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="novo-servico-saude"
                    placeholder="Ex: Cardiologia, Oftalmologia, Ultrassonografia, Eletrocardiograma..."
                    value={novoServico}
                    onChange={(e) => setNovoServico(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddServicoCustom();
                      }
                    }}
                    className="bg-white text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddServicoCustom}
                    disabled={novoServico.trim().length < 2}
                    className="shrink-0 bg-white border-emerald-300 text-emerald-900 hover:bg-emerald-50"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
