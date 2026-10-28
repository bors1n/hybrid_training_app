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
vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 5000 });

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
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Сила', 'Кардио', 'Комплексы', 'Баланс']);
    expect(screen.getByRole('tab', { name: 'Сила' }).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByText(/Пока нет выполненных силовых подходов/)).toBeTruthy();
    tab('Кардио');
    expect(await screen.findByText(/Бег: пока нет записей/)).toBeTruthy();
    tab('Комплексы');
    expect(await screen.findByText(/Пока нет результатов комплексов/)).toBeTruthy();
    tab('Баланс');
    expect(await screen.findByText(/баланс и регулярность появятся/)).toBeTruthy();
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
        strength('splav:pullup', [set(10, 5, { load: 'added' })]),
        strength('splav:gravitron', [set(18.5, 6, { load: 'assisted' })]),
      ],
    }));
    open();

    // Первым в списке — упражнение, сделанное последним; здесь все в один день — выбираем явно.
    const picker = await screen.findByLabelText('Упражнение');
    const options = within(picker).getAllByRole('option').map((o) => o as HTMLOptionElement);
    expect(options).toHaveLength(3);
    const squat = options.find((o) => o.value === 'repdb:squat')!;
    fireEvent.change(picker, { target: { value: squat.value } });

    const normal = await screen.findByRole('region', { name: /: Обычный вес$/ });
    expect(within(normal).getByText('1ПМ РАСЧЁТНЫЙ')).toBeTruthy();
    expect(within(normal).getByText('99,2 кг')).toBeTruthy(); // 85 × (1 + 5/30)
    expect(within(normal).getByText('8')).toBeTruthy(); // средний RPE: подходы с RPE 8, 8
    expect(within(normal).getByRole('table', { name: /Лучший подход по повторам/ }).textContent).toContain('85 кг');

    fireEvent.change(picker, { target: { value: 'splav:pullup' } });
    const added = await screen.findByRole('region', { name: /: С отягощением$/ });
    expect(within(added).queryByText('1ПМ РАСЧЁТНЫЙ')).toBeNull();
    expect(screen.queryByRole('region', { name: /: Обычный вес$/ })).toBeNull();
    expect(within(added).getAllByText(/\+?10 кг/).length).toBeGreaterThan(0);

    fireEvent.change(picker, { target: { value: 'splav:gravitron' } });
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
    tab('Кардио');
    expect((await screen.findAllByText('3,09 км')).length).toBeGreaterThan(1); // плитка «самая длинная» и таблица
    expect(screen.getAllByText('7:46 /км').length).toBeGreaterThan(0);
    expect(screen.queryByText('7:49 /км')).toBeNull();
    const table = screen.getByRole('table', { name: 'Последние тренировки' });
    expect(table.textContent).toContain('24:08');
    expect(screen.getByRole('figure', { name: 'Километры по неделям' })).toBeTruthy();
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
    tab('Кардио');
    const chips = await screen.findByRole('group', { name: 'Вид кардио' });
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
  it('#005 «9 раундов» — в истории с рекордом; нераскрытые не показывают историю', async () => {
    await ensureSeed();
    const k = (id: string, date: string, rounds: number, extraReps?: number) =>
      saveRecord('sessions', session(id, {
        date, type: 'conditioning',
        blocks: [{ type: 'conditioning', id: 'k', complexId: '#005', format: 'AMRAP', result: { rounds, ...(extraReps ? { extraReps } : {}) } }] as never,
      }));
    await k('a', '2026-10-11', 9);
    await k('b', '2026-10-18', 7, 14);
    open();
    tab('Комплексы');
    const head = await screen.findByRole('button', { name: /#005/ });
    expect(head.textContent).toContain('2 попытки');
    expect(head.textContent).toContain('рекорд 9 раундов');
    expect(screen.queryByRole('list', { name: 'История результатов' })).toBeNull();

    fireEvent.click(head);
    const history = await screen.findByRole('list', { name: 'История результатов' });
    const rows = within(history).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('7 + 14'); // новая попытка сверху
    expect(rows[1]).toContain('9 раундов');
    expect(rows[1]).toContain('рекорд');
    expect(rows[0]).not.toContain('рекорд');
    expect(screen.getByText(/Ещё 23 из библиотеки не делали/)).toBeTruthy();
  });
});

describe('Прогресс: баланс', () => {
  it('серия недель, теплокарта с числом тренировок', async () => {
    const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    await saveRecord('sessions', session('now', { date: day(now), blocks: [strength('x', [set(50, 5)])] }));
    await saveRecord('sessions', session('prev', { date: day(weekAgo), blocks: [strength('x', [set(50, 5)])] }));
    open();
    tab('Баланс');
    await waitFor(() => expect(screen.getByText('НЕДЕЛЬ ПОДРЯД')).toBeTruthy());
    expect(screen.getByText('недели с тренировками')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Теплокарта: 2 тренировки за год' })).toBeTruthy();
    expect(screen.getByRole('figure', { name: 'Тренировки по неделям' })).toBeTruthy();
    expect(screen.getByRole('figure', { name: 'Минуты по неделям' })).toBeTruthy();
  });
});
