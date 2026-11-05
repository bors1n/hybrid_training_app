import os, re, sys, json, statistics

ROOT = r"C:\Users\Borsin.AV\Desktop\Obsidian\obsidian-vault"
SKIP_DIRS = {".obsidian", ".opencode", ".claude", ".copilot", ".git"}

EMOJI = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF\u2B50\u2B06\u2705\u274C]")
BOLD_BULLET = re.compile(r"^\s*(?:[-*]|\d+\.)\s+\*\*[^*]{2,60}\*\*\s*[:\u2014\u2013-]", re.M)
YO = re.compile(r"\w*\u0451\w*", re.I)
SPACE_BEFORE_PUNCT = re.compile(r"\w \?|\w ,|\w !")
HUMAN_TYPO = re.compile(r"\b(что бы|так же|как бы|не смотря|в место|тсья|ться\b.{0,8}\bчто|ться\b)", re.I)
AI_WORDS = [
    "мощный", "ключев", "погруз", "важно отметить", "давайте", "не просто", "раскры", "потенциал",
    "экосистем", "инсайт", "бесшовн", "революцион", "кладез", "трансформ", "оптимизир", "комплексн",
    "эффективн", "в мире", "в эпоху", "в эру", "по сути", "подводя итог", "итог", "резюме", "помните",
    "секрет", "идеальн", "уникальн", "масштабируем", "нативн", "знакомо ли", "представьте",
]
NOT_X_Y = re.compile(r"\bне\s+(?:просто|только|про|о)\s[^.!?\n]{1,60}?[,;]\s*(?:а|но)\s", re.I)
FIRST = re.compile(r"\b(я|мой|моя|мое|моё|мои|мне|меня|мною|у меня|мы|наш\w*)\b", re.I)


def clean(t):
    t = re.sub(r"^---\n.*?\n---\n", "", t, flags=re.S)
    t = re.sub(r"```.*?```", "", t, flags=re.S)
    t = re.sub(r"!\[\[.*?\]\]", "", t)
    t = re.sub(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]", r"\1", t)
    t = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"https?://\S+", "", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"^\s*\|.*\|\s*$", "", t, flags=re.M)
    return t


def feats(path):
    raw = open(path, encoding="utf-8", errors="replace").read()
    t = clean(raw)
    words = re.findall(r"[\w'-]+", t, flags=re.U)
    n = len(words)
    if n < 60:
        return None
    cyr = sum(1 for w in words if re.search("[\u0430-\u044f\u0451]", w, re.I))
    lang = "ru" if cyr / n > 0.5 else "en"
    low = t.lower()
    per100 = lambda x: 100.0 * x / n
    lines = [l for l in t.splitlines() if l.strip()]
    heads = sum(1 for l in lines if l.lstrip().startswith("#"))
    bullets = sum(1 for l in lines if re.match(r"^\s*([-*]|\d+\.)\s", l))
    em = t.count("\u2014")
    hy = len(re.findall(r"\s-\s", t))
    f = dict(
        words=n, lang=lang,
        yo=per100(len(YO.findall(t))),
        emoji=len(EMOJI.findall(t)),
        boldbul=len(BOLD_BULLET.findall(t)),
        heads=per100(heads),
        bullets=bullets / max(1, len(lines)),
        em=per100(em),
        hy=per100(hy),
        spacepunct=per100(len(SPACE_BEFORE_PUNCT.findall(t))),
        typo=per100(len(HUMAN_TYPO.findall(t))),
        aiwords=per100(sum(low.count(w) for w in AI_WORDS)),
        notxy=len(NOT_X_Y.findall(t)),
        first=per100(len(FIRST.findall(t))),
        bold=per100(t.count("**") / 2),
    )
    return f


def score(f):
    """Чем больше, тем вероятнее ИИ. Диапазон примерно -3..+8."""
    s = 0.0
    s += min(f["emoji"], 6) * 0.6
    s += min(f["boldbul"], 8) * 0.5
    s += min(f["aiwords"], 4) * 0.8
    s += min(f["notxy"], 3) * 0.8
    s += min(f["em"], 2.0) * 1.0
    s += min(f["yo"], 2.0) * 0.8
    s += min(f["bold"], 4) * 0.3
    s += max(0, f["heads"] - 2.0) * 0.3
    # человеческие признаки
    s -= min(f["spacepunct"], 1.0) * 2.0
    s -= min(f["typo"], 1.0) * 2.0
    s -= min(f["hy"], 3.0) * 0.5
    s -= min(f["first"], 6.0) * 0.3
    return s


def walk():
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        for fn in files:
            if fn.endswith(".md"):
                yield os.path.join(d, fn)


if __name__ == "__main__":
    out = []
    for p in walk():
        f = feats(p)
        if f is None:
            continue
        f["score"] = score(f)
        f["path"] = os.path.relpath(p, ROOT)
        out.append(f)
    json.dump(out, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False)
    print(len(out), "files scored")
