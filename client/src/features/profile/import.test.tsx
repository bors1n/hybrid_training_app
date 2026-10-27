// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLocalData, db } from '../../data/db.ts';
import { xlsxBytesFromRows } from '../../data/xlsxFile.ts';
import { ProfileSheet } from '../../components/ProfileSheet.tsx';
import { ensureSeed } from '../../seed/install.ts';
import { saveRecord } from '../../sync/records.ts';
import { ImportScreen } from './ImportScreen.tsx';
import Papa from 'papaparse';

vi.mock('../../data/exportService.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/exportService.ts')>()),
  saveTextFile: vi.fn(async () => 'downloaded'),
}));
const { saveTextFile } = await import('../../data/exportService.ts');

const TEMPLATE = readFileSync(join(process.cwd(), 'docs', 'import_template.csv'), 'utf8');
const HEADER = TEMPLATE.split(/\r?\n/)[0]!;

beforeEach(async () => {
  await db.open();
  await clearLocalData();
  vi.mocked(saveTextFile).mockClear();
});
afterEach(cleanup);

function renderImport() {
  return render(
    <MemoryRouter initialEntries={['/import']}>
      <Routes>
        <Route path="/import" element={<ImportScreen />} />
        <Route path="/progress" element={<p>экран прогресса</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function upload(content: string | Uint8Array, name = 'file.csv') {
  const file = new File([content as BlobPart], name);
  const field = screen.getByLabelText('Файл для импорта') as HTMLInputElement;
  // Файл можно выбрать, когда справочники (библиотека комплексов, сопоставления, журнал) загружены.
  await waitFor(() => expect(field.disabled).toBe(false));
  fireEvent.change(field, { target: { files: [file] } });
  return screen.findByRole('region', { name: 'Проверка импорта' });
}
const tile = (review: HTMLElement, label: string) => within(review).getByLabelText(label).textContent;
const sessions = async () => (await db.rows('sessions').toArray()).filter((s) => s.deletedAt === null);
const doImport = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Импортировать/ }));
  return screen.findByRole('region', { name: 'Результат импорта' });
};

describe('шаблон CSV', () => {
  it('копия в public совпадает с docs/import_template.csv (скачивается из приложения)', () => {
    expect(readFileSync(join(process.cwd(), 'client', 'public', 'import_template.csv'), 'utf8')).toBe(TEMPLATE);
  });
});

describe('экран импорта', () => {
  it('выбор файла: ссылка на шаблон и пояснение', () => {
    renderImport();
    const link = screen.getByRole('link', { name: /Скачать шаблон/ });
    expect(link.getAttribute('href')).toBe('/import_template.csv');
    expect(screen.getByText(/ничего не сохранится, пока вы не подтвердите/)).toBeTruthy();
  });

  it('проверка шаблона: сводка, предупреждения о порядке дат, без ошибок; запись только после подтверждения', async () => {
    renderImport();
    const review = await upload(TEMPLATE, 'import_template.csv');
    expect([tile(review, 'Тренировок'), tile(review, 'Подходов'), tile(review, 'Кардио'), tile(review, 'Комплексов')]).toEqual(['9', '11', '5', '2']);
    expect(within(review).queryByText(/Ошибки: строки не импортируются/)).toBeNull();
    expect(within(review).getByText(/Предупреждения: строки импортируются \(5\)/)).toBeTruthy();
    expect(within(review).getByText(/Дата 26.04.2026 раньше предыдущей тренировки \(23.10.2026\)/)).toBeTruthy();
    expect(within(review).getByText(/Строка 14/)).toBeTruthy();

    // Пока не подтвердили — в базе пусто
    expect(await sessions()).toHaveLength(0);
    const result = await doImport();
    expect(within(result).getByText('9', { selector: 'b' })).toBeTruthy();
    expect(await sessions()).toHaveLength(9);
    expect((await db.outbox.toArray()).filter((o) => o.collection === 'sessions')).toHaveLength(9);

    fireEvent.click(screen.getByRole('button', { name: 'Открыть историю' }));
    expect(await screen.findByText('экран прогресса')).toBeTruthy();
  }, 20_000);

  it('повторный импорт: «всё уже есть», кнопка неактивна, дубликатов нет (критерий приёмки)', async () => {
    renderImport();
    await upload(TEMPLATE);
    await doImport();
    fireEvent.click(screen.getByRole('button', { name: 'Импортировать ещё' }));

    const review = await upload(TEMPLATE);
    await waitFor(() => expect(within(review).getByText(/Всё из этого файла уже есть в журнале/)).toBeTruthy());
    expect(within(review).getByText(/Уже есть и совпадает/).textContent).toContain('9');
    expect((screen.getByRole('button', { name: /Импортировать/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(await sessions()).toHaveLength(9);
  }, 20_000);

  it('ошибки показываются с номерами строк; корректные строки всё равно импортируются', async () => {
    renderImport();
    const csv = `${HEADER}\n31.02.2026,Плохая,,,set,1,Кор-комплекс,,1,,,5,,,,,,,,,,,,,,,,,\n20.10.2026,Хорошая,,,set,1,Кор-комплекс,,1,,,5,,,,,,,,,,,,,,,,,\n20.10.2026,Хорошая,,,set,1,Кор-комплекс,,2,,,,,,,,,,,,,,,,,,,,,`;
    const review = await upload(csv);
    const errors = within(review).getByText(/Ошибки: строки не импортируются \(2\)/).closest('details')!;
    expect(errors.hasAttribute('open')).toBe(true);
    expect(within(errors).getByText(/Строка 2/)).toBeTruthy();
    expect(within(errors).getByText(/не распознана/)).toBeTruthy();
    expect(within(errors).getByText(/Строка 4/)).toBeTruthy();
    expect(within(errors).getByText(/ни повторов, ни времени/)).toBeTruthy();
    expect(within(review).getByText(/Строк в файле: 3\. Принято: 1\. С ошибками: 2/)).toBeTruthy();

    await doImport();
    expect((await sessions()).map((s) => s['title'])).toEqual(['Хорошая']);
  });

  it('файл только с ошибками: импортировать нельзя', async () => {
    renderImport();
    const review = await upload(`${HEADER}\n31.02.2026,Плохая,,,set,1,Кор-комплекс,,1,,,5,,,,,,,,,,,,,,,,,`);
    expect((within(review).getByRole('button', { name: /Импортировать/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('файл не по шаблону: понятная ошибка о колонках', async () => {
    renderImport();
    const review = await upload('a,b,c\n1,2,3');
    expect(within(review).getByText(/нет обязательной колонки «date»/)).toBeTruthy();
    expect((within(review).getByRole('button', { name: /Импортировать/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('«Excel-файл», не являющийся таблицей по шаблону: понятное сообщение, а не падение', async () => {
    renderImport();
    const review = await upload('это не xlsx', 'broken.xlsx');
    expect(within(review).getByText(/нет обязательной колонки «date»/)).toBeTruthy();
    expect((within(review).getByRole('button', { name: /Импортировать/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Excel (.xlsx): тот же результат, что и из CSV', async () => {
    renderImport();
    const aoa = Papa.parse<string[]>(TEMPLATE, { skipEmptyLines: false }).data;
    const review = await upload(xlsxBytesFromRows(aoa), 'trainings.xlsx');
    expect([tile(review, 'Тренировок'), tile(review, 'Подходов'), tile(review, 'Кардио')]).toEqual(['9', '11', '5']);
    await doImport();
    expect(await sessions()).toHaveLength(9);
  }, 20_000);

  it('изменённая после импорта тренировка заменяется только по галочке', async () => {
    renderImport();
    await upload(TEMPLATE);
    await doImport();
    const t1 = (await sessions()).find((s) => s['title'] === 'Тренировка 1')!;
    await saveRecord('sessions', { ...t1, notes: 'правка вручную' } as never);
    fireEvent.click(screen.getByRole('button', { name: 'Импортировать ещё' }));

    const review = await upload(TEMPLATE);
    const box = await within(review).findByRole('checkbox', { name: /Заменить 1 существующих тренировок/ });
    expect((box as HTMLInputElement).checked).toBe(false);
    expect((within(review).getByRole('button', { name: /Импортировать/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(box);
    const result = await doImport();
    expect(within(result).getByText(/Заменено/).textContent).toContain('1');
    expect((await db.rows('sessions').get(t1.id))?.['notes']).toBeUndefined();
    expect(await sessions()).toHaveLength(9);
  }, 30_000);

  it('импорт библиотеки комплексов: формат и название берутся из неё, предупреждений «нет в библиотеке» нет', async () => {
    await ensureSeed();
    renderImport();
    const review = await upload(TEMPLATE);
    expect(within(review).queryByText(/нет в библиотеке/)).toBeNull();
    await doImport();
    const t3 = (await sessions()).find((s) => s['title'] === 'Тренировка 3')!;
    expect((t3['blocks'] as { name?: string }[])[0]!.name).toBe('AMRAP 15 мин, вес тела');
  }, 20_000);
});

describe('новые упражнения при импорте', () => {
  const csv = `${HEADER}\n20.10.2026,Т,,,set,1,Моё странное упражнение,,1,24,,40,,,,,,,,,,,,,,,,,\n20.10.2026,Т,,,set,2,Мобильность таза (мой вариант),,1,,,,,,,,,,,,,,,,,,,,,,`;

  it('по умолчанию создаётся своё упражнение, и оно появляется в каталоге', async () => {
    renderImport();
    const review = await upload(csv);
    const item = within(review).getByLabelText('Новое упражнение «Моё странное упражнение»');
    expect(within(item).getByRole('button', { name: 'Создать своё' }).getAttribute('aria-pressed')).toBe('true');
    await doImport();
    const custom = await db.rows('exercises').toArray();
    expect(custom.map((c) => c['name'])).toContain('Моё странное упражнение');
    expect(custom.find((c) => c['name'] === 'Моё странное упражнение')).toMatchObject({ isCustom: true, perSide: false, metrics: 'weight_reps' });
  });

  it('можно сопоставить с упражнением каталога: своё не создаётся, сопоставление запоминается', async () => {
    renderImport();
    const review = await upload(csv);
    const item = within(review).getByLabelText('Новое упражнение «Моё странное упражнение»');
    fireEvent.click(within(item).getByRole('button', { name: /Сопоставить с каталогом/ }));

    const picker = await screen.findByRole('dialog', { name: /Сопоставить «Моё странное упражнение»/ });
    fireEvent.change(within(picker).getByLabelText('Поиск упражнения'), { target: { value: 'кор-комплекс' } });
    const row = await waitFor(() => {
      const r = [...picker.querySelectorAll('.pick-row')].find((b) => b.querySelector('.pick-row__name')?.textContent === 'Кор-комплекс');
      expect(r).toBeTruthy();
      return r!;
    });
    fireEvent.click(row);

    // Выбранное видно, строка не исчезла из списка
    const after = await within(review).findByLabelText('Новое упражнение «Моё странное упражнение»');
    expect(within(after).getByRole('button', { name: '→ Кор-комплекс' }).getAttribute('aria-pressed')).toBe('true');

    await doImport();
    const sets = (await sessions())[0]!['blocks'] as { items: { exerciseId: string }[] }[];
    expect(sets[0]!.items[0]!.exerciseId).toBe('splav:core-complex');
    expect((await db.rows('exercises').toArray()).map((c) => c['name'])).not.toContain('Моё странное упражнение');
    // Ключ — нормализованное название (ё → е, регистр и знаки не важны)
    expect(await db.rows('exerciseAliases').get('alias:мое странное упражнение')).toMatchObject({ exerciseId: 'splav:core-complex', alias: 'Моё странное упражнение' });
  });

  it('можно передумать и вернуться к «Создать своё»', async () => {
    renderImport();
    const review = await upload(csv);
    let item = within(review).getByLabelText('Новое упражнение «Моё странное упражнение»');
    fireEvent.click(within(item).getByRole('button', { name: /Сопоставить с каталогом/ }));
    const picker = await screen.findByRole('dialog', { name: /Сопоставить/ });
    fireEvent.click(within(picker).getAllByRole('button').find((b) => b.classList.contains('pick-row'))!);
    item = await within(review).findByLabelText('Новое упражнение «Моё странное упражнение»');
    fireEvent.click(within(item).getByRole('button', { name: 'Создать своё' }));
    expect(within(item).getByRole('button', { name: 'Создать своё' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('экспорт из профиля', () => {
  function renderProfile() {
    return render(
      <MemoryRouter>
        <ProfileSheet onClose={() => undefined} />
      </MemoryRouter>,
    );
  }

  async function importTemplate() {
    cleanup();
    renderImport();
    await upload(TEMPLATE);
    await doImport();
    cleanup();
  }

  it('«Экспорт CSV» отдаёт файл в формате шаблона с BOM и сообщает итог', async () => {
    await importTemplate();
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: 'Экспорт CSV' }));
    await waitFor(() => expect(saveTextFile).toHaveBeenCalledTimes(1));
    const [name, text, mime] = vi.mocked(saveTextFile).mock.calls[0]!;
    expect(name).toMatch(/^splav-trenirovki-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(mime).toBe('text/csv;charset=utf-8');
    expect(text.startsWith('﻿date,session,session_type')).toBe(true);
    expect(text.split('\r\n')).toHaveLength(20);
    expect((await screen.findByRole('status')).textContent).toContain('Файл сохранён: тренировок 9, строк 19');
  }, 20_000);

  it('«Экспорт JSON» — все коллекции', async () => {
    await importTemplate();
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: 'Экспорт JSON' }));
    await waitFor(() => expect(saveTextFile).toHaveBeenCalledTimes(1));
    const [name, text, mime] = vi.mocked(saveTextFile).mock.calls[0]!;
    expect(name).toMatch(/^splav-dannye-.*\.json$/);
    expect(mime).toBe('application/json');
    expect(JSON.parse(text).collections.sessions).toHaveLength(9);
  }, 20_000);

  it('предупреждения экспорта показываются человеку', async () => {
    await saveRecord('sessions', {
      id: 'x', date: '2026-10-20', title: 'Т', type: 'strength',
      blocks: [{ type: 'cardio', id: 'c', modality: 'treadmill', role: 'main', durationSec: 600, inclinePct: 15 }],
    });
    renderProfile();
    fireEvent.click(screen.getByRole('button', { name: 'Экспорт CSV' }));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status.textContent).toMatch(/Что не попало в файл \(1\)/));
    expect(status.textContent).toMatch(/наклон/);
  });

  it('в «О приложении» есть подпись RepDB', () => {
    renderProfile();
    const link = screen.getAllByRole('link', { name: 'Exercise data by RepDB (repdb.co)' });
    expect(link.length).toBeGreaterThan(0);
  });
});
