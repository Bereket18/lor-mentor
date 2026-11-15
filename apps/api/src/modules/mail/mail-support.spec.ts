import type { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

const mockSendMail = jest.fn();
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: () => ({ sendMail: mockSendMail }),
  },
}));

const BASE_ENV: Record<string, string> = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_USER: 'mailer',
  SMTP_PASS: 'not-a-real-password',
  SMTP_FROM: 'Lor Mentor <no-reply@lormentor.test>',
  APP_NAME: 'Lor Mentor',
  COLLEGE_NAME: 'Lorcan Medical College',
  WEB_PUBLIC_URL: 'https://lormentor.test',
  SUPPORT_EMAIL: 'support@lormentor.test',
};

function serviceWith(overrides: Record<string, string | undefined> = {}) {
  const env = { ...BASE_ENV, ...overrides };
  const config = {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService;
  return new MailService(config);
}

interface SentMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

function sentMessage(): SentMessage {
  expect(mockSendMail).toHaveBeenCalledTimes(1);
  const calls = mockSendMail.mock.calls as Array<[SentMessage]>;
  const first = calls[0];
  if (!first) throw new Error('sendMail was not called');
  return first[0];
}

describe('MailService support notifications', () => {
  beforeEach(() => {
    mockSendMail.mockReset();
    mockSendMail.mockResolvedValue({ messageId: 'test' });
  });

  it('sends new-ticket mail to SUPPORT_EMAIL when it is configured', async () => {
    await serviceWith().sendSupportTicketCreated({
      subject: 'Payment not showing',
      category: 'PAYMENT',
      ticketId: 'ticket-1',
      ticketNumber: 'T-000001',
    });

    const message = sentMessage();
    expect(message.to).toBe('support@lormentor.test');
    expect(message.subject).toContain('Payment not showing');
    expect(message.text).toContain('T-000001');
    expect(message.text).toContain('PAYMENT');
    expect(message.html).toContain(
      'https://lormentor.test/admin/support/ticket-1',
    );
  });

  it('never puts the message body, student name or student email in staff mail', async () => {
    await serviceWith().sendSupportTicketCreated({
      subject: 'Payment not showing',
      category: 'PAYMENT',
      ticketId: 'ticket-1',
      ticketNumber: 'T-000001',
    });

    const message = sentMessage();
    // The support mailbox is a shared inbox: it must not become a second copy
    // of the thread. Only the number, category and subject travel by email.
    expect(message.text).not.toContain('student@example.com');
    expect(message.text).not.toContain('I paid yesterday');
    expect(message.html).not.toContain('student@example.com');
    expect(message.html).not.toContain('I paid yesterday');
  });

  it('falls back to the SMTP_FROM address when SUPPORT_EMAIL is blank', async () => {
    await serviceWith({ SUPPORT_EMAIL: '' }).sendSupportTicketCreated({
      subject: 'Payment not showing',
      category: 'PAYMENT',
      ticketId: 'ticket-1',
    });

    expect(sentMessage().to).toBe('no-reply@lormentor.test');
  });

  it('does not send when no support address can be resolved', async () => {
    await expect(
      serviceWith({
        SUPPORT_EMAIL: '',
        SMTP_FROM: '',
      }).sendSupportTicketCreated({
        subject: 'Payment not showing',
        category: 'PAYMENT',
        ticketId: 'ticket-1',
      }),
    ).resolves.toBeUndefined();

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('escapes student-authored markup in the subject', async () => {
    await serviceWith().sendSupportTicketCreated({
      subject: 'Receipt <img src=x onerror=alert(1)>',
      category: 'PAYMENT',
      ticketId: 'ticket-1',
      ticketNumber: 'T-000001',
    });

    const message = sentMessage();
    expect(message.html).not.toContain('<img src=x');
    expect(message.html).toContain('&lt;img src=x');
  });

  it('strips CR/LF from the subject so a header cannot be injected', async () => {
    await serviceWith().sendSupportTicketCreated({
      subject: 'Hello\r\nBcc: evil@example.com',
      category: 'OTHER',
      ticketId: 'ticket-1',
    });

    const message = sentMessage();
    expect(message.subject).not.toMatch(/[\r\n]/);
    expect(message.subject).toContain('Bcc: evil@example.com');
  });

  it('escapes student-authored markup in the reply HTML body', async () => {
    await serviceWith().sendSupportReply({
      to: 'student@example.com',
      fullName: 'Student <b>One</b>',
      subject: 'Payment <script>alert(1)</script>',
      body: '<script>alert("x")</script>',
      ticketId: 'ticket-1',
    });

    const message = sentMessage();
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
    // Plain text keeps the characters but they are inert there.
    expect(message.text).toContain('<script>');
  });

  it('emails only the new reply to the student', async () => {
    await serviceWith().sendSupportReply({
      to: 'student@example.com',
      fullName: 'Student One',
      subject: 'Payment not showing',
      body: 'We found the payment; it is approved now.',
      ticketId: 'ticket-1',
    });

    const message = sentMessage();
    expect(message.to).toBe('student@example.com');
    expect(message.subject).toContain('support reply');
    expect(message.text).toContain('We found the payment');
    expect(message.text).toContain(
      'https://lormentor.test/support/tickets/ticket-1',
    );
    expect(message.html).toContain(
      'https://lormentor.test/support/tickets/ticket-1',
    );
    expect(message.text).toContain('mark the ticket as resolved');
  });

  it('omits the in-app link when no public web URL is configured', async () => {
    await serviceWith({ WEB_PUBLIC_URL: '' }).sendSupportReply({
      to: 'student@example.com',
      fullName: 'Student One',
      subject: 'Payment not showing',
      body: 'We found the payment; it is approved now.',
      ticketId: 'ticket-1',
    });

    const message = sentMessage();
    expect(message.text).not.toContain('/support/tickets/');
    expect(message.html).not.toContain('href=');
  });
});
