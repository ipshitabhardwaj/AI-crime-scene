import type { EvidenceType } from "@/lib/types";

export const EVIDENCE_META: Record<EvidenceType, { label: string; icon: string }> = {
  log: { label: "System log", icon: ">_" },
  chat: { label: "Chat", icon: "“ ”" },
  email: { label: "Email", icon: "✉" },
  db: { label: "Database", icon: "▦" },
  api: { label: "API response", icon: "{ }" },
  code: { label: "Code", icon: "</>" },
  screenshot: { label: "Screenshot", icon: "▣" },
  ai_output: { label: "AI output", icon: "✦" },
  note: { label: "Note", icon: "¶" },
};
