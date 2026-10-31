import { useState, type FormEvent, type ReactElement } from 'react';
import { CODE_LENGTH, EmailSchema } from '@hybridlog/shared';
import { authApi, InvalidCodeError } from '../../auth/api.ts';
import { useAuth } from '../../auth/store.ts';
import { NetworkError } from '../../sync/engine.ts';
import { RateLimitError } from '../../sync/http.ts';

function errorText(e: unknown): string {
  if (e instanceof InvalidCodeError) return 'Неверный или просроченный код. Запросите новый.';
  if (e instanceof RateLimitError) return 'Слишком много попыток. Подождите несколько минут.';
  if (e instanceof NetworkError) return 'Нет связи с сервером. Для первого входа нужен интернет.';
  return 'Не получилось. Проверьте данные и попробуйте ещё раз.';
}

function Logo(): ReactElement {
  return (
    <svg width="250" height="48" viewBox="0 0 250 48" role="img" aria-label="HybridLog">
      <rect x="0" y="4" width="9" height="40" fill="#7C9BFF" />
      <rect x="25" y="4" width="9" height="40" fill="#8FD0FF" />
      <rect x="9" y="20" width="16" height="8" fill="#F3F5F8" />
      <text x="44" y="42" textLength="206" lengthAdjust="spacingAndGlyphs" fontFamily="Unbounded, sans-serif" fontWeight="800" fontSize="38" fill="#F3F5F8">YBRIDLOG</text>
    </svg>
  );
}

export function LoginScreen(): ReactElement {
  const completeLogin = useAuth((s) => s.completeLogin);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedEmail = EmailSchema.safeParse(email);

  async function sendCode(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!parsedEmail.success) {
      setError('Проверьте адрес почты');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authApi.requestCode(parsedEmail.data);
      setCode('');
      setStep('code');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!parsedEmail.success) return;
    setBusy(true);
    setError(null);
    try {
      await completeLogin(await authApi.verifyCode(parsedEmail.data, code));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <svg className="login__track" width="390" height="480" viewBox="0 0 390 480" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
        <g stroke="#2A3140" strokeWidth="2"><path d="M0 120 H390" /><path d="M0 240 H390" /><path d="M0 360 H390" /><path d="M0 480 H390" /></g>
        <rect x="300" y="0" width="5" height="480" fill="#F3F5F8" opacity="0.85" />
        <g fontFamily="Unbounded, sans-serif" fontWeight="800" fontSize="64" fill="#2A3140">
          <text x="320" y="96">1</text><text x="320" y="216">2</text><text x="320" y="336">3</text>
        </g>
      </svg>

      <div className="login__body">
        <Logo />
        <p className="login__title">
          Сила и <span className="login__sticker">выносливость</span> в одном журнале
        </p>
        <p className="login__lead">
          Веди подходы, бег и комплексы. Аккаунт хранит историю и синхронизирует её между телефоном и компьютером.
        </p>

        {step === 'email' ? (
          <form className="login__form" onSubmit={sendCode} noValidate>
            <label className="login__label">
              <span>Почта</span>
              <input
                className="login__input"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                placeholder="alex@mail.ru"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                required
              />
            </label>
            {error ? <p className="login__error" role="alert">{error}</p> : null}
            <button type="submit" className="htr-btn htr-btn--night login__btn" disabled={busy || email.trim() === ''}>
              {busy ? 'Отправляем…' : 'Получить код'}
            </button>
            <p className="login__hint">Есть таблица с тренировками? После входа загрузи её через CSV в профиле.</p>
          </form>
        ) : (
          <form className="login__form" onSubmit={verify} noValidate>
            <label className="login__label">
              <span>Код из письма на {parsedEmail.success ? parsedEmail.data : ''}</span>
              <input
                className="login__input login__input--code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={CODE_LENGTH}
                placeholder="••••••"
                value={code}
                onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </label>
            {error ? <p className="login__error" role="alert">{error}</p> : null}
            <button type="submit" className="htr-btn htr-btn--night login__btn" disabled={busy || code.length !== CODE_LENGTH}>
              {busy ? 'Проверяем…' : 'Войти'}
            </button>
            <button type="button" className="htr-btn login__ghost" disabled={busy} onClick={() => { setStep('email'); setError(null); }}>
              Изменить почту
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
