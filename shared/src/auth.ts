import { z } from 'zod';

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());

export const CODE_LENGTH = 6;
export const CodeSchema = z.string().trim().regex(/^[0-9]{6}$/, 'Код — 6 цифр');

export const RequestCodeSchema = z.object({ email: EmailSchema });
export const VerifyCodeSchema = z.object({ email: EmailSchema, code: CodeSchema });

export const UserSchema = z.object({ id: z.string(), email: z.string() });
export type User = z.infer<typeof UserSchema>;
