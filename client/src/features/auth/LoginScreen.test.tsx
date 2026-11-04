// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_URL, PRIVACY_URL } from '../../auth/legal.ts';
import { NetworkError } from '../../sync/engine.ts';
import { ServerError } from '../../sync/http.ts';

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

describe('экран входа: ошибки запроса кода', () => {
  async function submit(error: Error): Promise<void> {
    vi.mocked(authApi.requestCode).mockRejectedValueOnce(error);
    render(<LoginScreen />);
    fireEvent.change(screen.getByLabelText('Почта'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Получить код' }));
  }

  it('502: письмо не отправилось, а не «нет связи»', async () => {
    await submit(new ServerError(502));
    expect(await screen.findByText(/Не удалось отправить письмо/)).toBeTruthy();
    expect(screen.queryByText(/Нет связи/)).toBeNull();
  });

  it('другой 5xx: сервер не отвечает', async () => {
    await submit(new ServerError(500));
    expect(await screen.findByText(/Сервер сейчас не отвечает/)).toBeTruthy();
  });

  it('сеть недоступна: нет связи', async () => {
    await submit(new NetworkError('Нет связи с сервером'));
    expect(await screen.findByText(/Нет связи с сервером/)).toBeTruthy();
  });
});
