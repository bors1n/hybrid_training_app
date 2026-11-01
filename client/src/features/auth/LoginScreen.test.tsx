// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_URL, PRIVACY_URL } from '../../auth/legal.ts';

vi.mock('../../auth/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../auth/api.ts')>()),
  authApi: { requestCode: vi.fn(async () => undefined), verifyCode: vi.fn(), me: vi.fn(), logout: vi.fn() },
}));
const { authApi } = await import('../../auth/api.ts');
const { LoginScreen } = await import('./LoginScreen.tsx');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('экран входа: согласие на обработку данных', () => {
  it('кнопка «Получить код» недоступна, пока не отмечено согласие, и код не запрашивается', () => {
    render(<LoginScreen />);
    fireEvent.change(screen.getByLabelText('Почта'), { target: { value: 'a@example.com' } });
    const button = screen.getByRole('button', { name: 'Получить код' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(authApi.requestCode).not.toHaveBeenCalled();
  });

  it('ссылки ведут на согласие и политику на сайте', () => {
    render(<LoginScreen />);
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain(CONSENT_URL);
    expect(hrefs).toContain(PRIVACY_URL);
  });

  it('после согласия код запрашивается', async () => {
    render(<LoginScreen />);
    fireEvent.change(screen.getByLabelText('Почта'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Получить код' }));
    await waitFor(() => expect(authApi.requestCode).toHaveBeenCalledWith('a@example.com'));
  });
});
