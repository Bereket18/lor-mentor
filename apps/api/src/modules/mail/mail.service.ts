import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendEmailVerification(to: string, verifyUrl: string): Promise<void> {
    const appName = this.config.get<string>('APP_NAME') ?? 'Lor Mentor';
    const college =
      this.config.get<string>('COLLEGE_NAME') ?? 'Lorcan Medical College';

    await this.sendMail({
      to,
      subject: `Verify your ${appName} account`,
      text:
        `Welcome to ${appName}.\n\n` +
        `Open this link to verify your email address:\n${verifyUrl}\n\n` +
        `This link expires in 24 hours. If you did not create this account, you can ignore this email.\n\n` +
        `${college}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2 style="margin:0 0 12px">Verify your ${appName} account</h2>
          <p>Welcome. Please verify your email address to finish creating your account.</p>
          <p>
            <a href="${verifyUrl}" style="display:inline-block;background:#147878;color:white;text-decoration:none;padding:10px 16px;border-radius:8px">
              Verify email
            </a>
          </p>
          <p style="font-size:13px;color:#64748b">This link expires in 24 hours. If you did not create this account, you can ignore this email.</p>
          <p style="font-size:13px;color:#64748b">${college}</p>
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
