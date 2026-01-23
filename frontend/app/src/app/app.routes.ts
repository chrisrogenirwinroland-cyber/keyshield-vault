import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'admin' },

  {
    path: 'admin',
    loadComponent: () =>
      import('./pages/admin/admin.component').then((m) => m.AdminComponent),
  },
  {
    path: 'client',
    loadComponent: () =>
      import('./pages/client/client.component').then((m) => m.ClientComponent),
  },

  { path: '**', redirectTo: 'admin' },
];
