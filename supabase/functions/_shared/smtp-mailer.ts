import nodemailer from "npm:nodemailer@6.9.15";

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail(options: MailOptions): Promise<void> {
  const host = Deno.env.get("SMTP_HOST");
  const port = Number(Deno.env.get("SMTP_PORT") || "465");
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASSWORD");
  const fromName = Deno.env.get("SMTP_FROM_NAME") || "Velara";

  if (!host || !user || !pass) {
    throw new Error("SMTP não configurado. Verifique SMTP_HOST, SMTP_USER e SMTP_PASSWORD nos Supabase Secrets.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"${fromName}" <${user}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });
}
