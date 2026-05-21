import nodemailer from "nodemailer";

export interface EmailConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  from: string;
  recipients: string; // comma-separated
}

// Sends an alert email. No-op if SMTP isn't configured; failures are swallowed
// so a mail outage never blocks the alert engine.
export async function sendEmail(cfg: EmailConfig, subject: string, text: string): Promise<void> {
  if (!cfg.smtp_host || !cfg.recipients) return;
  try {
    const transport = nodemailer.createTransport({
      host: cfg.smtp_host,
      port: cfg.smtp_port,
      secure: cfg.smtp_port === 465,
      auth: cfg.smtp_user ? { user: cfg.smtp_user, pass: cfg.smtp_pass } : undefined,
    });
    await transport.sendMail({
      from: cfg.from || cfg.smtp_user,
      to: cfg.recipients,
      subject,
      text,
    });
  } catch (err) {
    console.error("email: send failed:", err);
  }
}
