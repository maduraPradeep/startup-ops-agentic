const goTrueUrl = () =>
  `${process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'}/auth/v1`;

const anonKey = () => process.env.SUPABASE_ANON_KEY ?? '';

function goTrueHeaders() {
  return { 'Content-Type': 'application/json', apikey: anonKey() };
}

export interface GoTrueUser {
  id: string;
  email: string;
  app_metadata: {
    role?: string;
    tenant_id?: string;
    tenant_name?: string;
    name?: string;
    [k: string]: unknown;
  };
  user_metadata: Record<string, unknown>;
}

export interface GoTrueSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: GoTrueUser;
}

export const AuthModel = {
  async login(email: string, password: string): Promise<GoTrueSession | null> {
    const res = await fetch(`${goTrueUrl()}/token?grant_type=password`, {
      method: 'POST',
      headers: goTrueHeaders(),
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return null;
    return res.json() as Promise<GoTrueSession>;
  },

  async refresh(refreshToken: string): Promise<GoTrueSession | null> {
    const res = await fetch(`${goTrueUrl()}/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: goTrueHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    return res.json() as Promise<GoTrueSession>;
  },
};
