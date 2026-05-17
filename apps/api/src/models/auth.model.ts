const directusUrl = () => process.env.DIRECTUS_URL ?? 'http://localhost:8055';

export interface DirectusUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: string;
  tenant_id?: string;
  tenant_name?: string;
}

export const AuthModel = {
  async login(email: string, password: string): Promise<{ access_token: string } | null> {
    const res = await fetch(`${directusUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return null;
    const body = await res.json() as { data: { access_token: string } };
    return body.data;
  },

  async getUser(accessToken: string): Promise<DirectusUser | null> {
    const res = await fetch(`${directusUrl()}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const body = await res.json() as { data: DirectusUser };
    return body.data;
  },

  async refresh(refreshToken: string): Promise<unknown | null> {
    const res = await fetch(`${directusUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    return res.json();
  },
};
