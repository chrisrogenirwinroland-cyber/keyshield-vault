import { Component, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-client',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './client.component.html',
  styleUrl: './client.component.css'
})
export class ClientComponent {
  apiKey = '';
  accessMsg = '';
  rotatedKey = '';
  error = '';
  loading = false;

  constructor(public api: ApiService, private cdr: ChangeDetectorRef) {}

  async accessAsset() {
    this.error = '';
    this.accessMsg = '';
    this.rotatedKey = '';
    this.loading = true;

    try {
      const r = await this.api.clientAccess(this.apiKey);
      this.accessMsg = r?.asset?.message || 'Access granted';
      this.rotatedKey = r?.rotated_key_once || '';
      if (this.rotatedKey) this.apiKey = this.rotatedKey; // convenience
    } catch (e: any) {
      this.error = e?.message || String(e);
    } finally {
      this.loading = false;
      this.cdr.detectChanges(); // <-- forces UI update
    }
  }
}
