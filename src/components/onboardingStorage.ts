export const ONBOARDING_STORAGE_KEY = (uid: string) => `onboarding_v3_${uid}`;

export function onboardingJaApresentado(uid: string): boolean {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY(uid)) === '1';
  } catch {
    return false;
  }
}

export function marcarOnboardingApresentado(uid: string): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY(uid), '1');
  } catch {
    // Sem armazenamento persistente o tour ainda pode ser exibido nesta sessão.
  }
}
