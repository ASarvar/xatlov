import { z } from 'zod';

const optionalInt = z.coerce.number().int().nullish();
const nullableText = z.string().trim().max(255).nullish();

export const organisationInputSchema = z.object({
  typeid: optionalInt,
  source_id: nullableText,
  org_name: z.string().trim().min(1, "org_name bo'sh bo'lishi mumkin emas").max(1000),
  region_id: optionalInt,
  district_id: optionalInt,
  tin: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => /^\d{9}$/.test(v), 'tin 9 xonali raqam bo\'lishi kerak'),
  state: z.coerce.number().int().refine((v) => v === 0 || v === 1, 'state faqat 0 yoki 1').default(1),
  soato: nullableText,
});

/** Yangilashda barcha maydonlar ixtiyoriy, lekin kamida bittasi bo'lishi shart. */
export const organisationPatchSchema = organisationInputSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, "Yangilash uchun kamida bitta maydon kerak");

export const organisationBulkSchema = z.object({
  source: z.string().trim().max(100).default('davlat-mulki'),
  items: z.array(organisationInputSchema).min(1, "items bo'sh bo'lmasligi kerak").max(5000),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  q: z.string().trim().min(1).optional(),
  tin: z.string().trim().optional(),
  region_id: z.coerce.number().int().optional(),
  district_id: z.coerce.number().int().optional(),
  typeid: z.coerce.number().int().optional(),
  state: z.coerce.number().int().optional(),
  sort: z.enum(['created_at', 'updated_at', 'org_name', 'id']).default('id'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type OrganisationInput = z.infer<typeof organisationInputSchema>;
export type OrganisationPatch = z.infer<typeof organisationPatchSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;

/** Zod xatosini o'qiladigan ko'rinishga keltiradi. */
export function formatZodError(error: z.ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(body)',
    message: issue.message,
  }));
}
