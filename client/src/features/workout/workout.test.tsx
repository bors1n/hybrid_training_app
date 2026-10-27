// @vitest-environment jsdom
import { SessionRecordSchema, type Block, type SessionRecord } from '@splav/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearLocalData, db } from '../../data/db.ts';
import { HAS_REPDB_CATALOG } from '../../seed/catalog.ts';
import { ensureSeed } from '../../seed/install.ts';
import { saveRecord } from '../../sync/records.ts';
import { session } from '../../test/fixtures.ts';
import { ProgressScreen } from '../progress/ProgressScreen.tsx';
import { TodayScreen } from '../today/TodayScreen.tsx';
import { WorkoutScreen } from './WorkoutScreen.tsx';

/** Тесты с упражнениями RepDB пропускаются, если каталог не собран (npm run seed:media). */
const repdb = it.skipIf(!HAS_REPDB_CATALOG);

beforeEach(async () => {
  await db.open();
  await clearLocalData();
});
afterEach(cleanup);

function renderApp(initial = '/') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/" element={<TodayScreen />} />
        <Route path="/progress" element={<ProgressScreen />} />
        <Route path="/workout/:id" element={<WorkoutScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Ввод в поле: изменить значение и уйти из поля (в запись значение уходит при blur). */
function fill(label: string | RegExp, value: string, root: Pick<typeof screen, 'getByLabelText'> = screen) {
  const el = root.getByLabelText(label);
  fireEvent.change(el, { target: { value } });
  fireEvent.blur(el);
  return el as HTMLInputElement;
}

const click = (name: string | RegExp, root: Pick<typeof screen, 'getByRole'> = screen) => fireEvent.click(root.getByRole('button', { name }));
const region = (name: string) => screen.getByRole('region', { name });

async function sessions(): Promise<SessionRecord[]> {
  const rows = await db.rows('sessions').toArray();
  return rows.flatMap((r) => {
    if (r.deletedAt !== null) return [];
    const p = SessionRecordSchema.safeParse(r);
    return p.success ? [p.data] : [];
  });
}
/** Ждём, пока отложенная запись тренировки дойдёт до базы и условие выполнится. */
const savedWhere = (pred: (s: SessionRecord) => boolean) =>
  waitFor(async () => expect((await sessions()).some(pred)).toBe(true), { timeout: 3000 });

async function addBlock(kind: 'Силовое упражнение' | 'Кардио' | 'Комплекс' | 'Мобильность или кор') {
  click('Добавить блок');
  const sheet = await screen.findByRole('dialog', { name: 'Добавить блок' });
  click(kind, within(sheet));
}

async function pickExercise(dialogName: string, query: string, rowName: RegExp) {
  const dialog = await screen.findByRole('dialog', { name: dialogName });
  fireEvent.change(within(dialog).getByLabelText('Поиск упражнения'), { target: { value: query } });
  fireEvent.click(await within(dialog).findByRole('button', { name: rowName }));
}

/** Выбор упражнения по точному названию (в имени кнопки есть ещё и подпись). */
async function pickExact(dialogName: string, query: string, exactName: string) {
  const dialog = await screen.findByRole('dialog', { name: dialogName });
  fireEvent.change(within(dialog).getByLabelText('Поиск упражнения'), { target: { value: query } });
  await waitFor(() => expect(dialog.querySelector('.pick-row__name')).toBeTruthy());
  const row = [...dialog.querySelectorAll('.pick-row')].find((b) => b.querySelector('.pick-row__name')?.textContent === exactName);
  expect(row, `в списке нет «${exactName}»`).toBeTruthy();
  fireEvent.click(row!);
}

async function startFree() {
  click('Свободная тренировка');
  return screen.findByLabelText('Название тренировки');
}

describe('внесение тренировки с нуля (как «Тренировка 1» из import_template.csv)', () => {
  it('разминка, силовое с RPE, кор, финиш на велотренажёре, RPE тренировки — и всё сохраняется', async () => {
    renderApp();
    await startFree();

    fill('Название тренировки', 'Тренировка 1');
    fireEvent.change(screen.getByLabelText('Дата тренировки'), { target: { value: '2026-10-20' } });

    // Разминка: лестница 10:00
    await addBlock('Кардио');
    let sheet = await screen.findByRole('dialog', { name: 'Кардио' });
    click('Разминка', within(sheet));
    click('Лестница', within(sheet));
    fill('Время', '10:00', within(await screen.findByRole('region', { name: 'Блок: Лестница' })));

    // Силовое: присед в тренажёре 85 × 8, три подхода, у третьего RPE 8
    await addBlock('Силовое упражнение');
    await pickExercise('Силовое упражнение', 'присед в тренажере', /Присед в тренажёре/);
    const squat = await screen.findByRole('region', { name: 'Блок: Присед в тренажёре' });
    fill('Подход 1, вес', '85', within(squat));
    fill('Подход 1, повторы', '8', within(squat));
    fill('Подход 1, RPE', '7', within(squat));
    click('+ Подход (копия)', within(squat));
    click('+ Подход (копия)', within(squat));
    fill('Подход 3, RPE', '8', within(squat));

    // Кор-комплекс 10:00
    await addBlock('Мобильность или кор');
    await pickExercise('Мобильность и кор', 'кор-комплекс', /Кор-комплекс/);
    fill('Кор-комплекс, время', '10:00', within(await screen.findByRole('region', { name: 'Блок: мобильность' })));

    // Финиш: велотренажёр 15:00, «зона 2»
    await addBlock('Кардио');
    sheet = await screen.findByRole('dialog', { name: 'Кардио' });
    click('Финиш', within(sheet));
    click('Велотренажёр', within(sheet));
    const bike = await screen.findByRole('region', { name: 'Блок: Велотренажёр' });
    fill('Время', '15:00', within(bike));
    fill('Заметка к кардио', 'зона 2', within(bike));

    // Итог
    fireEvent.click(screen.getByRole('button', { name: 'RPE тренировки 8' }));

    // Подход 2 — копия, он не отмечен: при завершении приложение спросит
    click('Завершить');
    const ask = await screen.findByRole('dialog', { name: 'Невыполненные подходы' });
    click('Отметить выполненными', within(ask));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Сегодня' })).toBeTruthy());

    const [s] = await sessions();
    expect(s).toMatchObject({ title: 'Тренировка 1', date: '2026-10-20', rpe: 8, type: 'strength' });
    expect(s!.finishedAt).toBeGreaterThan(0);
    expect(s!.blocks.map((b: Block) => b.type)).toEqual(['cardio', 'strength', 'mobility', 'cardio']);

    const [warm, str, mob, fin] = s!.blocks;
    expect(warm).toMatchObject({ modality: 'stairs', role: 'warmup', name: 'Лестница', durationSec: 600 });
    expect(str).toMatchObject({ type: 'strength', superset: false });
    if (str?.type === 'strength') {
      expect(str.items[0]!.exerciseId).toBe('splav:machine-squat');
      expect(str.items[0]!.sets).toEqual([
        { weightKg: 85, reps: 8, rpe: 7, done: true, load: 'normal' },
        { weightKg: 85, reps: 8, done: true, load: 'normal' },
        { weightKg: 85, reps: 8, rpe: 8, done: true, load: 'normal' },
      ]);
    }
    expect(mob).toMatchObject({ type: 'mobility', items: [{ exerciseId: 'splav:core-complex', durationSec: 600 }] });
    expect(fin).toMatchObject({ modality: 'indoor_bike', role: 'finisher', durationSec: 900, notes: 'зона 2' });

    // Запись поставлена в очередь отправки и появилась в списке «Последние»
    expect(await db.outbox.get(`sessions:${s!.id}`)).toBeTruthy();
    expect(await screen.findByText('Тренировка 1')).toBeTruthy();
  }, 30_000);

  it('«Убрать эти подходы» оставляет только выполненные', async () => {
    renderApp();
    await startFree();
    await addBlock('Силовое упражнение');
    await pickExercise('Силовое упражнение', 'присед в тренажере', /Присед в тренажёре/);
    const card = await screen.findByRole('region', { name: 'Блок: Присед в тренажёре' });
    fill('Подход 1, вес', '80', within(card));
    fill('Подход 1, повторы', '10', within(card));
    click('+ Подход (копия)', within(card));
    click('Завершить');
    click('Убрать эти подходы', within(await screen.findByRole('dialog', { name: 'Невыполненные подходы' })));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Сегодня' })).toBeTruthy());
    const [s] = await sessions();
    const sets = s!.blocks[0]!.type === 'strength' ? s!.blocks[0]!.items[0]!.sets : [];
    expect(sets).toHaveLength(1);
    expect(s!.finishedAt).toBeDefined();
  }, 20_000);

  it('пустая тренировка не сохраняется', async () => {
    renderApp();
    await startFree();
    click('Завершить');
    click('Удалить', within(await screen.findByRole('dialog', { name: 'Пустая тренировка' })));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Сегодня' })).toBeTruthy());
    expect(await sessions()).toHaveLength(0);
    expect((await db.rows('sessions').toArray())[0]?.deletedAt).not.toBeNull();
  });
});

describe('ничего не теряется', () => {
  it('закрытие экрана сразу после правки не теряет её (запись принудительно уходит при уходе)', async () => {
    await saveRecord('sessions', session('s1', { title: 'Было' }));
    const view = renderApp('/workout/s1');
    fill(await screen.findByLabelText('Название тренировки') && 'Название тренировки', 'Стало');
    view.unmount();
    await waitFor(async () => expect((await db.rows('sessions').get('s1'))?.['title']).toBe('Стало'));
  });

  it('перезагрузка посреди тренировки: всё на месте, на «Сегодня» есть «Продолжить»', async () => {
    renderApp();
    await startFree();
    await addBlock('Силовое упражнение');
    await pickExercise('Силовое упражнение', 'присед в тренажере', /Присед в тренажёре/);
    fill('Подход 1, вес', '90', within(await screen.findByRole('region', { name: 'Блок: Присед в тренажёре' })));
    await savedWhere((s) => s.blocks.length === 1);
    cleanup(); // «закрыли приложение»

    renderApp();
    const resume = await screen.findByRole('region', { name: 'Незавершённая тренировка' });
    click('Продолжить', within(resume));
    const card = await screen.findByRole('region', { name: 'Блок: Присед в тренажёре' });
    expect((within(card).getByLabelText('Подход 1, вес') as HTMLInputElement).value).toBe('90');
  });
});

describe('подсказки из истории', () => {
  const squatSets = (...sets: [number, number][]): Block => ({
    type: 'strength', id: 'b', superset: false,
    items: [{ exerciseId: 'splav:machine-squat', sets: sets.map(([weightKg, reps]) => ({ weightKg, reps, done: true, load: 'normal' as const })) }],
  });

  it('прошлый результат: строка над подходами, колонка «прошлый» и копия первого подхода в новом блоке', async () => {
    await saveRecord('sessions', session('old', { date: '2026-10-13', title: 'Старая', finishedAt: 5, blocks: [squatSets([80, 12])] }));
    await saveRecord('sessions', session('prev', { date: '2026-10-20', title: 'Прошлая', finishedAt: 6, blocks: [squatSets([85, 8], [85, 8], [85, 7])] }));
    await saveRecord('sessions', session('now', { date: '2026-10-27', title: 'Сегодня' }));

    renderApp('/workout/now');
    await screen.findByLabelText('Название тренировки');
    await addBlock('Силовое упражнение');
    await pickExercise('Силовое упражнение', 'присед в тренажере', /Присед в тренажёре/);

    const card = await screen.findByRole('region', { name: 'Блок: Присед в тренажёре' });
    expect(within(card).getByText('Прошлый раз 20 окт: 85 кг × 8 · 85 кг × 8 · 85 кг × 7')).toBeTruthy();
    // Первый подход начинается с копии прошлого, но не отмечен выполненным
    expect((within(card).getByLabelText('Подход 1, вес') as HTMLInputElement).value).toBe('85');
    expect((within(card).getByLabelText('Подход 1, повторы') as HTMLInputElement).value).toBe('8');
    expect(within(card).getByLabelText('Подход 1, выполнен').getAttribute('aria-pressed')).toBe('false');
    // Следующий подход копирует предыдущий подход этой тренировки
    click('+ Подход (копия)', within(card));
    expect((within(card).getByLabelText('Подход 2, вес') as HTMLInputElement).value).toBe('85');
  });

  it('внесение задним числом: «прошлое» — то, что было до выбранной даты', async () => {
    await saveRecord('sessions', session('old', { date: '2026-10-13', finishedAt: 5, blocks: [squatSets([80, 12])] }));
    await saveRecord('sessions', session('later', { date: '2026-10-20', finishedAt: 6, blocks: [squatSets([85, 8])] }));
    await saveRecord('sessions', session('now', { date: '2026-10-27' }));

    renderApp('/workout/now');
    await screen.findByLabelText('Название тренировки');
    fireEvent.change(screen.getByLabelText('Дата тренировки'), { target: { value: '2026-10-15' } });
    await addBlock('Силовое упражнение');
    await pickExercise('Силовое упражнение', 'присед в тренажере', /Присед в тренажёре/);
    const card = await screen.findByRole('region', { name: 'Блок: Присед в тренажёре' });
    expect(within(card).getByText(/Прошлый раз 13 окт: 80 кг × 12/)).toBeTruthy();
  });

  it('недавние упражнения предлагаются первыми', async () => {
    await saveRecord('sessions', session('old', { finishedAt: 5, blocks: [squatSets([80, 12])] }));
    await saveRecord('sessions', session('now', { date: '2026-10-27' }));
    renderApp('/workout/now');
    await screen.findByLabelText('Название тренировки');
    await addBlock('Силовое упражнение');
    const dialog = await screen.findByRole('dialog', { name: 'Силовое упражнение' });
    expect(within(dialog).getByText('НЕДАВНИЕ')).toBeTruthy();
    expect(within(dialog).getAllByRole('button', { name: /Присед в тренажёре/ }).length).toBeGreaterThan(0);
  });
});

describe('поля ввода', () => {
  it('RPE вне 1–10 и текст вместо числа откатываются, пустое поле очищает значение', async () => {
    renderApp();
    await startFree();
    await addBlock('Силовое упражнение');
    await pickExercise('Силовое упражнение', 'присед в тренажере', /Присед в тренажёре/);
    const card = within(await screen.findByRole('region', { name: 'Блок: Присед в тренажёре' }));

    expect(fill('Подход 1, RPE', '11', card).value).toBe('');
    fill('Подход 1, RPE', '8', card);
    expect((card.getByLabelText('Подход 1, RPE') as HTMLInputElement).value).toBe('8');
    expect(fill('Подход 1, RPE', 'много', card).value).toBe('8');
    expect(fill('Подход 1, RPE', '', card).value).toBe('');

    // Десятичная запятая и точка; повторы только целые
    expect(fill('Подход 1, вес', '87,5', card).value).toBe('87,5');
    expect(fill('Подход 1, вес', '18.5', card).value).toBe('18,5');
    expect(fill('Подход 1, повторы', '8,5', card).value).toBe('');
    await savedWhere((s) => s.blocks[0]?.type === 'strength' && s.blocks[0].items[0]!.sets[0]!.weightKg === 18.5);
  });

  repdb('подтягивания с отягощением и в гравитроне различаются нагрузкой', async () => {
    renderApp();
    await startFree();
    await addBlock('Силовое упражнение');
    await pickExercise('Силовое упражнение', 'гравитрон', /Подтягивания в гравитроне/);
    const card = within(await screen.findByRole('region', { name: 'Блок: Подтягивания в гравитроне' }));
    fireEvent.change(card.getByLabelText('Тип нагрузки'), { target: { value: 'assisted' } });
    fill('Подход 1, вес', '18,5', card);
    fill('Подход 1, повторы', '12', card);
    await savedWhere((s) => {
      const b = s.blocks[0];
      return b?.type === 'strength' && b.items[0]!.sets[0]!.load === 'assisted' && b.items[0]!.sets[0]!.weightKg === 18.5;
    });
    expect(card.getByText('−КГ')).toBeTruthy();
  });
});

describe('кардио', () => {
  it('пробежка 3,09 км за 24:08: темп 7:49 считается сам, темп с часов 7:46 показывается, расчётный хранится', async () => {
    renderApp();
    await startFree();
    await addBlock('Кардио');
    click('Бег', within(await screen.findByRole('dialog', { name: 'Кардио' })));
    const run = within(await screen.findByRole('region', { name: 'Блок: Бег' }));

    fill('Дистанция, км', '3,09', run);
    fill('Время', '24:08', run);
    expect(run.getByLabelText('Темп').textContent).toBe('7:49 /км');

    fill('Темп с часов', '7:46', run);
    expect(run.getByLabelText('Темп').textContent).toBe('7:46 /км');
    expect(run.queryByRole('note')).toBeNull();

    await savedWhere((s) => {
      const b = s.blocks[0];
      return b?.type === 'cardio' && b.distanceM === 3090 && b.durationSec === 1448 && b.paceSecPerKm === 469 && b.recordedPace === 466;
    });
  });

  it('сильное расхождение темпа с часов и расчётного даёт предупреждение', async () => {
    renderApp();
    await startFree();
    await addBlock('Кардио');
    click('Бег', within(await screen.findByRole('dialog', { name: 'Кардио' })));
    const run = within(await screen.findByRole('region', { name: 'Блок: Бег' }));
    fill('Дистанция, км', '3,09', run);
    fill('Время', '24:08', run);
    fill('Темп с часов', '6:00', run);
    expect(run.getByRole('note').textContent).toMatch(/больше чем на 5%/);
  });

  it('минуты без двоеточия понимаются как минуты; лестница — этажи', async () => {
    renderApp();
    await startFree();
    await addBlock('Кардио');
    click('Лестница', within(await screen.findByRole('dialog', { name: 'Кардио' })));
    const card = within(await screen.findByRole('region', { name: 'Блок: Лестница' }));
    expect(fill('Время', '20', card).value).toBe('20:00');
    fill('Этажи', '80', card);
    await savedWhere((s) => s.blocks[0]?.type === 'cardio' && s.blocks[0].durationSec === 1200 && s.blocks[0].floors === 80);
  });
});

describe('комплексы', () => {
  it('комплекс #005 из библиотеки: результат «9 раундов», а в следующий раз видна прошлая попытка', async () => {
    await ensureSeed();
    renderApp();
    await startFree();
    await addBlock('Комплекс');
    const dialog = await screen.findByRole('dialog', { name: 'Комплекс' });
    fireEvent.change(within(dialog).getByLabelText('Поиск комплекса'), { target: { value: '#005' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: /#005/ }));

    const card = within(await screen.findByRole('region', { name: /Блок: AMRAP 15 мин, вес тела/ }));
    expect(card.getByText('КОМПЛЕКС #005')).toBeTruthy();
    for (let i = 0; i < 9; i++) fireEvent.click(card.getByRole('button', { name: 'Плюс раунд' }));
    fireEvent.click(card.getByRole('button', { name: 'RPE комплекса 8' }));
    await savedWhere((s) => s.blocks[0]?.type === 'conditioning' && s.blocks[0].result.rounds === 9 && s.blocks[0].rpe === 8);
    const [first] = await sessions();
    expect(first!.blocks[0]).toMatchObject({ complexId: '#005', format: 'AMRAP', timeCapMin: 15, result: { rounds: 9 }, type: 'conditioning' });
    expect(first!.type).toBe('conditioning');

    // Завершаем и начинаем следующую: «9 раундов» рядом с новой попыткой
    click('Завершить');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Сегодня' })).toBeTruthy());
    await startFree();
    await addBlock('Комплекс');
    const dialog2 = await screen.findByRole('dialog', { name: 'Комплекс' });
    fireEvent.change(within(dialog2).getByLabelText('Поиск комплекса'), { target: { value: '#005' } });
    fireEvent.click(await within(dialog2).findByRole('button', { name: /#005/ }));
    const next = within(await screen.findByRole('region', { name: /Блок: AMRAP 15 мин, вес тела/ }));
    expect(next.getByText(/Прошлый раз .*: 9 раундов · рекорд 9 раундов/)).toBeTruthy();
  }, 30_000);

  it('комплекс на время: время и «не уложился»', async () => {
    await ensureSeed();
    renderApp();
    await startFree();
    await addBlock('Комплекс');
    const dialog = await screen.findByRole('dialog', { name: 'Комплекс' });
    fireEvent.change(within(dialog).getByLabelText('Поиск комплекса'), { target: { value: '#007' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: /#007/ }));
    const card = within(await screen.findByRole('region', { name: /Блок: Чиппер/ }));
    fill('Время результата', '17:30', card);
    await savedWhere((s) => s.blocks[0]?.type === 'conditioning' && s.blocks[0].result.timeSec === 1050);
    fireEvent.click(card.getByLabelText('Не уложился'));
    await savedWhere((s) => s.blocks[0]?.type === 'conditioning' && s.blocks[0].result.finished === false);
  }, 20_000);
});

describe('суперсет и блоки', () => {
  repdb('«+ В суперсет» делает блок суперсетом; блок можно переместить и убрать', async () => {
    renderApp();
    await startFree();
    await addBlock('Силовое упражнение');
    await pickExercise('Силовое упражнение', 'присед в тренажере', /Присед в тренажёре/);
    const card = within(await screen.findByRole('region', { name: 'Блок: Присед в тренажёре' }));
    click('+ В суперсет', card);
    await pickExercise('Упражнение в суперсет', 'гравитрон', /Подтягивания в гравитроне/);
    const ss = await screen.findByRole('region', { name: 'Блок: суперсет' });
    expect(within(ss).getByText(/Суперсет · 1 круг/)).toBeTruthy();
    click('+ Круг', within(ss));
    expect(within(ss).getByText(/Суперсет · 2 круга/)).toBeTruthy();

    await addBlock('Кардио');
    click('Бег', within(await screen.findByRole('dialog', { name: 'Кардио' })));
    const run = await screen.findByRole('region', { name: 'Блок: Бег' });
    click('Блок выше', within(run));
    const labels = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(labels.indexOf('Блок: Бег')).toBeLessThan(labels.indexOf('Блок: суперсет'));

    // Удаление блока — в два нажатия
    click('Убрать блок', within(run));
    expect(screen.getByRole('region', { name: 'Блок: Бег' })).toBeTruthy();
    click('Убрать?', within(run));
    expect(screen.queryByRole('region', { name: 'Блок: Бег' })).toBeNull();
  });
});

describe('история и правка', () => {
  async function seed() {
    await saveRecord('sessions', session('a', { title: 'Тренировка 1', date: '2026-10-20', type: 'strength', finishedAt: 5 }));
    await saveRecord('sessions', session('b', { title: 'Пробежка', date: '2026-10-22', type: 'cardio', finishedAt: 6, notes: 'лёгкая' }));
    await saveRecord('sessions', session('c', { title: 'Старая', date: '2026-03-01', type: 'mixed', finishedAt: 7 }));
  }
  const titles = () => screen.queryAllByRole('button').filter((b) => b.classList.contains('session-row')).map((b) => b.querySelector('.session-row__title')!.textContent);

  it('новые сверху, поиск по названию и дате, фильтр по типу', async () => {
    await seed();
    renderApp('/progress');
    await waitFor(() => expect(titles()).toEqual(['Пробежка', 'Тренировка 1', 'Старая']));

    fireEvent.change(screen.getByLabelText('Поиск по истории'), { target: { value: '20.10.2026' } });
    await waitFor(() => expect(titles()).toEqual(['Тренировка 1']));
    fireEvent.change(screen.getByLabelText('Поиск по истории'), { target: { value: 'лёгкая' } });
    await waitFor(() => expect(titles()).toEqual(['Пробежка']));
    fireEvent.change(screen.getByLabelText('Поиск по истории'), { target: { value: '' } });

    fireEvent.click(within(screen.getByRole('group', { name: 'Тип тренировки' })).getByRole('button', { name: 'Кардио' }));
    await waitFor(() => expect(titles()).toEqual(['Пробежка']));
  });

  it('открыть, исправить значение и название, удалить', async () => {
    await saveRecord(
      'sessions',
      session('a', {
        title: 'Тренировка 1', date: '2026-10-20', finishedAt: 5,
        blocks: [{ type: 'strength', id: 'b', superset: false, items: [{ exerciseId: 'splav:machine-squat', sets: [{ weightKg: 85, reps: 8, done: true, load: 'normal' }] }] }],
      }),
    );
    renderApp('/progress');
    fireEvent.click(await screen.findByText('Тренировка 1'));

    const card = within(await screen.findByRole('region', { name: 'Блок: Присед в тренажёре' }));
    fill('Подход 1, вес', '87,5', card);
    fill('Название тренировки', 'Тренировка 1 (правка)');
    await savedWhere((s) => s.title === 'Тренировка 1 (правка)' && s.blocks[0]?.type === 'strength' && s.blocks[0].items[0]!.sets[0]!.weightKg === 87.5);

    click('Удалить тренировку');
    expect(await sessions()).toHaveLength(1);
    click('Удалить насовсем?');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Сегодня' })).toBeTruthy());
    expect(await sessions()).toHaveLength(0);
    // Удаление мягкое: запись остаётся с deletedAt и уйдёт на сервер
    expect((await db.rows('sessions').get('a'))?.deletedAt).not.toBeNull();
    expect(await db.outbox.get('sessions:a')).toBeTruthy();
  }, 20_000);

  it('вернуться к законченной тренировке и продолжить её', async () => {
    await saveRecord('sessions', session('a', { title: 'Готовая', finishedAt: 5 }));
    renderApp('/workout/a');
    expect(await screen.findByText('Завершена')).toBeTruthy();
    click('Продолжить тренировку');
    await savedWhere((s) => s.finishedAt === undefined);
    expect(screen.getByRole('button', { name: 'Завершить' })).toBeTruthy();
  });

  it('несуществующая тренировка: понятное сообщение', async () => {
    renderApp('/workout/нет-такой');
    expect(await screen.findByText(/Тренировка не найдена/)).toBeTruthy();
  });
});

describe('записи из workouts_history.md', () => {
  repdb('статика со временем и подход на повторы в одном упражнении («Гиперэкстензия: 2 мин статика, 1 — 15»)', async () => {
    renderApp();
    await startFree();
    await addBlock('Силовое упражнение');
    await pickExact('Силовое упражнение', 'гиперэкстензия', 'Гиперэкстензия');
    const card = within(await screen.findByRole('region', { name: 'Блок: Гиперэкстензия' }));
    click('+ Время', card);
    fill('Подход 1, время', '2', card);
    click('+ Подход (копия)', card);
    fill('Подход 2, повторы', '15', card);
    fill('Подход 2, время', '', card);
    await savedWhere((s) => {
      const b = s.blocks[0];
      if (b?.type !== 'strength') return false;
      const [a, c] = b.items[0]!.sets;
      return a?.durationSec === 120 && c?.reps === 15 && c.durationSec === undefined;
    });
    expect(card.queryByRole('button', { name: '+ Время' })).toBeNull();
  });

  it('свой комплекс: «AMRAP 20 min, SkiErg 500, Rowing 500 — 3 раунда + 7, RPE 8»', async () => {
    renderApp();
    await startFree();
    fill('Название тренировки', 'Push day');
    await addBlock('Комплекс');
    click(/Свой комплекс/, within(await screen.findByRole('dialog', { name: 'Комплекс' })));
    const card = within(await screen.findByRole('region', { name: 'Блок: Комплекс' }));
    fill('Название комплекса', 'SkiErg 500 + гребля 500', card);
    fill('Лимит времени, мин', '20', card);
    for (let i = 0; i < 3; i++) fireEvent.click(card.getByRole('button', { name: 'Плюс раунд' }));
    fill('Повторы сверху', '7', card);
    fireEvent.click(card.getByRole('button', { name: 'RPE комплекса 8' }));
    await savedWhere((s) => {
      const b = s.blocks[0];
      return b?.type === 'conditioning' && b.name === 'SkiErg 500 + гребля 500' && b.format === 'AMRAP' && b.timeCapMin === 20
        && b.result.rounds === 3 && b.result.extraReps === 7 && b.rpe === 8 && b.complexId === undefined;
    });
    expect((await sessions())[0]!.type).toBe('conditioning');
  });

  repdb('площадка: подтягивания с весом и без — два упражнения, разные нагрузки; брусья', async () => {
    renderApp();
    await startFree();
    await addBlock('Силовое упражнение');
    await pickExact('Силовое упражнение', 'подтягивания', 'Подтягивания');
    const pull = within(await screen.findByRole('region', { name: 'Блок: Подтягивания' }));
    fireEvent.change(pull.getByLabelText('Тип нагрузки'), { target: { value: 'added' } });
    fill('Подход 1, вес', '10', pull);
    fill('Подход 1, повторы', '8', pull);
    await savedWhere((s) => {
      const b = s.blocks[0];
      return b?.type === 'strength' && b.items[0]!.sets[0]!.load === 'added' && b.items[0]!.sets[0]!.weightKg === 10 && b.items[0]!.sets[0]!.reps === 8;
    });
    expect(pull.getByText('+КГ')).toBeTruthy();
  });
});

describe('главный экран', () => {
  it('без тренировок — подсказка; «Свободная тренировка» создаёт запись на сегодня', async () => {
    renderApp();
    expect(await screen.findByText(/Здесь появятся ваши тренировки/)).toBeTruthy();
    await startFree();
    const [s] = await sessions();
    expect(s).toMatchObject({ title: 'Тренировка', type: 'mixed', blocks: [] });
    expect(s!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s!.finishedAt).toBeUndefined();
  });
});
