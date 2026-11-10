import '@nestjs/authentication';

export interface AuthPrincipal {
  id: string;
  email: string;
  status: 'enabled' | 'disabled';
}

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: AuthPrincipal;
  }
}
