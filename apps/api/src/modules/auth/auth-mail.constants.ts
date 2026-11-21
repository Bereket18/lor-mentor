/** BullMQ queue that carries encrypted sign-in mail jobs. */
export const AUTH_MAIL_QUEUE = 'auth-mail';

/** Job name used for every sign-in mail. */
export const AUTH_MAIL_JOB = 'send-sign-in';

/**
 * The only data BullMQ stores for a sign-in mail.
 *
 * The plaintext payload (recipient, code, link) is encrypted before it reaches
 * Redis. A worker decrypts it in memory and never logs the result.
 */
export interface AuthMailJobData {
  payload: string;
}

/** The decrypted payload, held only in the API process and the worker. */
export interface AuthMailPayload {
  challengeId: string;
  to: string;
  code: string;
  confirmationLink: string;
  expiresInMinutes: number;
  deliverable: boolean;
  userId: string | null;
  purpose: 'LOGIN' | 'SIGNUP';
}
