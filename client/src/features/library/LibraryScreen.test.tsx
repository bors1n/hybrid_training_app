// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearLocalData, db } from '../../data/db.ts';
import { HAS_REPDB_CATALOG } from '../../seed/catalog.ts';
import { ensureSeed } from '../../seed/install.ts';
import { LibraryScreen } from './LibraryScreen.tsx';

beforeEach(async () => {
  await db.open();
  await clearLocalData();
});
afterEach(cleanup);

const search = () => screen.getByLabelText('Поиск по каталогу');
const rows = () => screen.queryAllByRole('button').filter((b) => b.classList.contains('ex-row'));
const type = (value: string) => fireEvent.change(search(), { target: { value } });

describe('экран «Каталог»', () => {
  it('показывает заголовок, счётчик и первые упражнения', async () => {
    render(<LibraryScreen />);
    expect(screen.getByRole('heading', { name: 'Каталог' })).toBeTruthy();
    expect(screen.getByText(/упражнений · \d+ своих/)).toBeTruthy();
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    expect(rows().length).toBeLessThanOrEqual(60);
  });

  it('поиск по русскому названию и по английскому псевдониму', async () => {
    render(<LibraryScreen />);
    type('кор-комплекс');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(within(rows()[0]!).getByText('Кор-комплекс')).toBeTruthy();
  });

  it('пустой результат: подсказка вместо списка', async () => {
    render(<LibraryScreen />);
    type('qzxwvu');
    await waitFor(() => expect(screen.getByText(/Ничего не найдено/)).toBeTruthy());
    expect(rows()).toHaveLength(0);
  });

  it('фильтры: «Свои» оставляет только упражнения автора', async () => {
    render(<LibraryScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Свои' }));
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    for (const r of rows()) expect(within(r).getByText('своё')).toBeTruthy();
  });

  it('ряды фильтров горизонтально прокручиваются свайпом, а не переносятся', () => {
    render(<LibraryScreen />);
    for (const name of ['Тип', 'Мышцы', 'Оборудование']) {
      const row = screen.getByRole('group', { name });
      expect(row.classList.contains('chips')).toBe(true);
      expect(row.classList.contains('chips--wrap')).toBe(false);
    }
    // Все категории присутствуют в рядах, даже если не помещаются на экране.
    for (const name of ['Мобильность', 'Ягодицы', 'Эргометр', 'Без оборудования']) expect(screen.getByRole('button', { name })).toBeTruthy();
  });

  it('фильтр по типу включается и выключается повторным нажатием, «Все» сбрасывает', async () => {
    render(<LibraryScreen />);
    const cardio = screen.getByRole('button', { name: 'Кардио' });
    fireEvent.click(cardio);
    expect(cardio.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(cardio);
    expect(cardio.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Мобильность' }));
    fireEvent.click(screen.getByRole('button', { name: 'Все' }));
    expect(screen.getByRole('button', { name: 'Мобильность' }).getAttribute('aria-pressed')).toBe('false');
  });

  it.skipIf(!HAS_REPDB_CATALOG)('каталог RepDB: присед находится, у строки есть картинка, в карточке — подпись RepDB', async () => {
    render(<LibraryScreen />);
    type('присед со штангой');
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    const first = rows()[0]!;
    expect(within(first).getByText('Присед со штангой')).toBeTruthy();
    expect(first.querySelector('img')?.getAttribute('src')).toMatch(/^\/media\/repdb\/flat\/.+\.webp$/);

    fireEvent.click(first);
    const dialog = await screen.findByRole('dialog', { name: 'Присед со штангой' });
    const credit = within(dialog).getByRole('link', { name: 'Exercise data by RepDB (repdb.co)' });
    expect(credit.getAttribute('href')).toBe('https://repdb.co');
    expect(within(dialog).getByText(/квадрицепс/)).toBeTruthy();
  });

  it('карточка своего упражнения автора: без подписи RepDB', async () => {
    render(<LibraryScreen />);
    type('кор-комплекс');
    await waitFor(() => expect(rows()).toHaveLength(1));
    fireEvent.click(rows()[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Кор-комплекс' });
    expect(within(dialog).queryByRole('link')).toBeNull();
    expect(within(dialog).getByText('Кор')).toBeTruthy();
  });
});

describe('заметка к упражнению', () => {
  it('сохраняется при потере фокуса, возвращается при повторном открытии, очищается пустым текстом', async () => {
    render(<LibraryScreen />);
    type('кор-комплекс');
    await waitFor(() => expect(rows()).toHaveLength(1));
    fireEvent.click(rows()[0]!);

    const note = (await screen.findByPlaceholderText(/Настройка тренажёра/)) as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: 'угол 4, пауза 2 с' } });
    fireEvent.blur(note);
    await waitFor(async () => expect((await db.rows('exerciseNotes').get('hybridlog:core-complex'))?.['text']).toBe('угол 4, пауза 2 с'));
    expect(await db.outbox.get('exerciseNotes:hybridlog:core-complex')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(rows()[0]!);
    await waitFor(async () => expect(((await screen.findByPlaceholderText(/Настройка тренажёра/)) as HTMLTextAreaElement).value).toBe('угол 4, пауза 2 с'));

    const again = screen.getByPlaceholderText(/Настройка тренажёра/);
    fireEvent.change(again, { target: { value: '   ' } });
    fireEvent.blur(again);
    await waitFor(async () => expect((await db.rows('exerciseNotes').get('hybridlog:core-complex'))?.deletedAt).not.toBeNull());
  });
});

describe('своё упражнение', () => {
  async function openForm() {
    render(<LibraryScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Своё упражнение' }));
    return screen.findByRole('dialog', { name: 'Своё упражнение' });
  }

  it('создаётся, попадает в базу и очередь отправки и открывается в карточке', async () => {
    const form = await openForm();
    fireEvent.change(within(form).getByPlaceholderText(/Фермерская/), { target: { value: 'Фермерская прогулка 2 × 24' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Гантели' }));
    fireEvent.click(within(form).getByLabelText('Повторы на каждую сторону'));
    fireEvent.click(within(form).getByRole('button', { name: 'Сохранить' }));

    const card = await screen.findByRole('dialog', { name: 'Фермерская прогулка 2 × 24' });
    expect(within(card).getByText('своё')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Удалить упражнение' })).toBeTruthy();

    const saved = await db.rows('exercises').toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'Фермерская прогулка 2 × 24', kind: 'strength', equipment: 'dumbbell', perSide: true, metrics: 'weight_reps', isCustom: true });
    expect(await db.outbox.count()).toBe(1);
  });

  it('пустое название и повтор существующего не принимаются', async () => {
    const form = await openForm();
    fireEvent.click(within(form).getByRole('button', { name: 'Сохранить' }));
    expect((await within(form).findByRole('alert')).textContent).toBe('Введите название');

    fireEvent.change(within(form).getByPlaceholderText(/Фермерская/), { target: { value: 'КОР-комплекс' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(within(form).getByRole('alert').textContent).toBe('Упражнение с таким названием уже есть'));
    expect(await db.rows('exercises').count()).toBe(0);
  });

  it('созданное упражнение видно в списке и удаляется с подтверждением', async () => {
    const form = await openForm();
    fireEvent.change(within(form).getByPlaceholderText(/Фермерская/), { target: { value: 'Мой тест' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Сохранить' }));
    const card = await screen.findByRole('dialog', { name: 'Мой тест' });

    fireEvent.click(within(card).getByRole('button', { name: 'Удалить упражнение' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    type('мой тест');
    await waitFor(() => expect(screen.getByText(/Ничего не найдено/)).toBeTruthy());
    expect((await db.rows('exercises').toArray())[0]?.deletedAt).not.toBeNull();
  });
});

describe('экран «Каталог»: комплексы', () => {
  it('чип «Комплексы» показывает комплексы вместо упражнений; ряды мышц и оборудования скрыты, есть формат', async () => {
    await ensureSeed();
    render(<LibraryScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Комплексы' }));
    const list = await screen.findByRole('list', { name: 'Комплексы' });
    await waitFor(() => expect(within(list).getAllByRole('button').length).toBeGreaterThanOrEqual(24));
    expect(screen.queryByRole('group', { name: 'Мышцы' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Оборудование' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Формат' })).toBeTruthy();
    expect(screen.getByText(/\d+ комплексов/)).toBeTruthy();
  });

  it('поиск по названию и фильтр по формату; карточка комплекса открывается', async () => {
    await ensureSeed();
    render(<LibraryScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Комплексы' }));
    await screen.findByRole('list', { name: 'Комплексы' });
    fireEvent.change(search(), { target: { value: 'AMRAP 20 мин' } });
    const author = await within(screen.getByRole('list', { name: 'Комплексы' })).findByText(/#002/);
    fireEvent.click(author.closest('button')!);
    expect(await screen.findByRole('dialog', { name: 'Комплекс #002' })).toBeTruthy();
  });

  it('возврат к упражнениям: другой тип выключает режим комплексов', async () => {
    render(<LibraryScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Комплексы' }));
    fireEvent.click(screen.getByRole('button', { name: 'Все' }));
    expect(await screen.findByRole('group', { name: 'Мышцы' })).toBeTruthy();
  });
});
