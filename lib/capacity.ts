/**
 * Login / token-refresh capacity planning (docs/PRE_PRODUCTION_CHECKLIST.md §16).
 *
 * Supabase Auth counts sign-ins AND token refreshes against one rate limit per
 * client IP. At a college event every team logs in through the same Vercel
 * servers / the same campus IP, so the whole event shares one budget.
 *
 * needed per 5 min = ceil(devices × burstShare × (1 + failureRate) × safety)
 *   devices    = teams × devicesPerTeam
 *   burstShare = share of devices that log in within the busiest 5 minutes:
 *                1 if everyone logs in within 5 min, else min(1, 2 × 5 / window)
 *                (uniform arrival over the window, ×2 for clumping)
 *   failureRate = wrong PINs / retries (default 15%)
 *   safety      = margin (default ×2)
 * Token refreshes arrive in a similar wave about one token lifetime (default
 * 1 h) after the logins, so the same number also covers the refresh wave.
 */
export type CapacityInput = {
  teams: number;
  devicesPerTeam: number;
  /** minutes over which logins are spread (5 or less = "everyone at once") */
  loginWindowMinutes: number;
  failureRate?: number;
  safety?: number;
};

export type CapacityPlan = {
  devices: number;
  burstShare: number;
  peakPer5Min: number;
  recommendedPer5Min: number;
};

export function planAuthCapacity(i: CapacityInput): CapacityPlan {
  const teams = Math.max(0, Math.floor(i.teams));
  const perTeam = Math.max(1, Math.floor(i.devicesPerTeam));
  const window = Math.max(1, i.loginWindowMinutes);
  const failure = Math.max(0, i.failureRate ?? 0.15);
  const safety = Math.max(1, i.safety ?? 2);
  const devices = teams * perTeam;
  const burstShare = window <= 5 ? 1 : Math.min(1, (2 * 5) / window);
  const peak = devices * burstShare * (1 + failure);
  return {
    devices,
    burstShare,
    peakPer5Min: Math.ceil(peak),
    recommendedPer5Min: Math.ceil(peak * safety),
  };
}

/** Event settings read from server-only environment variables (all optional). */
export function capacitySettings(env: Record<string, string | undefined> = process.env) {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return v !== undefined && v !== "" && Number.isFinite(n) && n > 0 ? n : d;
  };
  const configured = num(env.SUPABASE_AUTH_TOKEN_LIMIT_PER_5MIN, 0);
  return {
    /** ASSUMPTION (can be changed): 3 devices per team */
    devicesPerTeam: num(env.EVENT_DEVICES_PER_TEAM, 3),
    /** ASSUMPTION (can be changed): worst case — everyone logs in within 5 minutes */
    loginWindowMinutes: num(env.EVENT_LOGIN_WINDOW_MINUTES, 5),
    /** what the organiser set in Supabase (0 = not recorded yet) */
    configuredLimitPer5Min: configured,
  };
}
