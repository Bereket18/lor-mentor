import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import {
  GOOGLE_AUTHORIZATION_ENDPOINT,
  GOOGLE_MAX_IAT_SKEW_MS,
  GoogleIdentityError,
  GoogleOidcClient,
  assertGoogleIdentity,
  buildGoogleAuthorizationUrl,
} from './google-oidc.client';

// Keep the real enum, but replace the network client with a mock.
jest.mock('google-auth-library', () => {
  const actual = jest.requireActual('google-auth-library');
  return { ...actual, OAuth2Client: jest.fn() };
});

const MockOAuth2Client = OAuth2Client as unknown as jest.Mock;

function buildConfig(overrides: Record<string, string> = {}): ConfigService {
  return new ConfigService({
    GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    WEB_PUBLIC_URL: 'https://web.example.com',
    ...overrides,
  });
}

function tokenPayload(overrides: Record<string, unknown> = {}) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://accounts.google.com',
    aud: 'client-id.apps.googleusercontent.com',
    sub: 'google-subject-123',
    email: 'Student@Example.com',
    email_verified: true,
    nonce: 'nonce-abc',
    iat: nowSeconds,
    exp: nowSeconds + 3600,
    ...overrides,
  };
}

describe('buildGoogleAuthorizationUrl', () => {
  it('targets the fixed endpoint with the authorization-code parameters', () => {
    const url = new URL(
      buildGoogleAuthorizationUrl({
        clientId: 'cid',
        redirectUri: 'https://web.example.com/auth/google/callback',
        state: 'st',
        nonce: 'nn',
        codeChallenge: 'cc',
      }),
    );

    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTHORIZATION_ENDPOINT);
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://web.example.com/auth/google/callback',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('nonce')).toBe('nn');
    expect(url.searchParams.get('code_challenge')).toBe('cc');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('access_type')).toBe('online');
  });
});

describe('assertGoogleIdentity', () => {
  it('returns the subject and a normalised verified email', () => {
    const identity = assertGoogleIdentity(tokenPayload() as never, 'nonce-abc');

    expect(identity).toEqual({
      subject: 'google-subject-123',
      email: 'student@example.com',
    });
  });

  it('throws when there is no payload', () => {
    expect(() => assertGoogleIdentity(undefined, 'nonce-abc')).toThrow(
      GoogleIdentityError,
    );
  });

  it('throws when the subject is empty', () => {
    expect(() =>
      assertGoogleIdentity(tokenPayload({ sub: '' }) as never, 'nonce-abc'),
    ).toThrow(/subject/);
  });

  it('throws on a nonce mismatch', () => {
    expect(() =>
      assertGoogleIdentity(tokenPayload({ nonce: 'other' }) as never, 'nonce-abc'),
    ).toThrow(/nonce/);
  });

  it('throws when the nonce is missing', () => {
    expect(() =>
      assertGoogleIdentity(tokenPayload({ nonce: undefined }) as never, 'nonce-abc'),
    ).toThrow(/nonce/);
  });

  it('throws when the email is not verified', () => {
    expect(() =>
      assertGoogleIdentity(
        tokenPayload({ email_verified: false }) as never,
        'nonce-abc',
      ),
    ).toThrow(/not verified/);
  });

  it('throws when the email is missing or blank', () => {
    expect(() =>
      assertGoogleIdentity(
        tokenPayload({ email: '   ' }) as never,
        'nonce-abc',
      ),
    ).toThrow(/email/);
    expect(() =>
      assertGoogleIdentity(
        tokenPayload({ email: undefined }) as never,
        'nonce-abc',
      ),
    ).toThrow(/email/);
  });

  it('rejects a token issued well in the future', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    expect(() =>
      assertGoogleIdentity(tokenPayload({ iat: future }) as never, 'nonce-abc'),
    ).toThrow(/future/);
  });

  it('accepts an issued-at within the skew bound', () => {
    const now = new Date('2026-11-25T12:00:00.000Z');
    const withinSkew = Math.floor(
      (now.getTime() + GOOGLE_MAX_IAT_SKEW_MS - 1000) / 1000,
    );
    expect(() =>
      assertGoogleIdentity(
        tokenPayload({ iat: withinSkew }) as never,
        'nonce-abc',
        now,
      ),
    ).not.toThrow();
  });
});

describe('GoogleOidcClient', () => {
  beforeEach(() => {
    MockOAuth2Client.mockReset();
  });

  it('derives the redirect URI from WEB_PUBLIC_URL', () => {
    const client = new GoogleOidcClient(buildConfig());
    expect(client.redirectUri()).toBe(
      'https://web.example.com/auth/google/callback',
    );
  });

  it('honours an explicit GOOGLE_REDIRECT_URI', () => {
    const client = new GoogleOidcClient(
      buildConfig({ GOOGLE_REDIRECT_URI: 'https://sso.example.com/cb' }),
    );
    expect(client.redirectUri()).toBe('https://sso.example.com/cb');
  });

  it('builds the authorization URL from configuration', () => {
    const client = new GoogleOidcClient(buildConfig());
    const url = new URL(
      client.authorizationUrl({
        state: 'st',
        nonce: 'nn',
        codeChallenge: 'cc',
      }),
    );
    expect(url.searchParams.get('client_id')).toBe(
      'client-id.apps.googleusercontent.com',
    );
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://web.example.com/auth/google/callback',
    );
    expect(url.searchParams.get('nonce')).toBe('nn');
  });

  it('fails closed when the client id is missing', () => {
    const client = new GoogleOidcClient(buildConfig({ GOOGLE_CLIENT_ID: '' }));
    expect(() =>
      client.authorizationUrl({ state: 's', nonce: 'n', codeChallenge: 'c' }),
    ).toThrow(ServiceUnavailableException);
  });

  it('exchanges a code and returns only the id token', async () => {
    const getToken = jest.fn().mockResolvedValue({
      tokens: { id_token: 'the-id-token', access_token: 'discarded' },
    });
    MockOAuth2Client.mockImplementation(() => ({ getToken }));
    const client = new GoogleOidcClient(buildConfig());

    await expect(
      client.exchangeCode({ code: 'the-code', codeVerifier: 'the-verifier' }),
    ).resolves.toBe('the-id-token');

    expect(MockOAuth2Client).toHaveBeenCalledWith({
      clientId: 'client-id.apps.googleusercontent.com',
      clientSecret: 'client-secret',
      redirectUri: 'https://web.example.com/auth/google/callback',
    });
    expect(getToken).toHaveBeenCalledWith({
      code: 'the-code',
      codeVerifier: 'the-verifier',
      redirect_uri: 'https://web.example.com/auth/google/callback',
    });
  });

  it('rejects a token response with no id token', async () => {
    MockOAuth2Client.mockImplementation(() => ({
      getToken: jest.fn().mockResolvedValue({ tokens: {} }),
    }));
    const client = new GoogleOidcClient(buildConfig());

    await expect(
      client.exchangeCode({ code: 'c', codeVerifier: 'v' }),
    ).rejects.toBeInstanceOf(GoogleIdentityError);
  });

  it('maps a failed exchange to a token-free identity error', async () => {
    MockOAuth2Client.mockImplementation(() => ({
      getToken: jest
        .fn()
        .mockRejectedValue(new Error('bad code the-code and id token abc.def')),
    }));
    const client = new GoogleOidcClient(buildConfig());

    await expect(
      client.exchangeCode({ code: 'the-code', codeVerifier: 'v' }),
    ).rejects.toThrow('code exchange failed');
  });

  it('verifies an id token and returns the identity', async () => {
    const verifyIdToken = jest.fn().mockResolvedValue({
      getPayload: () => tokenPayload(),
    });
    MockOAuth2Client.mockImplementation(() => ({ verifyIdToken }));
    const client = new GoogleOidcClient(buildConfig());

    await expect(
      client.verifyIdToken({ idToken: 'jwt', expectedNonce: 'nonce-abc' }),
    ).resolves.toEqual({
      subject: 'google-subject-123',
      email: 'student@example.com',
    });

    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'jwt',
      audience: 'client-id.apps.googleusercontent.com',
    });
  });

  it('maps a rejected id token to a token-free identity error', async () => {
    MockOAuth2Client.mockImplementation(() => ({
      verifyIdToken: jest.fn().mockRejectedValue(new Error('jwt abc.def.ghi')),
    }));
    const client = new GoogleOidcClient(buildConfig());

    await expect(
      client.verifyIdToken({ idToken: 'jwt', expectedNonce: 'n' }),
    ).rejects.toThrow('id token verification failed');
  });

  it('enforces the nonce after library verification', async () => {
    MockOAuth2Client.mockImplementation(() => ({
      verifyIdToken: jest.fn().mockResolvedValue({
        getPayload: () => tokenPayload({ nonce: 'a-different-nonce' }),
      }),
    }));
    const client = new GoogleOidcClient(buildConfig());

    await expect(
      client.verifyIdToken({ idToken: 'jwt', expectedNonce: 'nonce-abc' }),
    ).rejects.toThrow(/nonce/);
  });
});
