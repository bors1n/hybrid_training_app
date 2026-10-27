// @vitest-environment jsdom
import { SessionRecordSchema, type SessionRecord } from '@splav/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearLocalData, db } from '../../data/db.ts';
import { startTemplateWorkout } from '../../data/templateService.ts';
import { HAS_REPDB_CATALOG } from '../../seed/catalog.ts';
import { ensureSeed } from '../../seed/install.ts';
import { TEMPLATES } from '../../seed/templates.ts';
import { saveRecord } from '../../sync/records.ts';
import { session } from '../../test/fixtures.ts';
import { TodayScreen } from '../today/TodayScreen.tsx';
import { WorkoutScreen } from '../workout/WorkoutScreen.tsx';
import { PlanScreen } from './PlanScreen.tsx';
import { TemplateEditor } from './TemplateEditor.tsx';

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
        <Route path="/plan" element={<PlanScreen />} />
        <Route path="/workout/:id" element={<WorkoutScreen />} />
        <Route path="/template/:id" element={<TemplateEditor />} />
      </Routes>
    </MemoryRouter>,
  );
}

type Q = Pick<typeof screen, 'getByLabelText'>;
function fill(label: string | RegExp, value: string, root: Q = screen) {
  const el = root.getByLabelText(label);
  fireEvent.change(el, { target: { value } });
  fireEvent.blur(el);
  return el as HTMLInputElement;
}
const click = (name: string | RegExp, root: Pick<typeof screen, 'getByRole'> = screen) => fireEvent.click(root.getByRole('button', { name }));

async function sessions(): Promise<SessionRecord[]> {
  return (await db.rows('sessions').toArray()).flatMap((r) => {
    if (r.deletedAt !== null) return [];
    const p = SessionRecordSchema.safeParse(r);
    return p.success ? [p.data] : [];
  });
}
const savedWhere = (pred: (s: SessionRecord) => boolean) => waitFor(async () => expect((await sessions()).some(pred)).toBe(true), { timeout: 3000 });
const queueIds = async () => ((await db.rows('queues').toArray())[0]!['templateIds'] as string[]);

/** Завершённая тренировка очереди, как её оставляет экран тренировки. */
async function finishFromTemplate(templateId: string, at: number) {
  const id = await startTemplateWorkout(templateId, { now: at - 1000 });
  const row = (await db.rows('sessions').get(id))!;
  await saveRecord('sessions', { ...row, finishedAt: at } as never);
  return id;
}

const next = () => screen.findByRole('region', { name: 'Следующая тренировка' });
const lanes = () => [...document.querySelectorAll('.lane')] as HTMLElement[];
const laneTitles = () => lanes().map((l) => l.querySelector('.lane__title')!.textContent);

describe('главный экран: следующая тренировка', () => {
  it('без очереди (seed ещё не создан) карточки нет, свободная тренировка доступна', async () => {
    renderApp();
    expect(await screen.findByRole('button', { name: 'Свободная тренировка' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Следующая тренировка' })).toBeNull();
  });

  it('тёмная карточка: следующая по очереди, цикл 1, «Начать» и «Короткая»', async () => {
    await ensureSeed();
    renderApp();
    const card = await next();
    expect(within(card).getByText('Тренировка 1')).toBeTruthy();
    expect(within(card).getByText('ЦИКЛ 1')).toBeTruthy();
    expect(within(card).getByText(/Всё тело A/)).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Начать' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Короткая' })).toBeTruthy();
  });

  repdb('в карточке — три упражнения: прошлый результат, а если его нет — плановые значения; «и ещё N · …»', async () => {
    await ensureSeed();
    await saveRecord('sessions', session('old', {
      date: '2026-10-20', finishedAt: 5,
      blocks: [{ type: 'strength', id: 'b', superset: false, items: [{ exerciseId: 'repdb:squat', sets: [{ weightKg: 87.5, reps: 8, done: true, load: 'normal' }] }] }],
    }));
    renderApp();
    const card = await next();
    const rows = [...card.querySelectorAll('.next-card__list li')].map((li) => li.textContent);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toBe('Присед со штангой87,5 кг × 8');
    expect(rows[1]).toBe('Жим лёжа3 × 6–8 · 80 кг');
    expect(card.querySelector('.next-card__rest')!.textContent).toBe('и ещё 4 · финиш · мобильность');
  });

  it('следующий комплекс и последняя пробежка', async () => {
    await ensureSeed();
    await saveRecord('sessions', session('run', {
      date: '2026-05-29', type: 'cardio', finishedAt: 5, title: 'Бег',
      blocks: [{ type: 'cardio', id: 'c', modality: 'run', role: 'main', distanceM: 3090, durationSec: 1448, paceSecPerKm: 469, recordedPace: 466 }],
    }));
    renderApp();
    const complex = await screen.findByLabelText('Следующий комплекс');
    expect(within(complex).getByText('#001')).toBeTruthy();
    const run = screen.getByLabelText('Последняя пробежка');
    expect(run.textContent).toContain('3,09 км');
    expect(run.textContent).toContain('7:46 /км');
  });
});

describe('критерий приёмки: очередь Т1 → Т2', () => {
  it('завершение Т1 делает следующей Т2; свободная тренировка и пробежка очередь не сдвигают', async () => {
    await ensureSeed();
    renderApp();
    click('Начать', within(await next()));

    // Тренировка Т1: внесём первый подход приседа (повторы) и завершим
    const reps = await screen.findAllByLabelText('Подход 1, повторы');
    expect(await screen.findByLabelText('Название тренировки')).toHaveProperty('value', 'Тренировка 1');
    fill('Подход 1, повторы', '8', { getByLabelText: () => reps[0]! } as Q);
    click('Завершить');
    click('Убрать эти подходы', within(await screen.findByRole('dialog', { name: 'Невыполненные подходы' })));

    const card = await next();
    expect(within(card).getByText('Тренировка 2')).toBeTruthy();
    const [t1] = await sessions();
    expect(t1).toMatchObject({ title: 'Тренировка 1', templateId: 'seed:template:t1', queueSlot: 0 });
    expect(t1!.finishedAt).toBeDefined();
    // Пустые заготовки (разминка, финиш) не сохранились, внесённое осталось
    expect(t1!.blocks.some((b) => b.type === 'cardio')).toBe(false);
    expect(t1!.blocks.filter((b) => b.type === 'strength')).toHaveLength(1);

    // Свободная тренировка с пробежкой
    click('Свободная тренировка');
    await screen.findByLabelText('Название тренировки');
    click('Добавить блок');
    click('Кардио', within(await screen.findByRole('dialog', { name: 'Добавить блок' })));
    click('Бег', within(await screen.findByRole('dialog', { name: 'Кардио' })));
    const run = within(await screen.findByRole('region', { name: 'Блок: Бег' }));
    fill('Дистанция, км', '3', run);
    fill('Время', '25:00', run);
    click('Завершить');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Следующая тренировка' })).toBeTruthy());

    expect(within(await next()).getByText('Тренировка 2')).toBeTruthy();
    expect((await sessions()).filter((s) => s.finishedAt !== undefined)).toHaveLength(2);
  }, 30_000);

  it('«Короткая»: в тренировке только помеченные блоки', async () => {
    await ensureSeed();
    renderApp();
    click('Короткая', within(await next()));
    const expected = TEMPLATES[0]!.blocks.filter((b) => b.inShort).length;
    await savedWhere((s) => s.templateId === 'seed:template:t1' && s.blocks.length === expected);
    expect(expected).toBeLessThan(TEMPLATES[0]!.blocks.length);
  });

  it('прошлый результат подставляется, правки плана — тоже; заметка упражнения из шаблона видна в тренировке', async () => {
    await ensureSeed();
    renderApp();
    click('Начать', within(await next()));
    await screen.findByLabelText('Название тренировки');
    // Т1: вес приседа — ориентир из шаблона (85 кг), повторы не подставлены, подходы не отмечены
    const weights = await screen.findAllByLabelText('Подход 1, вес');
    expect((weights[0] as HTMLInputElement).value).toBe('85');
    expect((screen.getAllByLabelText('Подход 1, повторы')[0] as HTMLInputElement).value).toBe('');
    expect(screen.getAllByLabelText('Подход 1, выполнен')[0]!.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getAllByText('Перед первым силовым упражнением 2 разминочных подхода.').length).toBeGreaterThan(0);
  });
});

describe('экран «План»: очередь', () => {
  it('три дорожки, «Следующая» у первой, номер цикла', async () => {
    await ensureSeed();
    renderApp('/plan');
    await waitFor(() => expect(lanes()).toHaveLength(3));
    expect(laneTitles()).toEqual(['Тренировка 1', 'Тренировка 2', 'Тренировка 3']);
    expect(screen.getByText('ЦИКЛ 1')).toBeTruthy();
    expect(within(lanes()[0]!).getByText('Следующая')).toBeTruthy();
    expect(lanes()[0]!.querySelector('.lane__sub')!.textContent).toBe('Всё тело A · 7 упражнений · кардио · мобильность');
    expect(lanes()[2]!.querySelector('.lane__sub')!.textContent).toBe('Комплексы и спринты · кардио · комплекс · мобильность');
  });

  it('после Т1: у первой дорожки дата завершения, «Следующая» у второй', async () => {
    await ensureSeed();
    await finishFromTemplate('seed:template:t1', new Date(2026, 9, 20, 12).getTime());
    renderApp('/plan');
    await waitFor(() => expect(within(lanes()[1]!).queryByText('Следующая')).toBeTruthy());
    expect(within(lanes()[0]!).queryByText('Следующая')).toBeNull();
    expect(within(lanes()[0]!).getByText('20 окт')).toBeTruthy();
  });

  it('«Новый цикл» — в два нажатия; следующей снова первая, цикл растёт; дальше очередь снова по истории', async () => {
    await ensureSeed();
    await finishFromTemplate('seed:template:t1', 10_000);
    await finishFromTemplate('seed:template:t2', 20_000);
    renderApp('/plan');
    await waitFor(() => expect(within(lanes()[2]!).queryByText('Следующая')).toBeTruthy());

    click('Новый цикл');
    expect(within(lanes()[2]!).queryByText('Следующая')).toBeTruthy(); // первое нажатие только просит подтвердить
    click('Начать с первой?');
    await waitFor(() => expect(within(lanes()[0]!).queryByText('Следующая')).toBeTruthy());
    expect(screen.getByText('ЦИКЛ 2')).toBeTruthy();
    expect(lanes().some((l) => l.querySelector('.lane__date'))).toBe(false);

    await finishFromTemplate('seed:template:t1', Date.now() + 10_000);
    await waitFor(() => expect(within(lanes()[1]!).queryByText('Следующая')).toBeTruthy());
  }, 20_000);

  it('редактор очереди: порядок, удаление, добавление, «начать с»', async () => {
    await ensureSeed();
    await saveRecord('templates', { id: 'extra', title: 'Дополнительная', blocks: [] });
    renderApp('/plan');
    await waitFor(() => expect(lanes()).toHaveLength(3));
    click('ИЗМЕНИТЬ');
    const dialog = await screen.findByRole('dialog', { name: 'Очередь' });

    click('Тренировка 3: выше', within(dialog));
    await waitFor(async () => expect(await queueIds()).toEqual(['seed:template:t1', 'seed:template:t3', 'seed:template:t2']));
    expect(laneTitles()).toEqual(['Тренировка 1', 'Тренировка 3', 'Тренировка 2']);

    fireEvent.change(within(dialog).getByLabelText('Шаблон для добавления'), { target: { value: 'extra' } });
    click('Добавить', within(dialog));
    await waitFor(async () => expect(await queueIds()).toHaveLength(4));

    click('Убрать из очереди: Тренировка 2', within(dialog));
    expect((await queueIds())).toHaveLength(4); // первое нажатие только просит подтвердить
    click('?', within(dialog));
    await waitFor(async () => expect(await queueIds()).toEqual(['seed:template:t1', 'seed:template:t3', 'extra']));

    fireEvent.change(within(dialog).getByLabelText('Начать с шаблона'), { target: { value: '2' } });
    click('Применить', within(dialog));
    await waitFor(() => expect(within(lanes()[2]!).queryByText('Следующая')).toBeTruthy());
  }, 20_000);

  it('шаблоны вне очереди показаны отдельным списком', async () => {
    await ensureSeed();
    await saveRecord('templates', { id: 'extra', title: 'Дополнительная', subtitle: 'Дом', blocks: [] });
    renderApp('/plan');
    const list = await screen.findByRole('region', { name: 'Шаблоны вне очереди' });
    expect(within(list).getByText('Дополнительная')).toBeTruthy();
    expect(within(list).getByText(/Дом · пусто/)).toBeTruthy();
  });

  it('без очереди — подсказка, но «+ Шаблон» и свободная тренировка работают', async () => {
    renderApp('/plan');
    expect(await screen.findByText(/появятся после первой синхронизации/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Шаблон' })).toBeTruthy();
  });
});

describe('экран «План»: шаблон из очереди', () => {
  it('просмотр шаблона и запуск из него — тренировка очереди со слотом', async () => {
    await ensureSeed();
    renderApp('/plan');
    await waitFor(() => expect(lanes()).toHaveLength(3));
    fireEvent.click(lanes()[1]!);
    const sheet = await screen.findByRole('dialog', { name: 'Шаблон: Тренировка 2' });
    expect(sheet.querySelectorAll('.tpl-block')).toHaveLength(TEMPLATES[1]!.blocks.length);
    expect(within(sheet).getByText(/В очереди/)).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: 'Короткая версия' })).toBeTruthy();
    click('Начать', within(sheet));

    expect(await screen.findByLabelText('Название тренировки')).toHaveProperty('value', 'Тренировка 2');
    await savedWhere((s) => s.templateId === 'seed:template:t2' && s.queueSlot === 1);
  });

  it('у Т3 нет короткой версии; свободная карточка запускает свободную тренировку без очереди', async () => {
    await ensureSeed();
    renderApp('/plan');
    await waitFor(() => expect(lanes()).toHaveLength(3));
    fireEvent.click(lanes()[2]!);
    const sheet = await screen.findByRole('dialog', { name: 'Шаблон: Тренировка 3' });
    expect(within(sheet).queryByRole('button', { name: 'Короткая версия' })).toBeNull();
    click('Закрыть', within(sheet));

    fireEvent.click(screen.getByText('Свободная тренировка'));
    await screen.findByLabelText('Название тренировки');
    const [s] = await sessions();
    expect(s).not.toHaveProperty('queueId');
    expect(s).not.toHaveProperty('templateId');
  });
});

describe('библиотека комплексов', () => {
  const tile = (code: string, status: string) => screen.getByRole('button', { name: `${code}: ${status}` });
  const k = (complexId: string, result: object, id = 's' + complexId) =>
    session(id, { date: '2026-10-18', finishedAt: 5, type: 'conditioning', blocks: [{ type: 'conditioning', id: 'k', complexId, format: 'AMRAP', result } as never] });

  it('24 плитки: #001 следующий, остальные «не делал»', async () => {
    await ensureSeed();
    renderApp('/plan');
    await screen.findByRole('button', { name: '#001: следующий' });
    expect(document.querySelectorAll('.cx-tile')).toHaveLength(24);
    expect(tile('#002', 'не делал')).toBeTruthy();
    expect(tile('#024', 'не делал')).toBeTruthy();
    expect(screen.getByText('24 · ВСЕ')).toBeTruthy();
  });

  it('результат отмечается рекордом, очередь сдвигается; тренировка с другим комплексом очередь не двигает', async () => {
    await ensureSeed();
    await saveRecord('sessions', k('#001', { rounds: 5 }));
    await saveRecord('sessions', k('#006', { rounds: 9, extraReps: 3 }));
    renderApp('/plan');
    await screen.findByRole('button', { name: '#002: следующий' });
    expect(tile('#001', 'рекорд 5')).toBeTruthy();
    expect(tile('#006', 'рекорд 9+3')).toBeTruthy();
    expect(tile('#001', 'рекорд 5').classList.contains('has-record')).toBe(true);
    expect(tile('#003', 'не делал')).toBeTruthy();
  });

  it('карточка комплекса: состав, история с рекордом, «Сделать следующим»', async () => {
    await ensureSeed();
    await saveRecord('sessions', k('#005', { rounds: 9 }, 'a'));
    await saveRecord('sessions', k('#005', { rounds: 7, extraReps: 14 }, 'b'));
    renderApp('/plan');
    await screen.findByRole('button', { name: /#005/ });
    fireEvent.click(screen.getByRole('button', { name: /^#005/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Комплекс #005' });
    expect(within(dialog).getByText(/6 подтягиваний → 12 отжиманий → 18 приседаний/)).toBeTruthy();
    expect(dialog.querySelectorAll('.cx-history li')).toHaveLength(2);
    expect(within(dialog).getAllByText('рекорд')).toHaveLength(1);
    expect(within(dialog).getByText('9 раундов')).toBeTruthy();

    click('Сделать следующим', within(dialog));
    await waitFor(() => expect(screen.getByRole('button', { name: /^#005.*следующий/ })).toBeTruthy());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('комплекс вне очереди (#004) вставляется в очередь и становится следующим', async () => {
    await ensureSeed();
    renderApp('/plan');
    await screen.findByRole('button', { name: '#001: следующий' });
    fireEvent.click(screen.getByRole('button', { name: /^#004/ }));
    click('Сделать следующим', within(await screen.findByRole('dialog', { name: 'Комплекс #004' })));
    await waitFor(() => expect(screen.getByRole('button', { name: '#004: следующий' })).toBeTruthy());
    const order = (await db.rows('complexQueue').toArray())[0]!['order'] as string[];
    expect(order.slice(0, 3)).toEqual(['#004', '#001', '#002']);
  });

  it('правка комплекса: название, формат, лимит, состав сохраняются', async () => {
    await ensureSeed();
    renderApp('/plan');
    await screen.findByRole('button', { name: '#001: следующий' });
    fireEvent.click(screen.getByRole('button', { name: /^#002/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Комплекс #002' });
    click('Изменить', within(dialog));
    fill('Название комплекса', 'AMRAP 25 мин', within(dialog));
    fill('Лимит времени, мин', '25', within(dialog));
    fireEvent.change(within(dialog).getByLabelText('Состав комплекса'), { target: { value: 'SkiErg 500 → гребля 500, RPE 8' } });
    click('Сохранить', within(dialog));
    await waitFor(async () => expect(await db.rows('complexes').get('#002')).toMatchObject({ title: 'AMRAP 25 мин', timeCapMin: 25, description: 'SkiErg 500 → гребля 500, RPE 8' }));
    expect(await within(dialog).findByText('AMRAP 25 мин')).toBeTruthy();
  });
});

describe('редактор шаблона', () => {
  async function newTemplate() {
    renderApp('/plan');
    fireEvent.click(await screen.findByRole('button', { name: '+ Шаблон' }));
    await screen.findByLabelText('Название шаблона');
  }
  const templateRow = async () => (await db.rows('templates').toArray()).find((t) => t['title'] !== 'Тренировка 1' && !String(t.id).startsWith('seed:'))!;

  it('«+ Шаблон»: пустой шаблон в редакторе; название, подзаголовок, длительность сохраняются', async () => {
    await newTemplate();
    fill('Название шаблона', 'Ноги и кор');
    fill('Подзаголовок', 'Дом');
    fill('Длительность', '45 мин');
    await waitFor(async () => expect(await templateRow()).toMatchObject({ title: 'Ноги и кор', subtitle: 'Дом', durationHint: '45 мин', blocks: [] }));
    expect(screen.getByText(/Блоков пока нет/)).toBeTruthy();
  });

  it('силовой блок с плановыми значениями; «в короткой версии»; порядок; удаление блока', async () => {
    await newTemplate();
    click('Добавить блок');
    click('Силовое упражнение', within(await screen.findByRole('dialog', { name: 'Добавить блок' })));
    const picker = await screen.findByRole('dialog', { name: 'Силовое упражнение' });
    fireEvent.change(within(picker).getByLabelText('Поиск упражнения'), { target: { value: 'присед в тренажере' } });
    fireEvent.click(await within(picker).findByRole('button', { name: /Присед в тренажёре/ }));

    const card = within(await screen.findByRole('region', { name: 'Блок: Присед в тренажёре' }));
    fill('Присед в тренажёре: подходы', '4', card);
    fill('Присед в тренажёре: повторы от', '6', card);
    fill('Присед в тренажёре: повторы до', '8', card);
    fill('Присед в тренажёре: вес', '100', card);
    fill('Присед в тренажёре: вес до', '110', card);
    fireEvent.click(card.getByLabelText('Повторы на каждую сторону'));
    await waitFor(async () => expect((await templateRow())['blocks']).toMatchObject([
      { type: 'strength', inShort: true, items: [{ exerciseId: 'splav:machine-squat', plan: { sets: 4, repsMin: 6, repsMax: 8, weightKg: 100, weightKgMax: 110, perSide: true, load: 'normal' } }] },
    ]));

    fireEvent.click(card.getByLabelText('В короткой версии'));
    await waitFor(async () => expect(((await templateRow())['blocks'] as { inShort: boolean }[])[0]!.inShort).toBe(false));
    expect(screen.getByRole('status').textContent).toMatch(/В короткой версии блоков: 0 из 1/);

    click('Убрать блок', card);
    click('Убрать?', card);
    await waitFor(async () => expect((await templateRow())['blocks']).toEqual([]));
  }, 20_000);

  it('диапазон повторов не «переворачивается»', async () => {
    await newTemplate();
    click('Добавить блок');
    click('Силовое упражнение', within(await screen.findByRole('dialog', { name: 'Добавить блок' })));
    const picker = await screen.findByRole('dialog', { name: 'Силовое упражнение' });
    fireEvent.change(within(picker).getByLabelText('Поиск упражнения'), { target: { value: 'присед в тренажере' } });
    fireEvent.click(await within(picker).findByRole('button', { name: /Присед в тренажёре/ }));
    const card = within(await screen.findByRole('region', { name: 'Блок: Присед в тренажёре' }));
    fill('Присед в тренажёре: повторы от', '6', card);
    fill('Присед в тренажёре: повторы до', '8', card);
    expect(fill('Присед в тренажёре: повторы от', '12', card).value).toBe('12');
    expect((card.getByLabelText('Присед в тренажёре: повторы до') as HTMLInputElement).value).toBe('12');
  });

  it('кардио с диапазоном минут, комплекс из очереди, мобильность', async () => {
    await newTemplate();
    click('Добавить блок');
    click('Кардио', within(await screen.findByRole('dialog', { name: 'Добавить блок' })));
    const cd = await screen.findByRole('dialog', { name: 'Кардио' });
    click('Разминка', within(cd));
    click('Дорожка', within(cd));
    const cardio = within(await screen.findByRole('region', { name: 'Блок: Дорожка' }));
    fill('Время от, мин', '5', cardio);
    fill('Время до, мин', '10', cardio);

    click('Добавить блок');
    click('Комплекс', within(await screen.findByRole('dialog', { name: 'Добавить блок' })));
    click(/Следующий из очереди комплексов/, within(await screen.findByRole('dialog', { name: 'Комплекс' })));

    click('Добавить блок');
    click('Мобильность или кор', within(await screen.findByRole('dialog', { name: 'Добавить блок' })));
    const picker = await screen.findByRole('dialog', { name: 'Мобильность и кор' });
    fireEvent.change(within(picker).getByLabelText('Поиск упражнения'), { target: { value: 'кор-комплекс' } });
    fireEvent.click(await within(picker).findByRole('button', { name: /Кор-комплекс/ }));
    fill('Мобильность: время от, мин', '8', within(await screen.findByRole('region', { name: 'Блок: мобильность' })));

    await waitFor(async () => expect((await templateRow())['blocks']).toMatchObject([
      { type: 'cardio', role: 'warmup', modality: 'treadmill', durationSec: 300, durationSecMax: 600 },
      { type: 'conditioning', fromQueue: true },
      { type: 'mobility', items: [{ exerciseId: 'splav:core-complex' }], durationSec: 480 },
    ]));
  }, 30_000);

  it('суперсет: «+ В суперсет» делает блок суперсетом', async () => {
    await newTemplate();
    click('Добавить блок');
    click('Силовое упражнение', within(await screen.findByRole('dialog', { name: 'Добавить блок' })));
    let picker = await screen.findByRole('dialog', { name: 'Силовое упражнение' });
    fireEvent.change(within(picker).getByLabelText('Поиск упражнения'), { target: { value: 'присед в тренажере' } });
    fireEvent.click(await within(picker).findByRole('button', { name: /Присед в тренажёре/ }));
    click('+ В суперсет', within(await screen.findByRole('region', { name: 'Блок: Присед в тренажёре' })));
    picker = await screen.findByRole('dialog', { name: 'Упражнение в суперсет' });
    fireEvent.change(within(picker).getByLabelText('Поиск упражнения'), { target: { value: 'боковая гиперэкстензия' } });
    fireEvent.click(await within(picker).findByRole('button', { name: /Боковая гиперэкстензия/ }));
    await screen.findByRole('region', { name: 'Блок: суперсет' });
    await waitFor(async () => expect((await templateRow())['blocks']).toMatchObject([{ superset: true, items: [{ exerciseId: 'splav:machine-squat' }, { exerciseId: 'splav:side-back-extension', plan: { perSide: true } }] }]));
  }, 20_000);

  it('правка плана влияет на следующую тренировку из шаблона (Т1: вес приседа 85 → 90)', async () => {
    await ensureSeed();
    renderApp('/template/seed:template:t1');
    await screen.findByLabelText('Название шаблона');
    const weight = (await screen.findAllByLabelText(/: вес$/))[0]!;
    expect((weight as HTMLInputElement).value).toBe('85');
    fireEvent.change(weight, { target: { value: '90' } });
    fireEvent.blur(weight);
    await waitFor(async () => {
      const t = await db.rows('templates').get('seed:template:t1');
      const strength = (t!['blocks'] as { type: string; items?: { plan: { weightKg?: number } }[] }[]).find((b) => b.type === 'strength')!;
      expect(strength.items![0]!.plan.weightKg).toBe(90);
    });
    cleanup();

    const id = await startTemplateWorkout('seed:template:t1');
    const blocks = (await db.rows('sessions').get(id))!['blocks'] as { type: string; items?: { sets: { weightKg?: number }[] }[] }[];
    expect(blocks.find((b) => b.type === 'strength')!.items![0]!.sets[0]!.weightKg).toBe(90);
  }, 20_000);

  it('удаление шаблона вне очереди возвращает к плану; шаблон пропадает', async () => {
    await newTemplate();
    click('Удалить шаблон');
    click('Удалить насовсем?');
    await waitFor(async () => expect((await db.rows('templates').toArray()).every((t) => t.deletedAt !== null)).toBe(true));
    expect(await screen.findByRole('heading', { name: 'План' })).toBeTruthy();
  });

  it('единственный шаблон очереди удалить нельзя: сообщение, шаблон остаётся', async () => {
    await ensureSeed();
    await saveRecord('queues', { id: 'seed:queue:cycle', title: 'Цикл', templateIds: ['seed:template:t1'] });
    renderApp('/template/seed:template:t1');
    await screen.findByLabelText('Название шаблона');
    click('Удалить шаблон');
    click('Удалить насовсем?');
    expect((await screen.findByRole('alert')).textContent).toMatch(/единственный шаблон в очереди/);
    expect((await db.rows('templates').get('seed:template:t1'))?.deletedAt).toBeNull();
  });

  it('несуществующий шаблон — сообщение', async () => {
    renderApp('/template/нет');
    expect(await screen.findByText(/Шаблон не найден/)).toBeTruthy();
  });

  it('шаблон вне очереди запускается: вес из плана, очередь не затрагивается', async () => {
    await ensureSeed();
    await newTemplate();
    click('Добавить блок');
    click('Силовое упражнение', within(await screen.findByRole('dialog', { name: 'Добавить блок' })));
    const picker = await screen.findByRole('dialog', { name: 'Силовое упражнение' });
    fireEvent.change(within(picker).getByLabelText('Поиск упражнения'), { target: { value: 'присед в тренажере' } });
    fireEvent.click(await within(picker).findByRole('button', { name: /Присед в тренажёре/ }));
    fill('Присед в тренажёре: вес', '100', within(await screen.findByRole('region', { name: 'Блок: Присед в тренажёре' })));
    await waitFor(async () => expect(JSON.stringify((await templateRow())['blocks'])).toContain('"weightKg":100'));
    click('Готово');

    const row = await templateRow();
    const id = await startTemplateWorkout(row.id);
    const s = (await db.rows('sessions').get(id))!;
    expect(s).not.toHaveProperty('queueId');
    expect(s['templateId']).toBe(row.id);
  }, 20_000);
});
