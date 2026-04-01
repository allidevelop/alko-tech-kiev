#!/usr/bin/env python3
"""
Seed product reviews for alko-technics.kiev.ua
Generates realistic human-like reviews in Ukrainian and Russian.
"""
import random
import string
import psycopg2
from datetime import datetime, timedelta

DB_URL = "host=localhost dbname=medusa_alko user=medusa_alko password=medusa_alko_2026"

# ── Surname pools (diverse Ukrainian surnames) ──────────────

SURNAMES_UK = [
    "Абрамчук", "Андрущенко", "Бабенко", "Баранець", "Безуглий", "Біленко", "Білоус",
    "Бобровник", "Борисенко", "Вакуленко", "Варченко", "Величко", "Вернигора", "Вишняк",
    "Волошин", "Гаврилюк", "Ганжа", "Гладченко", "Гнатюк", "Голуб", "Гончар",
    "Горобець", "Гриб", "Гуменюк", "Данилюк", "Демченко", "Деркач", "Дзюба",
    "Довгаль", "Дорошенко", "Дубина", "Жайворонок", "Жук", "Заєць", "Залізняк",
    "Запорожець", "Зінченко", "Іваненко", "Калиниченко", "Каменяр", "Кириченко",
    "Клименко", "Козаченко", "Колесник", "Кондратенко", "Корнієнко", "Костенко",
    "Кравець", "Кушнір", "Лазаренко", "Лебідь", "Лисиця", "Лозовий", "Лукаш",
    "Ляшенко", "Мазур", "Максименко", "Мартиненко", "Матвієнко", "Мельничук",
    "Михайленко", "Мовчан", "Назаренко", "Нестеренко", "Овчаренко", "Олексієнко",
    "Онищенко", "Опанасенко", "Остапчук", "Паламарчук", "Панасенко", "Пархоменко",
    "Перепелиця", "Пилипенко", "Подоляк", "Поліщук", "Пономаренко", "Приходько",
    "Прокопенко", "Радченко", "Романенко", "Рибак", "Рудик", "Самойленко",
    "Саприкін", "Сидоренко", "Скляренко", "Соловей", "Сорока", "Стеценко",
    "Тарасенко", "Тесленко", "Ткачук", "Третяк", "Тригуб", "Федоренко",
    "Харченко", "Хоменко", "Цимбалюк", "Черненко", "Чорний", "Шаповал",
    "Шелест", "Шинкаренко", "Шульга", "Щербак", "Юрченко", "Яковенко", "Ярмоленко",
]

FIRSTNAMES_UK_M = [
    "Олександр", "Андрій", "Василь", "Віталій", "Дмитро", "Ігор", "Михайло",
    "Олег", "Петро", "Роман", "Сергій", "Тарас", "Юрій", "Богдан", "Артем",
    "Максим", "Володимир", "Євген", "Назар", "Степан", "Григорій", "Павло",
]

FIRSTNAMES_UK_F = [
    "Наталія", "Оксана", "Ірина", "Тетяна", "Олена", "Марія", "Юлія",
    "Галина", "Людмила", "Вікторія", "Дарина", "Анна", "Катерина", "Софія",
    "Леся", "Світлана", "Надія", "Валентина", "Зоя", "Лариса",
]

PATRONYMICS_UK_M = [
    "Олександрович", "Вікторович", "Іванович", "Петрович", "Миколайович",
    "Васильович", "Сергійович", "Анатолійович", "Павлович", "Олегович",
]

PATRONYMICS_UK_F = [
    "Олександрівна", "Вікторівна", "Іванівна", "Петрівна", "Миколаївна",
    "Василівна", "Сергіївна", "Анатоліївна", "Павлівна", "Олегівна",
]

FIRSTNAMES_RU_M = [
    "Александр", "Андрей", "Василий", "Виталий", "Дмитрий", "Игорь", "Михаил",
    "Олег", "Пётр", "Роман", "Сергей", "Юрий", "Артём", "Максим", "Евгений",
    "Владимир", "Николай", "Павел", "Григорий", "Степан",
]

FIRSTNAMES_RU_F = [
    "Наталья", "Оксана", "Ирина", "Татьяна", "Елена", "Мария", "Юлия",
    "Галина", "Людмила", "Виктория", "Дарья", "Анна", "Екатерина", "София",
    "Светлана", "Надежда", "Валентина", "Лариса",
]

PATRONYMICS_RU_M = [
    "Александрович", "Викторович", "Иванович", "Петрович", "Николаевич",
    "Васильевич", "Сергеевич", "Анатольевич", "Павлович", "Олегович",
]

PATRONYMICS_RU_F = [
    "Александровна", "Викторовна", "Ивановна", "Петровна", "Николаевна",
    "Васильевна", "Сергеевна", "Анатольевна", "Павловна", "Олеговна",
]

NAMES_NICK = [
    "serhiy_garden", "OlgaK", "master2026", "sadovod_ua", "green_thumb",
    "mykola78", "irina_kyiv", "garden_pro", "alex_tools", "vasyl_farmer",
    "natali_ua", "oleg_dnipro", "roman_lviv", "julia_odesa", "andrey_77",
    "Viktor", "Olena P.", "Sergiy", "Dmytro K.", "Marina_S",
    "taras_sad", "user2025", "GardenMaster", "DachaLife", "Gazon_King",
    "Sasha_Kyiv", "koval_igor", "anna_garden", "max_farmer", "olga_2025",
]


def generate_name(lang: str) -> str:
    """Generate a random name in various formats."""
    fmt = random.random()

    if fmt < 0.08:
        return random.choice(NAMES_NICK)

    if lang == "uk":
        is_female = random.random() < 0.35
        surname = random.choice(SURNAMES_UK)
        if is_female and surname.endswith("ко"):
            pass  # Ukrainian -ко surnames don't change
        elif is_female and surname.endswith("ий"):
            surname = surname[:-2] + "а"
        first = random.choice(FIRSTNAMES_UK_F if is_female else FIRSTNAMES_UK_M)
        patron = random.choice(PATRONYMICS_UK_F if is_female else PATRONYMICS_UK_M)
    else:
        is_female = random.random() < 0.35
        surname = random.choice(SURNAMES_UK)  # Same surnames
        if is_female and surname.endswith("ий"):
            surname = surname[:-2] + "ая"
        first = random.choice(FIRSTNAMES_RU_F if is_female else FIRSTNAMES_RU_M)
        patron = random.choice(PATRONYMICS_RU_F if is_female else PATRONYMICS_RU_M)

    if fmt < 0.25:
        return f"{surname} {first} {patron}"       # Петренко Олександр Вікторович
    elif fmt < 0.50:
        return f"{surname} {first}"                 # Петренко Олександр
    elif fmt < 0.65:
        return f"{first} {surname[0]}."             # Олександр П.
    elif fmt < 0.78:
        return f"{surname} {first[0]}.{patron[0]}." # Петренко О.В.
    elif fmt < 0.88:
        return first                                 # Олександр
    else:
        return f"{first[0]}. {surname}"              # О. Петренко


# ── Review templates (NO em-dashes!) ────────────────────────

TEMPLATES_UK = {
    "газонокосарк": [
        "Косить рівно, двигун працює тихо. Задоволений покупкою",
        "Газонокосарка працює відмінно, збирає траву чисто. Рекомендую",
        "Якісна косарка, легко керувати",
        "Кошу вже другий сезон, жодних проблем. Ножі тримають заточку",
        "Потужна, але при цьому не дуже гучна. Кошик великий",
        "Зручна ручка, легко складається для зберігання",
        "Працює як годинник. Сусіди питають де купив",
        "За цю ціну найкраща газонокосарка",
        "Скосив весь газон за 40 хвилин, батарея ще залишилась",
        "Легко маневрує між деревами, колеса великі",
        "Регулювання висоти зручне, 5 рівнів",
        "Дуже тиха, можна косити рано вранці",
    ],
    "подрібнювач": [
        "Перемелює гілки до 4 см без проблем",
        "Подрібнювач працює тихо для своєї потужності. Контейнер зручний",
        "Купив для дачі, перемололи все гілля за годину",
        "Якість збірки відмінна, ножі гострі",
        "Зручний, компактний, але потужний",
        "Ножі тримають заточку, вже третій сезон",
    ],
    "аератор": [
        "Газон ожив після першої обробки! Результат видно одразу",
        "Зручна регулювка глибини, працює рівно",
        "Аератор працює чудово, мох зникає після обробки",
        "Купив для газону 300 кв.м, справляється за годину",
        "Якісний інструмент, збірник великий",
    ],
    "тример": [
        "Легкий, зручна ручка. Косить чисто",
        "Тример потужний, струна подається добре",
        "Для невеликих ділянок ідеальний варіант",
        "Працює тихо, акумулятор тримає довго",
        "Не важкий, навіть дружина справляється",
    ],
    "коса": [
        "Потужна коса, косить густу траву без проблем",
        "Ніж та ліска, два режими, дуже зручно",
        "Для великої ділянки ідеальний вибір",
        "Працює як звір, навіть бур'яни зрізає",
        "Якісна, надійна. Користуюсь вже рік",
        "Мотор заводиться з першого разу",
    ],
    "пил": [
        "Ріже швидко, ланцюг тримає заточку добре",
        "Пила потужна, для дому і дачі вистачає з головою",
        "Легка, зручна. Масло не протікає",
        "Працює відмінно, шина якісна",
    ],
    "шланг": [
        "Якісний матеріал, не перегинається",
        "Шланг міцний, з'єднання надійні",
        "Для поливу саду те що треба. Не закручується",
        "Витримує тиск, не тріскається на сонці",
    ],
    "насос": [
        "Качає воду швидко, працює тихо",
        "Для свердловини підходить ідеально",
        "Потужний насос, працює вже другий сезон без проблем",
        "Зручний, компактний",
    ],
    "олив": [
        "Якісна олива, двигун працює м'яко",
        "Використовую для газонокосарки, все ок",
        "Оригінальна олива AL-KO",
    ],
    "акумулятор": [
        "Тримає заряд добре, заряджається швидко",
        "Підходить до всієї лінійки EnergyFlex",
        "Якісний акумулятор, працює довго",
    ],
    "ніж": [
        "Ножі якісні, сталь тримає заточку",
        "Підійшли ідеально, поставив за 5 хвилин",
        "Оригінальні ножі AL-KO",
    ],
    "культиватор": [
        "Розпушує землю чудово, легкий",
        "Для городу ідеальний, не треба копати лопатою",
        "Акумулятор тримає на весь город",
    ],
    "default": [
        "Якісний товар, рекомендую",
        "AL-KO завжди якість. Задоволений",
        "Доставка швидка, товар як на фото",
        "Все працює добре, дякую магазину",
        "Замовляю вже не перший раз, завжди все ок",
        "Хороша якість, відповідає опису",
        "Товар прийшов швидко, упаковка надійна",
        "Рекомендую цей магазин та товар",
        "Нормальна якість за свою ціну",
        "Офіційна гарантія, це важливо",
    ],
}

TEMPLATES_RU = {
    "газонокосарк": [
        "Косит ровно, двигатель работает тихо. Доволен покупкой",
        "Газонокосилка работает отлично, собирает траву чисто",
        "Качественная косилка, легко управлять",
        "Кошу уже второй сезон, никаких проблем",
        "Мощная, но при этом не очень шумная",
        "Удобная ручка, легко складывается для хранения",
        "Работает как часы",
        "Скосил весь газон за 40 минут, батарея ещё осталась",
        "Легко маневрирует между деревьями",
        "Регулировка высоты удобная, 5 уровней",
    ],
    "подрібнювач": [
        "Перемалывает ветки до 4 см без проблем",
        "Измельчитель работает тихо для своей мощности",
        "Купил для дачи, перемололи все ветки за час",
        "Качество сборки отличное, ножи острые",
    ],
    "аератор": [
        "Газон ожил после первой обработки",
        "Удобная регулировка глубины, работает ровно",
        "Аэратор работает отлично, мох исчезает",
    ],
    "тример": [
        "Лёгкий, удобная ручка. Косит чисто",
        "Триммер мощный, леска подаётся хорошо",
        "Для небольших участков идеальный вариант",
    ],
    "коса": [
        "Мощная коса, косит густую траву без проблем",
        "Нож и леска, два режима, очень удобно",
        "Для большого участка идеальный выбор",
    ],
    "пил": [
        "Пилит быстро, цепь держит заточку",
        "Пила мощная, для дома и дачи хватает",
        "Лёгкая, удобная. Масло не протекает",
    ],
    "шланг": [
        "Качественный материал, не перегибается",
        "Шланг прочный, соединения надёжные",
        "Для полива сада то что нужно",
    ],
    "насос": [
        "Качает воду быстро, работает тихо",
        "Мощный насос, работает уже второй сезон",
    ],
    "олив": [
        "Качественное масло, двигатель работает мягко",
        "Использую для газонокосилки, всё ок",
    ],
    "акумулятор": [
        "Держит заряд хорошо, заряжается быстро",
        "Качественный аккумулятор, работает долго",
    ],
    "default": [
        "Качественный товар, рекомендую",
        "AL-KO всегда качество. Доволен",
        "Доставка быстрая, товар как на фото",
        "Всё работает хорошо, спасибо магазину",
        "Заказываю уже не первый раз, всегда всё ок",
        "Хорошее качество, соответствует описанию",
        "Товар пришёл быстро, упаковка надёжная",
        "Рекомендую этот магазин",
        "Нормальное качество за свою цену",
        "Официальная гарантия, это важно",
    ],
}

COMPLAINTS_UK = [
    "Товар хороший, але інструкція тільки німецькою мовою",
    "Все працює, але упаковка була трохи пом'ята",
    "Нормально, але шумніший ніж очікував",
    "Якість непогана, але пластик міг бути кращим",
    "Працює добре, але збірка зайняла більше часу",
    "В цілому задоволений, але комплектація могла б бути кращою",
    "Товар ок, але доставка зайняла 5 днів",
    "Непогано, але колеса могли б бути міцнішими",
    "Нормально працює, але ручка трохи хиткається",
]

COMPLAINTS_RU = [
    "Товар хороший, но инструкция только на немецком",
    "Всё работает, но упаковка была немного помятая",
    "Нормально, но шумнее чем ожидал",
    "Качество неплохое, но пластик мог быть лучше",
    "Работает хорошо, но сборка заняла больше времени",
    "В целом доволен, но комплектация могла быть лучше",
    "Товар ок, но доставка заняла 5 дней",
    "Неплохо, но колёса могли бы быть прочнее",
    "Нормально работает, но ручка немного шатается",
]


# ── Humanize function ───────────────────────────────────────

def humanize(text: str) -> str:
    """Add random human-like imperfections to ~20-25% of texts."""
    # Remove any em-dashes that might have slipped in
    text = text.replace(" — ", ", ").replace("—", "-")

    if random.random() > 0.25:
        return text

    choice = random.random()
    if choice < 0.30:
        text = text.replace(", ", ",", 1)
    elif choice < 0.50:
        words = text.split(" ")
        if len(words) > 3:
            idx = random.randint(1, len(words) - 2)
            words[idx] = words[idx] + " "
            text = " ".join(words)
    elif choice < 0.65:
        text = text.rstrip(".")
    elif choice < 0.80:
        if text and text[0].isupper():
            text = text[0].lower() + text[1:]
    elif choice < 0.90:
        if len(text) > 10:
            idx = random.randint(3, len(text) - 3)
            text = text[:idx] + text[idx + 1] + text[idx] + text[idx + 2:]
    else:
        text = text.rstrip(".!") + "!"

    return text


def get_name(lang: str, used_names: set) -> str:
    """Get a random name, avoiding base-name repeats within a product."""
    for _ in range(20):  # max attempts
        r = random.random()
        if r < 0.80:
            name = generate_name(lang)
        else:
            name = generate_name("ru" if lang == "uk" else "uk")

        # Extract base first name for dedup (e.g. "Василь" from "Василь Д.")
        base = name.split()[0].rstrip(".") if not name[0].isascii() else name.split("_")[0]
        # Also check transliteration pairs
        pairs = {
            "Василь": "Василий", "Олександр": "Александр", "Андрій": "Андрей",
            "Сергій": "Сергей", "Дмитро": "Дмитрий", "Наталія": "Наталья",
            "Тетяна": "Татьяна", "Ірина": "Ирина", "Олена": "Елена",
            "Юлія": "Юлия", "Михайло": "Михаил", "Євген": "Евгений",
            "Петро": "Пётр", "Юрій": "Юрий", "Ігор": "Игорь",
            "Оксана": "Оксана", "Богдан": "Богдан", "Артем": "Артём",
            "Марія": "Мария", "Вікторія": "Виктория", "Галина": "Галина",
        }
        alt = pairs.get(base, "")
        rev_pairs = {v: k for k, v in pairs.items()}
        alt2 = rev_pairs.get(base, "")

        if base not in used_names and alt not in used_names and alt2 not in used_names:
            used_names.add(base)
            if alt: used_names.add(alt)
            if alt2: used_names.add(alt2)
            return name

    return generate_name(lang)  # fallback


def get_template(product_title: str, lang: str, rating: int, used_texts: set) -> str:
    """Get review text, no duplicates — tracks actual text + paired translations."""
    title_lower = product_title.lower()

    def pick_unique(pool: list, fallback_pool: list = None) -> str:
        """Pick a text not yet used in this product."""
        available = [t for t in pool if t not in used_texts]
        if not available and fallback_pool:
            available = [t for t in fallback_pool if t not in used_texts]
        if not available:
            available = pool  # last resort
        text = random.choice(available)
        used_texts.add(text)
        return text

    # For complaints (3-4 stars)
    if rating <= 3 or (rating == 4 and random.random() < 0.4):
        pool = COMPLAINTS_UK if lang == "uk" else COMPLAINTS_RU
        # Also mark the paired translation as used
        paired = COMPLAINTS_RU if lang == "uk" else COMPLAINTS_UK
        text = pick_unique(pool)
        idx = pool.index(text) if text in pool else -1
        if 0 <= idx < len(paired):
            used_texts.add(paired[idx])
        return text

    # Match category
    category_key = "default"
    for keyword in TEMPLATES_UK:
        if keyword != "default" and keyword in title_lower:
            category_key = keyword
            break

    pool = (TEMPLATES_UK if lang == "uk" else TEMPLATES_RU).get(category_key, [])
    paired_pool = (TEMPLATES_RU if lang == "uk" else TEMPLATES_UK).get(category_key, [])

    if not pool:
        pool = (TEMPLATES_UK if lang == "uk" else TEMPLATES_RU)["default"]
        paired_pool = (TEMPLATES_RU if lang == "uk" else TEMPLATES_UK)["default"]

    text = pick_unique(pool, (TEMPLATES_UK if lang == "uk" else TEMPLATES_RU)["default"])
    # Mark paired translation as used too
    idx = pool.index(text) if text in pool else -1
    if 0 <= idx < len(paired_pool):
        used_texts.add(paired_pool[idx])

    return text


def get_rating() -> int:
    r = random.random()
    if r < 0.65:
        return 5
    elif r < 0.85:
        return 4
    elif r < 0.95:
        return 3
    else:
        return 0


def get_review_count(price: float, is_bestseller: bool) -> int:
    if is_bestseller:
        return random.randint(3, 5)
    if price > 5000:
        return random.randint(2, 4)
    if price > 1000:
        return random.randint(1, 3)
    if price > 300:
        return random.choice([0, 0, 1, 1])
    if price > 100:
        return random.choice([0, 0, 0, 1])
    return random.choice([0, 0, 0, 0, 1])


def random_date(months_back: int = 6) -> datetime:
    """Random date in seasonal range: March-September (garden season)."""
    now = datetime.now()
    current_year = now.year

    # Seasonal months: March(3) - September(9) across this year and last year
    seasonal_ranges = []
    # Last year season
    seasonal_ranges.append((datetime(current_year - 1, 3, 15), datetime(current_year - 1, 9, 30)))
    # This year season (up to now or September)
    season_end = min(now, datetime(current_year, 9, 30))
    if now.month >= 3:
        seasonal_ranges.append((datetime(current_year, 3, 1), season_end))

    # Pick a random range
    start, end = random.choice(seasonal_ranges)
    if end <= start:
        end = start + timedelta(days=30)

    days_range = (end - start).days
    if days_range <= 0:
        days_range = 30
    dt = start + timedelta(days=random.randint(0, days_range))
    dt = dt.replace(
        hour=random.randint(7, 22),
        minute=random.randint(0, 59),
        second=random.randint(0, 59),
    )
    return dt


# ── Main ────────────────────────────────────────────────────

def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    BESTSELLER_SKUS = {
        "112924", "113871", "112800", "113872", "114040", "112387",
        "113873", "112808", "112809", "113654", "113957", "113951",
        "112822", "113962", "113371", "113961", "114053", "113928",
    }

    cur.execute("""
        SELECT DISTINCT ON (p.id)
            p.id, p.title, p.metadata->>'alko_article' as sku, pp.amount as price
        FROM product p
        JOIN product_variant pv ON pv.product_id = p.id
        JOIN product_variant_price_set pvps ON pvps.variant_id = pv.id
        JOIN price pp ON pp.price_set_id = pvps.price_set_id AND pp.currency_code = 'uah'
        WHERE p.deleted_at IS NULL AND pp.amount > 0
        ORDER BY p.id, pp.amount DESC
    """)
    products = cur.fetchall()

    cur.execute("SELECT product_id, COUNT(*) FROM product_reviews GROUP BY product_id")
    existing = dict(cur.fetchall())

    total_added = 0
    products_with_reviews = 0

    for prod_id, title, sku, price in products:
        is_bestseller = sku in BESTSELLER_SKUS if sku else False
        target_count = get_review_count(float(price), is_bestseller)
        current_count = existing.get(prod_id, 0)

        if target_count <= current_count:
            continue

        to_add = target_count - current_count
        products_with_reviews += 1
        used_texts = set()    # Track texts + their translations to avoid duplicates
        used_names = set()    # Track base first names to avoid Василь+Василий

        for _ in range(to_add):
            rating = get_rating()
            if rating == 0:
                continue

            lang = "uk" if random.random() < 0.65 else "ru"
            name = get_name(lang, used_names)
            comment = humanize(get_template(title, lang, rating, used_texts))
            created = random_date(5)

            cur.execute(
                """INSERT INTO product_reviews (product_id, name, rating, comment, status, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, 'approved', %s, %s)""",
                (prod_id, name, rating, comment, created, created),
            )
            total_added += 1

    conn.commit()

    cur.execute("SELECT COUNT(*), AVG(rating)::numeric(3,1), COUNT(DISTINCT product_id) FROM product_reviews WHERE status='approved'")
    total, avg_rating, products_count = cur.fetchone()

    print(f"✅ Seed complete!")
    print(f"   Added: {total_added} reviews")
    print(f"   Products with reviews: {products_with_reviews}")
    print(f"   Total reviews in DB: {total}")
    print(f"   Average rating: {avg_rating}")
    print(f"   Products covered: {products_count}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
