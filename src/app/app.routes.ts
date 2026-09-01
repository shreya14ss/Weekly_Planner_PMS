import { Routes } from '@angular/router';

import { authGuard, guestGuard, roleGuard } from '@core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('@features/auth/login-page/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/app-shell/app-shell.component').then((m) => m.AppShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('@features/dashboard/dashboard-page/dashboard-page.component').then(
            (m) => m.DashboardPageComponent,
          ),
      },
      {
        path: 'projects',
        loadComponent: () =>
          import('@features/projects/projects-page/projects-page.component').then(
            (m) => m.ProjectsPageComponent,
          ),
      },
      {
        path: 'alerts',
        loadComponent: () =>
          import('@features/alerts/alerts-page/alerts-page.component').then(
            (m) => m.AlertsPageComponent,
          ),
      },
      {
        path: 'completed',
        loadComponent: () =>
          import('@features/completed/completed-page/completed-page.component').then(
            (m) => m.CompletedPageComponent,
          ),
      },
      {
        path: 'users',
        canActivate: [roleGuard(['pm'])],
        loadComponent: () =>
          import('@features/users/users-page/users-page.component').then(
            (m) => m.UsersPageComponent,
          ),
      },
      {
        path: 'history',
        canActivate: [roleGuard(['pm', 'tl'])],
        loadComponent: () =>
          import('@features/history/history-page/history-page.component').then(
            (m) => m.HistoryPageComponent,
          ),
      },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
