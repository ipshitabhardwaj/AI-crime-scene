import type { EvidenceType } from "@/lib/types";

/** Plain-language names for evidence types (shown to every participant). */
export const EVIDENCE_META: Record<EvidenceType, { label: string; icon: string }> = {
  log: { label: "Activity record", icon: "🕑" },
  chat: { label: "Chat", icon: "💬" },
  email: { label: "Email", icon: "✉️" },
  db: { label: "Table", icon: "▦" },
  api: { label: "System message", icon: "⇄" },
  code: { label: "Code", icon: "</>" },
  screenshot: { label: "Screenshot", icon: "🖼" },
  ai_output: { label: "AI assistant", icon: "✦" },
  note: { label: "Document", icon: "📄" },
};
