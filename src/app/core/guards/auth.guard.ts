import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '@core/services/auth.service';
import { UserRole } from '@models/user';

/** Requires an authenticated session; redirects to /login otherwise. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  router.navigate(['/login']);
  return false;
};

/** Route data: { roles: UserRole[] } — allow only those roles. */
export const roleGuard = (allowed: readonly UserRole[]): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const role = auth.role();
  if (role && allowed.includes(role)) return true;
  router.navigate(['/app/dashboard']);
  return false;
};

/** Redirect authenticated users away from /login. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return true;
  router.navigate(['/app/dashboard']);
  return false;
};
