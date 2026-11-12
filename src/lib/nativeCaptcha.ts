import { SecurityError, validateChallenge } from './securityCore.ts';

type Platform = 'android' | 'ios';
type Environment = Record<string, string | undefined>;
type NativeOptions = {
  projectId: string;
  apiKey: string;
  siteKey: string;
  appId: string;
  platform: Platform;
  minScore: number;
};

function nativeOptions(platform: Platform, env: Environment): NativeOptions | null {
  const projectId = env.RECAPTCHA_ENTERPRISE_PROJECT_ID?.trim();
  const apiKey = env.RECAPTCHA_ENTERPRISE_API_KEY?.trim();
  const siteKey = (platform === 'android'
    ? env.RECAPTCHA_ANDROID_SITE_KEY
    : env.RECAPTCHA_IOS_SITE_KEY)?.trim();
  const appId = (platform === 'android'
    ? env.RECAPTCHA_ANDROID_PACKAGE_NAME || 'com.touchmarkdes.recall'
    : env.RECAPTCHA_IOS_BUNDLE_ID)?.trim();
  if (!projectId || !apiKey || !siteKey || !appId) return null;
  return {
    projectId, apiKey, siteKey, appId, platform,
    minScore: env.RECAPTCHA_MIN_SCORE === undefined ? 0.5 : Number(env.RECAPTCHA_MIN_SCORE),
  };
}

// Only public mobile site keys leave this function. Server API credentials never do.
export function mobileSignupConfiguration(env: Environment = process.env) {
  return {
    androidSiteKey: nativeOptions('android', env)?.siteKey || null,
    iosSiteKey: nativeOptions('ios', env)?.siteKey || null,
  };
}

export async function validateNativeChallenge(
  token: unknown,
  platform: unknown,
  env: Environment = process.env,
  fetcher: typeof fetch = fetch,
) {
  if (platform !== 'android' && platform !== 'ios') {
    throw new SecurityError('The app security check was not recognized. Please retry.', 400);
  }
  const options = nativeOptions(platform, env);
  if (!options || !Number.isFinite(options.minScore) || options.minScore < 0.1 || options.minScore > 1) {
    throw new SecurityError('Account security checks are not ready. Please try again shortly.', 503);
  }
  if (typeof token !== 'string' || token.length < 1 || token.length > 16384) {
    throw new SecurityError('The security check did not finish. Your details are kept; please retry.', 400);
  }
  let response: Response;
  try {
    const endpoint = new URL(`https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(options.projectId)}/assessments`);
    response = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': options.apiKey },
      body: JSON.stringify({ event: { token, siteKey: options.siteKey, expectedAction: 'signup' } }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new SecurityError('The security check is temporarily unavailable. Your details are kept; retry shortly.', 503);
  }
  let assessment: {
    tokenProperties?: { valid?: boolean; invalidReason?: string; action?: string; androidPackageName?: string; iosBundleId?: string };
    riskAnalysis?: { score?: number };
    event?: { siteKey?: string };
  };
  try {
    if (!response.ok) throw new Error();
    assessment = await response.json();
  } catch {
    throw new SecurityError('The security check is temporarily unavailable. Your details are kept; retry shortly.', 503);
  }
  const properties = assessment?.tokenProperties;
  const appId = options.platform === 'android' ? properties?.androidPackageName : properties?.iosBundleId;
  const score = assessment?.riskAnalysis?.score;
  const rejectionReasons: string[] = [];
  if (properties?.valid !== true) rejectionReasons.push('invalid_token');
  if (properties?.action !== 'signup') rejectionReasons.push('action_mismatch');
  if (appId !== options.appId) rejectionReasons.push('app_identity_mismatch');
  if (assessment?.event?.siteKey !== options.siteKey) rejectionReasons.push('site_key_mismatch');
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
    rejectionReasons.push('invalid_score');
  } else if (score < options.minScore) rejectionReasons.push('score_below_threshold');
  if (rejectionReasons.length) {
    // Server-only diagnostics: never log the assessment body, token, key,
    // account details, or Google's arbitrary strings. Validation stays closed.
    const knownInvalidReasons = ['UNKNOWN_INVALID_REASON', 'MALFORMED', 'EXPIRED', 'DUPE', 'MISSING', 'BROWSER_ERROR'];
    console.warn('recall_native_signup_rejected', {
      platform: options.platform,
      reasons: rejectionReasons,
      invalidReason: knownInvalidReasons.includes(properties?.invalidReason || '') ? properties!.invalidReason : null,
      score: typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 1 ? score : null,
    });
    throw new SecurityError('We could not verify this signup. Your details are kept; please retry.', 400);
  }
  // Tokens are assessed fresh on every attempt; Google checks expiry and reuse.
  // Neither client headers nor a client-supplied score can bypass this assessment.
}

export async function validateSignupProof(
  body: Record<string, unknown>,
  env: Environment = process.env,
  fetcher: typeof fetch = fetch,
) {
  if (body.captchaProvider === 'recaptcha_enterprise') {
    return validateNativeChallenge(body.captchaToken, body.captchaPlatform, env, fetcher);
  }
  if (body.captchaProvider !== undefined) {
    throw new SecurityError('The signup security check was not recognized. Please retry.', 400);
  }
  const secret = env.RECAPTCHA_SECRET_KEY, siteKey = env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (!secret || !siteKey) {
    throw new SecurityError('New account security checks are not configured yet. Please retry later. Existing accounts can still sign in.', 503);
  }
  const hostnames = (env.RECAPTCHA_ALLOWED_HOSTNAMES || 'recall.touchmarkdes.com')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (env.NODE_ENV !== 'production') hostnames.push('localhost', '127.0.0.1');
  return validateChallenge(body.captchaToken, {
    secret, hostnames, fetcher,
    minScore: env.RECAPTCHA_MIN_SCORE === undefined ? 0.5 : Number(env.RECAPTCHA_MIN_SCORE),
  });
}
