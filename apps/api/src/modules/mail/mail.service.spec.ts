import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

/**
 * `createTransport` is called inside `sendMail`, not at construction, so
 * stubbing it here exercises the real body-building code while keeping the
 * transport out of the test. The `mock`-prefixed names are required: the
 * factory is hoisted above these declarations and can only close over
 * variables whose names start with `mock`.
 */
const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn((..._args: unknown[]) => ({
  sendMail: mockSendMail,
}));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: (...args: unknown[]) => mockCreateTransport(...args),
  },
}));

const SMTP_ENV: Record<string, string> = {
  SMTP_HOST: 'smtp.resend.com',
  SMTP_PORT: '587',
  SMTP_USER: 'resend',
  SMTP_PASS: 'not-a-real-smtp-password',
  SMTP_FROM: 'Lor Mentor <no-reply@lormentor.test>',
  APP_NAME: 'Lor Mentor',
  COLLEGE_NAME: 'Lorcan Medical College',
};

function serviceWith(overrides: Record<string, string | undefined> = {}) {
  const env = { ...SMTP_ENV, ...overrides };
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
  return mockSendMail.mock.calls[0][0] as SentMessage;
}

describe('MailService.sendEmailVerification', () => {
  beforeEach(() => {
    mockSendMail.mockReset();
    mockCreateTransport.mockClear();
    mockSendMail.mockResolvedValue({ messageId: 'test' });
  });

  it('sends the real code to the right recipient', async () => {
    await serviceWith().sendEmailVerification(
      'student@example.com',
      '428193',
      15,
    );

    const message = sentMessage();
    expect(message.to).toBe('student@example.com');
    expect(message.text).toContain('428193');
    expect(message.html).toContain('428193');
  });

  it('renders the code legibly rather than as a link', async () => {
    await serviceWith().sendEmailVerification(
      'student@example.com',
      '428193',
      15,
    );

    const message = sentMessage();
    // Monospace and letter-spaced so the six digits are readable off a phone,
    // and prominently sized.
    expect(message.html).toMatch(/Courier New/);
    expect(message.html).toMatch(/letter-spacing/);
    expect(message.html).toMatch(/font-size:3[0-9]px/);
  });

  it('names the code as a code, and carries no link or token wording', async () => {
    await serviceWith().sendEmailVerification(
      'student@example.com',
      '428193',
      15,
    );

    const message = sentMessage();
    for (const body of [message.text, message.html, message.subject]) {
      expect(body).not.toMatch(/token/i);
      expect(body).not.toMatch(/https?:\/\//);
      expect(body).not.toMatch(/\bhref=/i);
    }
    expect(message.subject).toMatch(/verification code/i);
    expect(message.text).toMatch(/verification code/i);
  });

  it('states how long the code is valid and warns against sharing it', async () => {
    await serviceWith().sendEmailVerification(
      'student@example.com',
      '428193',
      15,
    );

    const message = sentMessage();
    for (const body of [message.text, message.html]) {
      // The expiry shown to the user has to be the lifetime the service
      // enforces, passed in rather than hardcoded here.
      expect(body).toMatch(/15 minutes/);
      expect(body).toMatch(/[Nn]ever share/);
    }
  });

  it('carries the product and college branding', async () => {
    await serviceWith().sendEmailVerification(
      'student@example.com',
      '428193',
      15,
    );

    const message = sentMessage();
    expect(message.text).toContain('Lor Mentor');
    expect(message.text).toContain('Lorcan Medical College');
    expect(message.html).toContain('Lor Mentor');
    expect(message.html).toContain('Lorcan Medical College');
  });

  it('falls back to default branding when the app name is not configured', async () => {
    await serviceWith({ APP_NAME: undefined }).sendEmailVerification(
      'student@example.com',
      '428193',
      15,
    );

    expect(sentMessage().text).toContain('Lor Mentor');
  });

  it('preserves a code with leading zeroes verbatim', async () => {
    await serviceWith().sendEmailVerification(
      'student@example.com',
      '000042',
      15,
    );

    const message = sentMessage();
    // Anything that parsed the code as a number would have sent "42".
    expect(message.text).toContain('000042');
    expect(message.html).toContain('000042');
  });

  it('sends from the configured sender', async () => {
    await serviceWith().sendEmailVerification(
      'student@example.com',
      '428193',
      15,
    );

    expect(sentMessage().from).toBe('Lor Mentor <no-reply@lormentor.test>');
  });

  it('derives a sender from the SMTP user when none is configured', async () => {
    await serviceWith({ SMTP_FROM: undefined }).sendEmailVerification(
      'student@example.com',
      '428193',
      15,
    );

    expect(sentMessage().from).toBe('Lor Mentor <resend>');
  });

  it('uses TLS on port 465', async () => {
    await serviceWith({ SMTP_PORT: '465' }).sendEmailVerification(
      'student@example.com',
      '428193',
      15,
    );

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });

  it('does not use implicit TLS on port 587', async () => {
    await serviceWith().sendEmailVerification(
      'student@example.com',
      '428193',
      15,
    );

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: false }),
    );
  });

  it('refuses to send when the SMTP configuration is incomplete', async () => {
    // Without this the transport would be constructed with no credentials and
    // the failure would surface as a confusing SMTP auth error instead.
    await expect(
      serviceWith({ SMTP_PASS: undefined }).sendEmailVerification(
        'student@example.com',
        '428193',
        15,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockCreateTransport).not.toHaveBeenCalled();
  });

  it('propagates a delivery failure so the caller can roll back', async () => {
    // AuthService deletes the account (on register) or restores the superseded
    // code (on resend) when this rejects, so swallowing the error here would
    // silently strand the user.
    mockSendMail.mockRejectedValue(new Error('SMTP rejected'));

    await expect(
      serviceWith().sendEmailVerification(
        'student@example.com',
        '428193',
        15,
      ),
    ).rejects.toThrow('SMTP rejected');
  });
});
