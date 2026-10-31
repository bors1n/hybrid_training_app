// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLocalData, db } from '../../data/db.ts';
import { ensureSeed } from '../../seed/install.ts';
import { saveRecord } from '../../sync/records.ts';
import { session } from '../../test/fixtures.ts';
import { ProgressScreen } from './ProgressScreen.tsx';

// Графики подгружаются отдельным куском (Recharts); под нагрузкой полного прогона это занимает секунды.
vi.setConfig({ testTimeout: 40_000 });
configure({ asyncUtilTimeout: 10_000 });

beforeEach(async () => {
  await db.open();
  await clearLocalData();
});
afterEach(cleanup);

const open = () => render(<MemoryRouter><ProgressScreen /></MemoryRouter>);
const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));
const set = (weightKg: number, reps: number, extra: object = {}) => ({ weightKg, reps, done: true, load: 'normal' as const, ...extra });
const strength = (exerciseId: string, sets: object[]) => ({ type: 'strength' as const, id: `b-${exerciseId}`, superset: false, items: [{ exerciseId, sets }] }) as never;

describe('Прогресс: вкладки', () => {
  it('четыре раздела, «Сила» открыта; пустое состояние понятно', async () => {
    open();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Баланс', 'Сила', 'Выносливость', 'Комплексы']);
    expect(screen.getByRole('tab', { name: 'Баланс' }).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByText(/баланс и регулярность появятся/)).toBeTruthy();
    tab('Сила');
    expect(await screen.findByText(/Пока нет выполненных силовых подходов/)).toBeTruthy();
    tab('Выносливость');
    expect(await screen.findByText(/Выносливость: пока нет записей/)).toBeTruthy();
    tab('Комплексы');
    expect(await screen.findByText(/Пока нет результатов комплексов/)).toBeTruthy();
    // история остаётся под вкладками
    expect(screen.getByRole('region', { name: 'История' })).toBeTruthy();
  });
});

describe('Прогресс: сила', () => {
  it('+10 кг и противовес 18,5 кг — разные разделы; RPE подходов виден в среднем', async () => {
    await saveRecord('sessions', session('a', {
      date: '2026-10-13',
      blocks: [
        strength('repdb:squat', [set(80, 5), set(85, 5, { rpe: 8 }), set(85, 5, { rpe: 8 })]),
        strength('hybridlog:pullup', [set(10, 5, { load: 'added' })]),
        strength('hybridlog:gravitron', [set(18.5, 6, { load: 'assisted' })]),
      ],
    }));
    open();
    tab('Сила');

    // Первым в списке — упражнение, сделанное последним; здесь все в один день — выбираем явно.
    const picker = await screen.findByLabelText('Упражнение');
    const options = within(picker).getAllByRole('option').map((o) => o as HTMLOptionElement);
    expect(options).toHaveLength(3);
    const squat = options.find((o) => o.value === 'repdb:squat')!;
    fireEvent.change(picker, { target: { value: squat.value } });

    const normal = await screen.findByRole('region', { name: /: Обычный вес$/ });
    expect(within(normal).getByText('РАСЧЁТНЫЙ 1ПМ')).toBeTruthy();
    expect(within(normal).getByText('99,2')).toBeTruthy(); // 85 × (1 + 5/30)
    expect(normal.textContent).toContain('РЕКОРД85 кг × 5');
    expect(normal.textContent).toContain('СР. RPE8'); // средний RPE: подходы с RPE 8, 8
    expect(within(normal).getByRole('table', { name: /Лучший подход по повторам/ }).textContent).toContain('85 кг');

    fireEvent.change(picker, { target: { value: 'hybridlog:pullup' } });
    const added = await screen.findByRole('region', { name: /: С отягощением$/ });
    expect(within(added).queryByText('РАСЧЁТНЫЙ 1ПМ')).toBeNull();
    expect(screen.queryByRole('region', { name: /: Обычный вес$/ })).toBeNull();
    expect(within(added).getAllByText(/\+?10 кг/).length).toBeGreaterThan(0);

    fireEvent.change(picker, { target: { value: 'hybridlog:gravitron' } });
    const assisted = await screen.findByRole('region', { name: /: С противовесом$/ });
    expect(within(assisted).getByText('МИНИМУМ ПРОТИВОВЕСА')).toBeTruthy();
    expect(assisted.textContent).toContain('18,5 кг');
  });
});

describe('Прогресс: кардио', () => {
  it('пробежка 3,09 км: дистанция в неделях, показан темп часов 7:46, а не расчётный 7:49', async () => {
    await saveRecord('sessions', session('run', {
      date: '2026-10-20', type: 'cardio', title: 'Бег',
      blocks: [{ type: 'cardio', id: 'c', modality: 'run', role: 'main', distanceM: 3090, durationSec: 1448, paceSecPerKm: 469, recordedPace: 466 }],
    }));
    open();
    tab('Выносливость');
    // «Все» открыта по умолчанию: итоги по всем видам
    const chips = await screen.findByRole('group', { name: 'Вид кардио' });
    expect(within(chips).getByRole('button', { name: 'Все · 1' }).getAttribute('aria-pressed')).toBe('true');
    expect(await screen.findByText('ДИСТАНЦИЯ')).toBeTruthy();
    expect(screen.getByText('3,09 км')).toBeTruthy();
    expect(screen.getByText('24 мин')).toBeTruthy();
    expect(screen.getByRole('figure', { name: 'Километры по неделям' })).toBeTruthy();
    expect(screen.getByRole('figure', { name: 'Минуты по неделям' })).toBeTruthy();
    expect(screen.getByRole('figure', { name: 'Темп по тренировкам' })).toBeTruthy();

    fireEvent.click(within(chips).getByRole('button', { name: 'Бег · 1' }));
    expect(await screen.findByText('САМАЯ ДЛИННАЯ')).toBeTruthy();
    expect(screen.getByText('3,09 км')).toBeTruthy();
    expect(screen.getAllByText('7:46 /км').length).toBeGreaterThan(0);
    expect(screen.queryByText('7:49 /км')).toBeNull();
    expect(screen.queryByRole('table', { name: 'Последние тренировки' })).toBeNull();
  });

  it('вело и «другое» разделены; у разминки темпа нет', async () => {
    await saveRecord('sessions', session('mix', {
      date: '2026-10-20', type: 'cardio',
      blocks: [
        { type: 'cardio', id: 'w', modality: 'treadmill', role: 'warmup', distanceM: 1000, durationSec: 600 },
        { type: 'cardio', id: 'b', modality: 'bike', role: 'main', distanceM: 20_000, durationSec: 3000 },
        { type: 'cardio', id: 'r', modality: 'row', role: 'main', distanceM: 2000, durationSec: 480 },
      ],
    }));
    open();
    tab('Выносливость');
    const chips = await screen.findByRole('group', { name: 'Вид кардио' });
    expect(within(chips).getByRole('button', { name: 'Все · 3' })).toBeTruthy();
    expect(within(chips).getByRole('button', { name: 'Бег · 1' })).toBeTruthy(); // разминка на дорожке — «Бег», но без темпа
    expect(within(chips).getByRole('button', { name: 'Вело · 1' })).toBeTruthy();
    expect(within(chips).getByRole('button', { name: 'Другое · 1' })).toBeTruthy();

    expect(screen.queryByText(/\/км/)).toBeNull(); // на бегу пока только разминка: темпа нет
    fireEvent.click(within(chips).getByRole('button', { name: 'Вело · 1' }));
    expect(await screen.findByText('САМАЯ БЫСТРАЯ')).toBeTruthy();
    expect(screen.getAllByText('24 км/ч').length).toBeGreaterThan(0);
  });
});

describe('Прогресс: комплексы', () => {
  it('итоги и лента: каждое выполнение — своя карточка, новые сверху, рекорд у лучшей', async () => {
    await ensureSeed();
    const k = (id: string, date: string, rounds: number, extraReps?: number, complexId = '#005') =>
      saveRecord('sessions', session(id, {
        date, type: 'conditioning',
        blocks: [{ type: 'conditioning', id: 'k', complexId, name: complexId === '#005' ? 'Пятый' : 'Первый', format: 'AMRAP', result: { rounds, ...(extraReps ? { extraReps } : {}) } }] as never,
      }));
    await k('a', '2026-10-11', 9);
    await k('b', '2026-10-18', 7, 14);
    await k('c', '2026-10-15', 5, undefined, '#001');
    open();
    tab('Комплексы');

    const feed = await screen.findByRole('list', { name: 'Выполненные комплексы' });
    const cards = within(feed).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toContain('#005 · Пятый');
    expect(cards[0]).toContain('7 + 14'); // самое новое — сверху
    expect(cards[0]).not.toContain('рекорд');
    expect(cards[1]).toContain('#001 · Первый');
    expect(cards[1]).not.toContain('рекорд'); // единственная попытка
    expect(cards[2]).toContain('9 раундов');
    expect(cards[2]).toContain('рекорд');

    expect(screen.getByText('КОМПЛЕКСОВ').nextElementSibling!.textContent).toBe('3');
    expect(screen.getByText('РАУНДОВ').nextElementSibling!.textContent).toBe('21');
    expect(screen.getByText('ПОВТОРОВ').nextElementSibling!.textContent).toBe('14');
    expect(screen.queryByRole('region', { name: 'Баланс' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Регулярность' })).toBeNull();
  });
});

describe('Прогресс: баланс', () => {
  const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  it('баланс сила — выносливость по числу тренировок, серия с огоньком, регулярность, графики', async () => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    await saveRecord('sessions', session('now', { date: day(now), blocks: [strength('x', [set(50, 5)])] }));
    await saveRecord('sessions', session('prev', { date: day(weekAgo), blocks: [strength('x', [set(50, 5)])] }));
    await saveRecord('sessions', session('run', {
      date: day(now), type: 'cardio',
      blocks: [{ type: 'cardio', id: 'c', modality: 'run', role: 'main', distanceM: 3000, durationSec: 1000 }],
    }));
    open();

    const balance = await screen.findByRole('region', { name: 'Баланс' });
    expect(within(balance).getByRole('img', { name: 'Тренировки за 4 недели: Сила 2, Выносливость 1' })).toBeTruthy();
    expect(balance.textContent).toContain('Выносливость1');

    expect(screen.getByText('НЕДЕЛЬ ПОДРЯД')).toBeTruthy();
    expect(screen.getByText('недели с тренировками')).toBeTruthy();
    expect(screen.getByText('РЕКОРД СЕРИИ').nextElementSibling!.textContent).toBe('2');
    expect(screen.getByRole('img', { name: 'Огонёк' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Регулярность' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Тренировки по дням за 6 месяцев: 3 тренировки' })).toBeTruthy();
    expect(screen.getByRole('figure', { name: 'Тренировки по неделям' })).toBeTruthy();
    expect(screen.getByRole('figure', { name: 'Минуты по неделям' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Баланс недели' })).toBeNull();
    expect(screen.queryByText(/остаток длительности/)).toBeNull();
    // порядок: баланс → серия → регулярность → графики
    const order = [balance, screen.getByText('НЕДЕЛЬ ПОДРЯД'), screen.getByRole('region', { name: 'Регулярность' }), screen.getByRole('figure', { name: 'Тренировки по неделям' })];
    for (let i = 1; i < order.length; i += 1) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('огонёк у рекорда серии; «Регулярность» и «Баланс недели» не висят под другими вкладками, у силы есть общая аналитика', async () => {
    await saveRecord('sessions', session('a', { date: day(new Date()), blocks: [strength('x', [set(50, 5)])] }));
    open();
    await screen.findByRole('region', { name: 'Баланс' });
    expect(screen.getByRole('img', { name: 'Огонёк' })).toBeTruthy(); // одна неделя подряд — рекорд 1
    tab('Сила');
    await screen.findByLabelText('Упражнение');
    expect(screen.queryByRole('region', { name: 'Регулярность' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Баланс недели' })).toBeNull();
    const overview = screen.getByRole('region', { name: 'Силовые в целом' });
    expect(within(overview).getByRole('figure', { name: 'Тоннаж по неделям' })).toBeTruthy();
    expect(within(overview).getByText('ТРЕНИРОВОК')).toBeTruthy();
  });
});
