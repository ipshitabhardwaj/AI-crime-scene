import { z } from "zod";

/** Shape of one case file in /cases/*.json. Validated before loading. */
export const evidenceTypes = ["log", "chat", "email", "db", "api", "code", "screenshot", "ai_output", "note"] as const;
export const evidenceTags = ["relevant", "irrelevant", "misleading"] as const;

export const EvidenceSchema = z.object({
  code: z.string().min(1),                       // E01, T01 ...
  type: z.enum(evidenceTypes),
  title: z.string().min(1),
  time_label: z.string().optional(),             // in-story time shown to teams
  is_twist: z.boolean().default(false),
  content: z.record(z.string(), z.unknown()),     // shape depends on type
  key: z.object({
    tag: z.enum(evidenceTags),
    timeline_pos: z.number().int().positive().nullable(),
  }),
});

export const CaseFileSchema = z
  .object({
    code: z.string().min(1),
    title: z.string().min(1),
    briefing_md: z.string(),
    root_cause_options: z.array(z.string().min(1)).min(2),
    twist_md: z.string(),
    evidence: z.array(EvidenceSchema).min(1),
    answer: z.object({
      root_cause_category: z.string(),
      root_cause_md: z.string().default(""),
      responsible: z.string().default(""),
      post_twist_category: z.string(),
      post_twist_responsible: z.string().default(""),
    }),
  })
  .superRefine((c, ctx) => {
    const codes = c.evidence.map((e) => e.code);
    const dup = codes.find((code, i) => codes.indexOf(code) !== i);
    if (dup) ctx.addIssue({ code: "custom", message: `Duplicate evidence code ${dup}` });

    for (const k of ["root_cause_category", "post_twist_category"] as const) {
      if (!c.root_cause_options.includes(c.answer[k])) {
        ctx.addIssue({ code: "custom", message: `answer.${k} "${c.answer[k]}" is not in root_cause_options` });
      }
    }

    const positions = c.evidence.map((e) => e.key.timeline_pos).filter((p): p is number => p !== null);
    const sorted = [...positions].sort((a, b) => a - b);
    if (sorted.some((p, i) => p !== i + 1)) {
      ctx.addIssue({ code: "custom", message: `timeline_pos values must be 1..n with no gaps (got ${sorted.join(", ")})` });
    }
  });

export type CaseFile = z.infer<typeof CaseFileSchema>;
