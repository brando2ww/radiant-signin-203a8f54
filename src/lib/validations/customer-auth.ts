import { z } from "zod";

const phoneRegex = /^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/;

export const guestCheckoutSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(100),
  phone: z.string().trim().regex(phoneRegex, "Telefone inválido"),
  document: z.string().trim().max(20).optional().or(z.literal("")),
  document_type: z.enum(["CPF", "CNPJ"]).default("CPF"),
});

export const customerLoginSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(6, "Senha muito curta"),
});

export const customerSignUpSchema = z
  .object({
    name: z.string().trim().min(2, "Nome obrigatório").max(100),
    cpf: z.string().trim().min(11, "CPF inválido").max(14),
    phone: z.string().trim().regex(phoneRegex, "Telefone inválido"),
    birth_date: z.string().optional().or(z.literal("")),
    email: z.string().trim().email("E-mail inválido"),
    password: z.string().min(8, "Senha deve ter ao menos 8 caracteres"),
    password_confirm: z.string(),
  })
  .refine((d) => d.password === d.password_confirm, {
    message: "Senhas não conferem",
    path: ["password_confirm"],
  });

export type GuestCheckoutData = z.infer<typeof guestCheckoutSchema>;
export type CustomerLoginData = z.infer<typeof customerLoginSchema>;
export type CustomerSignUpData = z.infer<typeof customerSignUpSchema>;
