import { Component, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css'
})
export class AdminComponent {
  username = 'admin';
  password = 'admin123';
  label = 'demo-asset-key';

  tokenPreview = '';
  rawKeyOnce = '';
  error = '';
  keys: any[] = [];
  loading = false;

  constructor(public api: ApiService, private cdr: ChangeDetectorRef) {}

  async login() {
    this.error = '';
    this.loading = true;
    try {
      const token = await this.api.login(this.username, this.password);
      this.api.setToken(token);
      this.tokenPreview = token.slice(0, 20) + '...';
      await this.refreshKeys();
    } catch (e: any) {
      this.error = e?.message || String(e);
    } finally {
      this.loading = false;
      this.cdr.detectChanges(); // <-- forces UI update
    }
  }

  async refreshKeys() {
    if (!this.api.token) return;
    try {
      this.keys = await this.api.listKeys();
    } finally {
      this.cdr.detectChanges(); // <-- forces UI update
    }
  }

  async createKey() {
    this.error = '';
    this.rawKeyOnce = '';
    this.loading = true;
    try {
      const created = await this.api.createKey(this.label);
      this.rawKeyOnce = created.raw_key_once;
      await this.refreshKeys();
    } catch (e: any) {
      this.error = e?.message || String(e);
    } finally {
      this.loading = false;
      this.cdr.detectChanges(); // <-- forces UI update
    }
  }

  async revoke(id: number) {
    this.error = '';
    this.loading = true;
    try {
      await this.api.revokeKey(id);
      await this.refreshKeys();
    } catch (e: any) {
      this.error = e?.message || String(e);
    } finally {
      this.loading = false;
      this.cdr.detectChanges(); // <-- forces UI update
    }
  }

  logout() {
    this.api.clearToken();
    this.tokenPreview = '';
    this.rawKeyOnce = '';
    this.keys = [];
    this.cdr.detectChanges(); // <-- forces UI update
  }
}
