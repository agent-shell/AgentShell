import type { Delta } from "./client";

export interface CommandProposal {
  command: string;
  explanation: string;
  riskLevel: "safe" | "caution" | "destructive";
}

export function accumulateText(deltas: Delta[]): string {
  return deltas
    .filter((d) => d.type === "text")
    .map((d) => d.text ?? "")
    .join("");
}

export function extractProposals(deltas: Delta[]): CommandProposal[] {
  return deltas
    .filter((d) => d.type === "tool_use" && d.tool_name === "propose_command")
    .map((d) => parseProposal(d.tool_input ?? {}))
    .filter((p): p is CommandProposal => p !== null);
}

export function parseProposal(input: Record<string, unknown>): CommandProposal | null {
  const { command, explanation, risk_level } = input;
  if (typeof command !== "string" || !command) return null;
  if (typeof explanation !== "string" || !explanation) return null;
  if (risk_level !== "safe" && risk_level !== "caution" && risk_level !== "destructive") return null;
  return { command, explanation, riskLevel: risk_level };
}
