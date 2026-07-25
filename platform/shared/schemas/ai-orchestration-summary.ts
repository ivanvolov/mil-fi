import { z } from 'zod';

export const OrchestrationSummaryCritical = z.object({
  code: z.string().min(1).max(20),
  reason: z.string().min(1).max(200),
});
export type OrchestrationSummaryCritical = z.infer<typeof OrchestrationSummaryCritical>;

export const OrchestrationSummaryRequest = z.object({
  threatCount: z.number().int().min(0),
  assignmentCount: z.number().int().min(0),
  critical: z.array(OrchestrationSummaryCritical).max(50),
});
export type OrchestrationSummaryRequest = z.infer<typeof OrchestrationSummaryRequest>;

export const OrchestrationSummaryResponse = z.object({
  summary: z.string().min(1).max(400),
});
export type OrchestrationSummaryResponse = z.infer<typeof OrchestrationSummaryResponse>;
