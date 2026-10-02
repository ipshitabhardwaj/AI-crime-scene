import { z } from "zod";

/**
 * Shape of one case file in /cases/*.json. Validated before loading.
 *
 * A case is a short story, a list of suspects, multiple-choice questions
 * (each shows one clue) and a twist with a few more questions.
 */
const QuestionSchema = z.object({
  code: z.string().min(1), // Q1, Q2 … (round 1) or T1, T2 … (twist)
  clue: z.object({
    label: z.string().min(1), // kind of clue, e.g. "CCTV", "WhatsApp group"
    title: z.string().min(1),
    text: z.string().min(1),
  }),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  answer: z.number().int().min(1).max(4), // 1 = first option
});

export const CaseFileSchema = z
  .object({
    code: z.string().min(1),
    title: z.string().min(1),
    briefing_md: z.string().min(1),
    suspects: z.array(z.string().min(1)).min(2).max(6),
    questions: z.array(QuestionSchema).min(1),
    twist_md: z.string().min(1),
    twist_questions: z.array(QuestionSchema).min(1),
    answer: z.object({
      /** who the story points to at first (the wrong answer most teams start with) */
      first_suspect: z.string(),
      /** who really did it (scored) */
      culprit: z.string(),
      explanation: z.string().min(1),
    }),
  })
  .superRefine((c, ctx) => {
    const codes = [...c.questions, ...c.twist_questions].map((q) => q.code);
    const dup = codes.find((code, i) => codes.indexOf(code) !== i);
    if (dup) ctx.addIssue({ code: "custom", message: `Duplicate question code ${dup}` });
    for (const k of ["first_suspect", "culprit"] as const) {
      if (!c.suspects.includes(c.answer[k])) ctx.addIssue({ code: "custom", message: `answer.${k} "${c.answer[k]}" is not in suspects` });
    }
    if (c.answer.first_suspect === c.answer.culprit) ctx.addIssue({ code: "custom", message: "first_suspect and culprit must differ" });
  });

export type CaseFile = z.infer<typeof CaseFileSchema>;
export type CaseQuestion = z.infer<typeof QuestionSchema>;
