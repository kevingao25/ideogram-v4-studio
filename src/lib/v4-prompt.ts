import { z } from "zod";

import type { Bbox } from "@/lib/bbox";

const bboxSchema = z
  .tuple([
    z.number().min(0).max(1000),
    z.number().min(0).max(1000),
    z.number().min(0).max(1000),
    z.number().min(0).max(1000),
  ])
  .refine(([yMin, xMin, yMax, xMax]) => yMin < yMax && xMin < xMax, {
    message: "Bounding box minimums must be smaller than maximums.",
  });

const elementSchema = z
  .object({
    type: z.enum(["obj", "text"]),
    desc: z.string().min(1),
    bbox: bboxSchema.optional(),
    text: z.string().optional(),
    color_palette: z.array(z.string()).max(5).optional(),
  })
  .passthrough()
  .refine((element) => element.type !== "text" || Boolean(element.text?.trim()), {
    message: "Text elements must include the literal text to render.",
  });

export const v4PromptSchema = z
  .object({
    high_level_description: z.string().min(1),
    compositional_deconstruction: z.object({
      background: z.string(),
      elements: z.array(elementSchema),
    }),
    style_description: z
      .object({
        aesthetics: z.string().optional(),
        lighting: z.string().optional(),
        medium: z.string().optional(),
        art_style: z.string().optional(),
        photo: z.string().optional(),
        color_palette: z.array(z.string()).max(16).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type V4Prompt = z.infer<typeof v4PromptSchema>;
export type V4Element = V4Prompt["compositional_deconstruction"]["elements"][number] & {
  bbox?: Bbox;
};

export function parseV4Prompt(input: unknown): V4Prompt {
  const result = v4PromptSchema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(" ");
    throw new Error(message || "Invalid Ideogram V4 JSON prompt.");
  }
  return result.data;
}
