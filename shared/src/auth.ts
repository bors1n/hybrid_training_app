import { z } from 'zod';

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());

export const CODE_LENGTH = 6;
export const CodeSchema = z.string().trim().regex(/^[0-9]{6}$/, 'Код — 6 цифр');

/** Редакция политики и согласия (сайт, `/privacy/` и `/consent/`). Меняется вместе с их текстом. */
export const CONSENT_VERSION = '2026-11-01';

/** Запрос кода означает согласие на обработку почты: без него сервер код не отправляет. */
export const RequestCodeSchema = z.object({
  email: EmailSchema,
  consent: z.literal(true),
  consentVersion: z.string().min(1).max(32),
});
export const VerifyCodeSchema = z.object({ email: EmailSchema, code: CodeSchema });

export const UserSchema = z.object({ id: z.string(), email: z.string() });
export type User = z.infer<typeof UserSchema>;
