#!/usr/bin/env python3
"""Проверка текста статьи HTR.

Использование:
  python3 check_text.py article.md
  python3 check_text.py article.md --approved approved.md --html article.html

Уровни:
  ОШИБКА        запрет из инструкций, исправь (в тексте пользователя это предупреждение)
  ПРЕДУПРЕЖДЕНИЕ проверь глазами, исправь или объясни, почему так задумано
Код возврата: 1, если есть ОШИБКИ или расхождение с approved.md.
"""
import argparse
import re
import statistics
import sys
from html.parser import HTMLParser

STOP_ROOTS = ["главное", "ключ", "секрет", "идеальн", "лучш", "эффективн", "комплексн", "баланс"]
VAGUE = ["многие", "часто", "исследования показывают", "исследования доказывают",
         "эксперты считают", "как известно", "учёные доказали", "ученые доказали"]
CLICHE = ["в современном мире", "в наше время", "важно отметить", "стоит отметить",
          "давайте разберёмся", "давайте разберемся", "в этой статье мы", "подведём итоги",
          "подведем итоги", "в заключение", "таким образом", "не секрет"]
IMPERATIVE_HEAD = ["получи", "узнай", "открой", "найди", "сделай", "забудь", "перестань",
                   "начни", "попробуй", "запомни", "поймёшь", "поймешь"]
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿⭐⬆✅❌]")
NOT_X_BUT_Y = re.compile(r"\bне\s+[^.!?;\n]{1,60}?,\s*а\s", re.I)
THIS_NOT_ABOUT = re.compile(r"\bэто\s+не\s+про\b", re.I)


def norm(s):
    s = s.replace(" ", " ").replace("ё", "е").replace("Ё", "Е")
    return re.sub(r"\s+", " ", s).strip().lower()


def strip_md(s):
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"^#{1,6}\s*", "", s)
    s = re.sub(r"^>\s?", "", s)
    s = re.sub(r"^\s*([-*+]|\d+\.)\s+", "", s)
    s = re.sub(r"[*_`]", "", s)
    s = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", s)
    return s.strip()


def parse_md(text):
    """Возвращает список блоков: (kind, text). kind: h1,h2,h3,p,li,quote."""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    blocks, buf = [], []

    def flush():
        if buf:
            joined = " ".join(l.strip() for l in buf).strip()
            if joined:
                blocks.append(("p", strip_md(joined)))
            buf.clear()

    for line in text.splitlines():
        if not line.strip():
            flush()
            continue
        m = re.match(r"^(#{1,3})\s+(.*)", line)
        if m:
            flush()
            blocks.append((f"h{len(m.group(1))}", strip_md(m.group(2))))
            continue
        if re.match(r"^\s*([-*+]|\d+\.)\s+", line):
            flush()
            blocks.append(("li", strip_md(line)))
            continue
        if line.startswith(">"):
            flush()
            blocks.append(("quote", strip_md(line)))
            continue
        buf.append(line)
    flush()
    return blocks


def sentences(p):
    parts = re.split(r"(?<=[.!?…])\s+", p)
    return [s for s in parts if s.strip()]


def words(s):
    return re.findall(r"[\w'-]+", s, flags=re.U)


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.chunks, self.skip = [], 0
        self.h1, self.imgs_bad, self.scripts = 0, [], 0
        self.styles = []
        self._in_style = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script",):
            self.scripts += 1
            self.skip += 1
        if tag == "style":
            self._in_style = True
            self.skip += 1
        if tag == "h1":
            self.h1 += 1
        if tag == "img":
            miss = [k for k in ("alt", "width", "height") if not a.get(k)]
            if miss:
                self.imgs_bad.append((a.get("src", "?"), miss))
        if tag in ("p", "h1", "h2", "h3", "li", "blockquote", "div", "figcaption", "span"):
            self.chunks.append("\n")

    def handle_endtag(self, tag):
        if tag == "script":
            self.skip -= 1
        if tag == "style":
            self._in_style = False
            self.skip -= 1

    def handle_data(self, data):
        if self._in_style:
            self.styles.append(data)
        if not self.skip:
            self.chunks.append(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("article")
    ap.add_argument("--approved")
    ap.add_argument("--html")
    args = ap.parse_args()

    raw = open(args.article, encoding="utf-8").read()
    blocks = parse_md(raw)
    errors, warns = [], []

    body = [(k, t) for k, t in blocks if k in ("p", "li", "quote")]
    heads = [(k, t) for k, t in blocks if k in ("h1", "h2", "h3")]
    paras = [t for k, t in body if k == "p"]
    all_text = " ".join(t for _, t in blocks)
    n_words = len(words(all_text))

    def where(t):
        return t[:60] + ("…" if len(t) > 60 else "")

    for k, t in blocks:
        low = norm(t)
        for root in STOP_ROOTS:
            for m in re.finditer(r"\b" + root + r"\w*", low):
                lvl = warns if root == "лучш" else errors
                lvl.append(f"пустое слово «{m.group(0)}»: {where(t)}")
        for v in dict.fromkeys(norm(x) for x in VAGUE):
            if v in low:
                errors.append(f"обобщение без носителя «{v}»: {where(t)}")
        for c in dict.fromkeys(norm(x) for x in CLICHE):
            if c in low:
                errors.append(f"штамп «{c}»: {where(t)}")
        if NOT_X_BUT_Y.search(t):
            errors.append(f"конструкция «не X, а Y»: {where(t)}")
        if THIS_NOT_ABOUT.search(t):
            errors.append(f"«это не про…»: {where(t)}")
        if EMOJI.search(t):
            errors.append(f"эмодзи: {where(t)}")
        if re.search(r"!{2,}", t) or re.search(r"!\s*!", t):
            errors.append(f"подряд идущие восклицательные знаки: {where(t)}")
        dashes = t.count("—") + len(re.findall(r"\s–\s", t))
        if dashes > 1 and k in ("p", "li", "quote"):
            errors.append(f"тире {dashes} раза в абзаце (допустимо одно): {where(t)}")

    for k, t in blocks:
        if k in ("h1", "h2", "h3"):
            first = norm(t).split(" ")[0] if t else ""
            if first in IMPERATIVE_HEAD:
                errors.append(f"заголовок-императив: {where(t)}")
            if t.endswith("?"):
                warns.append(f"заголовок-вопрос (лучше утверждение или факт): {where(t)}")
            if t.endswith("."):
                warns.append(f"точка в конце заголовка: {where(t)}")

    for k, t in body:
        if t.rstrip().endswith("?") and k == "p":
            errors.append(f"абзац заканчивается вопросом (вопрос-подводка): {where(t)}")

    # Списки ровно из трёх пунктов
    run = 0
    for k, _ in blocks + [("end", "")]:
        if k == "li":
            run += 1
        else:
            if run == 3:
                warns.append("список ровно из трёх пунктов: тройка нужна, только если по делу их три")
            run = 0

    # Лид: цифра или факт в первых двух абзацах
    if paras:
        lead = " ".join(paras[:2])
        if not re.search(r"\d", lead):
            warns.append("в первых двух абзацах нет цифры: добавь факт, известный только автору")
    # Первое лицо
    if not re.search(r"\b(я|мой|моя|моё|мои|мне|меня|мы|наш\w*|у меня)\b", norm(all_text)):
        warns.append("нет первого лица: если в статье нет опыта автора, это должно быть названо в брифе")
    # Конец
    if paras:
        last = norm(paras[-1])
        for w in ("итак", "подведем", "в заключение", "вывод", "резюме", "таким образом", "короче говоря"):
            if last.startswith(w):
                warns.append(f"статья заканчивается резюме: {where(paras[-1])}")
    # Ритм абзацев
    plens = [len(words(p)) for p in paras]
    if len(plens) >= 6:
        if statistics.pstdev(plens) < 12:
            warns.append(f"абзацы одной длины (разброс {statistics.pstdev(plens):.0f} слов): добавь абзац в одну фразу и один длинный")
        if min(plens) > 15:
            warns.append("нет коротких абзацев (меньше 15 слов)")
    # Ритм предложений
    slens = [len(words(s)) for p in paras for s in sentences(p)]
    if len(slens) >= 15:
        sd = statistics.pstdev(slens)
        if sd < 5:
            warns.append(f"предложения одной длины (разброс {sd:.1f} слова)")
    # Повторы начал абзацев
    starts = [norm(p).split(" ")[0] for p in paras if p]
    for i in range(len(starts) - 2):
        if starts[i] == starts[i + 1] == starts[i + 2]:
            warns.append(f"три абзаца подряд начинаются с «{starts[i]}»")
            break
    # Структура
    h2 = [t for k, t in heads if k == "h2"]
    if len(h2) == 3:
        warns.append("ровно три раздела H2: проверь, что это не шаблон «три пункта»")
    if any(re.match(r"^\d+[.)]\s", t) for t in h2):
        warns.append("нумерованные заголовки: ненумеруй разделы без причины")

    # Сверка с approved.md
    mismatch = []
    if args.approved:
        approved = parse_md(open(args.approved, encoding="utf-8").read())
        if args.html:
            html_src = open(args.html, encoding="utf-8").read()
            ex = TextExtractor()
            ex.feed(html_src)
            html_text = norm(" ".join(ex.chunks))
        else:
            html_text = norm(all_text)
        for k, t in approved:
            if not t.strip():
                continue
            if norm(t) not in html_text:
                mismatch.append(f"нет в {'HTML' if args.html else 'тексте'} дословно: {where(t)}")
        # Текст в HTML, которого нет в approved (подозрение на самовольную правку)
        if args.html:
            approved_norm = norm(" ".join(t for _, t in approved))
            for chunk in re.split(r"\n+", " ".join(ex.chunks)):
                c = norm(chunk)
                if len(words(c)) >= 8 and c not in approved_norm:
                    warns.append(f"в HTML есть текст, которого нет в approved.md: {where(chunk.strip())}")

    # Проверки HTML
    if args.html:
        html_src = open(args.html, encoding="utf-8").read()
        ex2 = TextExtractor()
        ex2.feed(html_src)
        css = " ".join(ex2.styles)
        if ex2.h1 != 1:
            errors.append(f"в HTML должен быть один <h1>, найдено {ex2.h1}")
        if ex2.scripts:
            errors.append("в HTML есть <script>: скриптов быть не должно")
        for src, miss in ex2.imgs_bad:
            errors.append(f"<img {src}>: нет {', '.join(miss)}")
        if re.search(r"gradient\s*\(", css, re.I):
            errors.append("в CSS есть градиент")
        if re.search(r"(?<![\w-])box-shadow\s*:(?!\s*none)", css, re.I):
            errors.append("в CSS есть тень (box-shadow)")
        if re.search(r"text-shadow\s*:(?!\s*none)", css, re.I):
            errors.append("в CSS есть тень текста")
        if 'lang="ru"' not in html_src.lower() and "lang='ru'" not in html_src.lower():
            warns.append('у <html> нет lang="ru"')
        sels = re.findall(r"(?m)^\s*([^@{}\n][^{}\n]*)\{", css)
        bad = [s.strip() for s in sels if ".htr-article" not in s and not s.strip().startswith(("from", "to", "%"))
               and not re.match(r"^\d+%", s.strip())]
        if bad:
            warns.append(f"селекторы вне .htr-article ({len(bad)}), например: {bad[0][:50]}")
        orange = html_src.count("conditioning")
        if orange > 6:
            warns.append("много мест с --conditioning: не больше одного оранжевого элемента на экран")

    print(f"Слов: {n_words}, абзацев: {len(paras)}, заголовков: {len(heads)}")
    if errors:
        print(f"\nОШИБКИ ({len(errors)}):")
        for e in errors:
            print("  ✗", e)
    if warns:
        print(f"\nПРЕДУПРЕЖДЕНИЯ ({len(warns)}):")
        for w in warns:
            print("  !", w)
    if mismatch:
        print(f"\nРАСХОЖДЕНИЕ С approved.md ({len(mismatch)}):")
        for m in mismatch:
            print("  ≠", m)
    if not (errors or warns or mismatch):
        print("\nЧисто.")
    sys.exit(1 if (errors or mismatch) else 0)


if __name__ == "__main__":
    main()