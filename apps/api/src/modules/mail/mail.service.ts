import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

/**
 * Escape a value before interpolating it into an HTML email.
 *
 * Support bodies are student-authored, so without this a message containing
 * markup would be rendered by the recipient's mail client.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/**
 * Collapse CR/LF out of a value used in a subject line. Header injection needs
 * a newline, and a stray one in a student's subject would otherwise split the
 * header block.
 */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * The sign-up verification email.
   *
   * Carries a six-digit code rather than a link. A code typed into the app
   * never travels as a URL query parameter, which is where the old link put the
   * secret — into browser history, referrer headers and every access log that
   * records full request URLs.
   *
   * The code is the largest thing on the page and is set in a monospace face
   * with wide letter spacing so it reads easily off a phone and copies cleanly.
   * The copy says "code" throughout; the internal name for this value never
   * reaches the user.
   */
  async sendEmailVerification(
    to: string,
    code: string,
    expiresInMinutes: number,
  ): Promise<void> {
    const appName = this.config.get<string>('APP_NAME') ?? 'Lor Mentor';
    const college =
      this.config.get<string>('COLLEGE_NAME') ?? 'Lorcan Medical College';

    await this.sendMail({
      to,
      subject: `Your ${appName} verification code`,
      text:
        `Welcome to ${appName}.\n\n` +
        `Your email verification code is:\n\n    ${code}\n\n` +
        `Enter it in the app to verify your email address and finish creating your account.\n\n` +
        `The code expires in ${expiresInMinutes} minutes. Never share it with anyone — ${appName} staff will never ask you for it. If you did not create this account, you can ignore this email.\n\n` +
        `${college}`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#0f172a;max-width:520px">
          <h2 style="margin:0 0 12px">Verify your ${appName} account</h2>
          <p style="margin:0 0 20px">Welcome. Enter this code in the app to verify your email address and finish creating your account.</p>
          <div style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:bold;letter-spacing:8px;color:#0f172a;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:10px;padding:18px 24px;text-align:center;margin:0 0 20px">${code}</div>
          <p style="margin:0 0 8px">The code expires in ${expiresInMinutes} minutes.</p>
          <p style="margin:0 0 20px;font-size:13px;color:#64748b">Never share this code with anyone — ${appName} staff will never ask you for it. If you did not create this account, you can ignore this email.</p>
          <p style="margin:0;font-size:13px;color:#64748b">${college}</p>
        </div>
      `,
    });
  }
  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    const appName = this.config.get<string>('APP_NAME') ?? 'Lor Mentor';
    const college =
      this.config.get<string>('COLLEGE_NAME') ?? 'Lorcan Medical College';

    await this.sendMail({
      to,
      subject: `${appName} password reset`,
      text:
        `A password reset was requested for your ${appName} account.\n\n` +
        `Open this link to choose a new password:\n${resetUrl}\n\n` +
        `This link expires in 1 hour. If you did not request this, you can ignore this email.\n\n` +
        `${college}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2 style="margin:0 0 12px">${appName} password reset</h2>
          <p>A password reset was requested for your account.</p>
          <p>
            <a href="${resetUrl}" style="display:inline-block;background:#147878;color:white;text-decoration:none;padding:10px 16px;border-radius:8px">
              Reset password
            </a>
          </p>
          <p style="font-size:13px;color:#64748b">This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
          <p style="font-size:13px;color:#64748b">${college}</p>
        </div>
      `,
    });
  }

  /**
   * Invitation for a staff account created by an administrator.
   *
   * The account is created without a usable password; this link is the only
   * way in, it expires in 48 hours, and it is invalidated the first time it is
   * used (the reset-token claim nulls it). The message never contains a
   * password because no password exists yet.
   */
  async sendStaffInvitation(
    to: string,
    fullName: string,
    setupUrl: string,
    role: string,
  ): Promise<void> {
    const appName = this.config.get<string>('APP_NAME') ?? 'Lor Mentor';
    const college =
      this.config.get<string>('COLLEGE_NAME') ?? 'Lorcan Medical College';
    const roleLabel = role.toLowerCase();

    await this.sendMail({
      to,
      subject: `Your ${appName} account is ready — set your password`,
      text:
        `Hello ${fullName},\n\n` +
        `An administrator created a ${roleLabel} account for you at ${appName}.\n\n` +
        `Open this link to choose your password:\n${setupUrl}\n\n` +
        `This link expires in 48 hours and can be used once. If you were not expecting this, contact the college administrator.\n\n` +
        `${college}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2 style="margin:0 0 12px">Your ${appName} account is ready</h2>
          <p>Hello ${fullName},</p>
          <p>An administrator created a ${roleLabel} account for you. Choose a password to activate it.</p>
          <p>
            <a href="${setupUrl}" style="display:inline-block;background:#147878;color:white;text-decoration:none;padding:10px 16px;border-radius:8px">
              Set your password
            </a>
          </p>
          <p style="font-size:13px;color:#64748b">This link expires in 48 hours and can be used once. If you were not expecting this, contact the college administrator.</p>
          <p style="font-size:13px;color:#64748b">${college}</p>
        </div>
      `,
    });
  }

  /**
   * Notification to the college's support mailbox that a student opened a
   * ticket, or wrote back on one the college had already answered.
   *
   * The mailbox is SUPPORT_EMAIL when set and SMTP_FROM's address otherwise,
   * so a deployment that never configured a dedicated inbox still works. The
   * student's address is shown in the body but is deliberately NOT set as
   * Reply-To: a reply sent straight from the mail client would bypass the
   * thread and the student would never see it in the app.
   */
  async sendSupportTicketCreated(input: {
    subject: string;
    category: string;
    body: string;
    studentName: string;
    studentEmail: string;
    reference: string | null;
    ticketId: string;
  }): Promise<void> {
    const to = this.supportAddress();
    if (!to) {
      this.logger.warn(
        'No SUPPORT_EMAIL or SMTP_FROM configured; skipping support ticket email',
      );
      return;
    }

    const appName = this.config.get<string>('APP_NAME') ?? 'Lor Mentor';
    const college =
      this.config.get<string>('COLLEGE_NAME') ?? 'Lorcan Medical College';
    const subject = oneLine(`[Support] ${input.subject}`);
    const name = oneLine(input.studentName);
    const email = oneLine(input.studentEmail);
    const category = oneLine(input.category);
    const reference = input.reference ? oneLine(input.reference) : '';
    const inboxUrl = this.webUrl(`/admin/support?ticket=${input.ticketId}`);

    const lines = [
      `New support ticket at ${appName}`,
      '',
      `From: ${name} <${email}>`,
      `Category: ${category}`,
      ...(reference ? [`Reference: ${reference}`] : []),
      `Subject: ${oneLine(input.subject)}`,
      `Ticket: ${input.ticketId}`,
      '',
      input.body,
      '',
      ...(inboxUrl ? [`Open the admin inbox: ${inboxUrl}`, ''] : []),
      `${college}`,
    ];

    await this.sendMail({
      to,
      subject,
      text: lines.join('\n'),
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#0f172a;max-width:600px">
          <h2 style="margin:0 0 12px">New support ticket</h2>
          <p style="margin:0 0 12px">
            <strong>${escapeHtml(name)}</strong>
            &lt;${escapeHtml(email)}&gt;<br>
            Category: ${escapeHtml(category)}${
              reference
                ? `<br>Reference: <code>${escapeHtml(reference)}</code>`
                : ''
            }
          </p>
          <p style="margin:0 0 8px"><strong>${escapeHtml(
            oneLine(input.subject),
          )}</strong></p>
          <div style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:0 0 16px">${escapeHtml(
            input.body,
          )}</div>
          ${
            inboxUrl
              ? `<p style="margin:0 0 16px"><a href="${escapeHtml(
                  inboxUrl,
                )}" style="display:inline-block;background:#147878;color:white;text-decoration:none;padding:10px 16px;border-radius:8px">Open the admin inbox</a></p>`
              : ''
          }
          <p style="margin:0;font-size:12px;color:#64748b">Ticket ${escapeHtml(
            input.ticketId,
          )} · ${escapeHtml(college)}</p>
        </div>
      `,
    });
  }

  /**
   * Email to the student when a staff member answers their ticket.
   *
   * Only the new reply is included, never the rest of the thread: the message
   * may be forwarded, and earlier messages can contain payment details.
   */
  async sendSupportReply(input: {
    to: string;
    fullName: string;
    subject: string;
    body: string;
    ticketId: string;
  }): Promise<void> {
    const appName = this.config.get<string>('APP_NAME') ?? 'Lor Mentor';
    const college =
      this.config.get<string>('COLLEGE_NAME') ?? 'Lorcan Medical College';
    const name = oneLine(input.fullName);
    const ticketSubject = oneLine(input.subject);
    const threadUrl = this.webUrl(`/support?ticket=${input.ticketId}`);

    const lines = [
      `Hello ${name},`,
      '',
      `The college replied to your support ticket "${ticketSubject}".`,
      '',
      input.body,
      '',
      ...(threadUrl ? [`Answer in the app: ${threadUrl}`, ''] : []),
      `If you no longer need help with this, you can close the ticket from the Support page.`,
      '',
      `${college}`,
    ];

    await this.sendMail({
      to: input.to,
      subject: oneLine(`${appName} support reply: ${ticketSubject}`),
      text: lines.join('\n'),
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#0f172a;max-width:560px">
          <h2 style="margin:0 0 12px">Support replied to your ticket</h2>
          <p style="margin:0 0 12px">Hello ${escapeHtml(name)},</p>
          <p style="margin:0 0 12px">The college replied to <strong>${escapeHtml(
            ticketSubject,
          )}</strong>.</p>
          <div style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:0 0 16px">${escapeHtml(
            input.body,
          )}</div>
          ${
            threadUrl
              ? `<p style="margin:0 0 16px"><a href="${escapeHtml(
                  threadUrl,
                )}" style="display:inline-block;background:#147878;color:white;text-decoration:none;padding:10px 16px;border-radius:8px">Open the ticket</a></p>`
              : ''
          }
          <p style="margin:0 0 12px;font-size:13px;color:#64748b">If you no longer need help with this, you can close the ticket from the Support page.</p>
          <p style="margin:0;font-size:13px;color:#64748b">${escapeHtml(
            college,
          )}</p>
        </div>
      `,
    });
  }

  /**
   * The mailbox new tickets are sent to. SUPPORT_EMAIL wins; SMTP_FROM is the
   * fallback so a single-mailbox deployment needs no extra setting.
   */
  private supportAddress(): string | undefined {
    const configured = this.config.get<string>('SUPPORT_EMAIL')?.trim();
    if (configured) return configured;

    const from = this.config.get<string>('SMTP_FROM')?.trim();
    if (!from) return undefined;
    return from.match(/<([^>]+)>/)?.[1]?.trim() ?? from;
  }

  /** Absolute web link for an email, or null when no public URL is set. */
  private webUrl(path: string): string | null {
    const base = this.config.get<string>('WEB_PUBLIC_URL')?.trim();
    if (!base) return null;
    try {
      return new URL(path, base).toString();
    } catch {
      return null;
    }
  }

  private async sendMail(message: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const from =
      this.config.get<string>('SMTP_FROM') ??
      (user ? `Lor Mentor <${user}>` : undefined);

    if (!host || !user || !pass || !from) {
      this.logger.error('SMTP configuration is incomplete');
      throw new ServiceUnavailableException(
        'Email service is not configured right now',
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
