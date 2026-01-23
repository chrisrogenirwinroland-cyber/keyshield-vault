import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ApiService {
  baseUrl = 'http://localhost:3000';
  token: string | null = localStorage.getItem('token');

  setToken(t: string) {
    this.token = t;
    localStorage.setItem('token', t);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('token');
  }

  async login(username: string, password: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

    const data = JSON.parse(text);
    return data.token;
  }

  async createKey(label: string): Promise<any> {
    if (!this.token) throw new Error('No token');
    const res = await fetch(`${this.baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ label }),
    });

    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    return JSON.parse(text);
  }

  async listKeys(): Promise<any[]> {
    if (!this.token) throw new Error('No token');
    const res = await fetch(`${this.baseUrl}/admin/keys`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    return JSON.parse(text);
  }

  async revokeKey(id: number): Promise<any> {
    if (!this.token) throw new Error('No token');
    const res = await fetch(`${this.baseUrl}/admin/keys/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.token}` },
    });

    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    return JSON.parse(text);
  }

  async clientAccess(apiKey: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/client/access`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
    });

    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    return JSON.parse(text);
  }
}
