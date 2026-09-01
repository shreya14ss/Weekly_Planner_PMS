import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputOtpModule } from 'primeng/inputotp';
import { MessageModule } from 'primeng/message';

import { AuthService } from '@core/services/auth.service';
import { UserRepository } from '@core/pouchdb/user.repository';

interface UserOption {
  id: string;
  label: string;
}

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule, ButtonModule, SelectModule, InputOtpModule, MessageModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly users = inject(UserRepository);
  private readonly router = inject(Router);

  readonly selectedUserId = signal<string | null>(null);
  readonly pin = signal<string>('');
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);

  readonly userOptions = computed<UserOption[]>(() =>
    this.users.sorted().map((u) => ({
      id: u._id,
      label: `${u.name} (${u.role === 'pm' ? 'PM' : u.role === 'tl' ? 'TL' : 'Engineer'})`,
    })),
  );

  readonly canSubmit = computed(() => !!this.selectedUserId() && this.pin().length === 4);

  submit(): void {
    this.error.set(null);
    const id = this.selectedUserId();
    if (!id) {
      this.error.set('Please select your name.');
      return;
    }
    if (this.pin().length !== 4) {
      this.error.set('PIN must be 4 digits.');
      return;
    }

    this.submitting.set(true);
    const result = this.auth.login(id, this.pin());
    this.submitting.set(false);

    if (!result.ok) {
      this.error.set(result.error);
      this.pin.set('');
      return;
    }
    this.router.navigate(['/app/dashboard']);
  }
}
