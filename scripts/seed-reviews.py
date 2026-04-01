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

# ── Name pools ──────────────────────────────────────────────

NAMES_UK = [
    # Full name (ФІО)
    "Петренко Олександр Вікторович", "Коваленко Наталія Іванівна", "Мельник Василь Петрович",
    "Бондаренко Ольга Сергіївна", "Ткаченко Андрій Миколайович", "Шевченко Тетяна Олексіївна",
    "Кравченко Ігор Васильович", "Лисенко Марина Анатоліївна", "Мороз Дмитро Олегович",
    "Савченко Ірина Юріївна", "Руденко Олег Павлович", "Гончаренко Людмила Віталіївна",
    # Last + first
    "Ковальчук Наталія", "Поліщук Сергій", "Карпенко Оксана", "Бойко Микола",
    "Кузьменко Тарас", "Павленко Юлія", "Олійник Роман", "Гриценко Галина",
    "Левченко Артем", "Марченко Віра", "Тимошенко Богдан", "Литвиненко Дарина",
    # First + initial
    "Андрій К.", "Наталія В.", "Олексій М.", "Ірина Б.", "Сергій Т.", "Оксана П.",
    "Василь Д.", "Марія Л.", "Юрій Г.", "Тетяна Р.",
    # Initials + last
    "Шевченко О.В.", "Мельник І.П.", "Коваль Д.С.", "Ткаченко Н.А.",
    # First only
    "Олександр", "Наталія", "Василь", "Оксана", "Тарас", "Ірина", "Богдан", "Юлія",
]

NAMES_RU = [
    # Full name
    "Петренко Александр Викторович", "Коваленко Наталья Ивановна", "Мельник Василий Петрович",
    "Бондаренко Ольга Сергеевна", "Ткаченко Андрей Николаевич", "Шевченко Татьяна Алексеевна",
    "Кравченко Игорь Васильевич", "Лысенко Марина Анатольевна", "Мороз Дмитрий Олегович",
    # Last + first
    "Ковальчук Наталья", "Полищук Сергей", "Карпенко Оксана", "Бойко Николай",
    "Кузьменко Тарас", "Павленко Юлия", "Олейник Роман", "Гриценко Галина",
    # First + initial
    "Андрей К.", "Наталья В.", "Алексей М.", "Ирина Б.", "Сергей Т.",
    "Василий Д.", "Мария Л.", "Юрий Г.", "Татьяна Р.",
    # First only
    "Александр", "Наталья", "Василий", "Оксана", "Ирина", "Дмитрий", "Юлия",
]

NAMES_NICK = [
    "serhiy_garden", "OlgaK", "master2026", "sadovod_ua", "green_thumb",
    "mykola78", "irina_kyiv", "garden_pro", "alex_tools", "vasyl_farmer",
    "natali_ua", "oleg_dnipro", "roman_lviv", "julia_odesa", "andrey_77",
    "Viktor", "Olena P.", "Sergiy", "Dmytro K.", "Marina",
    "taras_sad", "user2025", "GardenMaster", "AlkoFan", "DachaLife",
]

# ── Review templates ────────────────────────────────────────

TEMPLATES_UK = {
    "газонокосарк": [
        "Косить рівно, двигун працює тихо. Задоволений покупкою",
        "Газонокосарка працює відмінно, збирає траву чисто. Рекомендую",
        "Якісна косарка, легко керувати. AL-KO не підводить",
        "Кошу вже другий сезон, жодних проблем. Ножі тримають заточку",
        "Потужна, але при цьому не дуже гучна. Кошик великий, не треба часто витрушувати",
        "Зручна ручка, легко складається для зберігання",
        "Працює як годинник. Сусіди питають де купив",
        "За цю ціну — найкраща газонокосарка. Німецька якість",
    ],
    "подрібнювач": [
        "Перемелює гілки до 4 см без проблем. Потужний апарат",
        "Подрібнювач працює тихо для своєї потужності. Контейнер зручний",
        "Купив для дачі, перемололи все гілля за годину",
        "Якість збірки відмінна, ножі гострі. Працює стабільно",
        "Зручний, компактний, але потужний. Рекомендую для саду",
    ],
    "аератор": [
        "Газон ожив після першої обробки! Результат видно одразу",
        "Зручна регулювка глибини, працює рівно",
        "Аератор працює чудово, мох зникає після обробки",
        "Купив для газону 300 кв.м — справляється за годину",
        "Якісний інструмент, збірник великий. Раджу",
    ],
    "тример": [
        "Легкий, зручна ручка. Косить чисто",
        "Тример потужний, струна подається добре",
        "Для невеликих ділянок ідеальний варіант",
        "Працює тихо, акумулятор тримає довго",
        "Зручний, не важкий. Жінка теж може косити",
    ],
    "коса": [
        "Потужна коса, косить густу траву без проблем",
        "Ніж та ліска — два режими, дуже зручно",
        "Для великої ділянки — ідеальний вибір",
        "Працює як звір, навіть бур'яни зрізає",
        "Якісна, надійна. Користуюсь вже рік",
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
        "Для поливу саду — те що треба. Не закручується",
        "Витримує тиск, не тріскається на сонці",
    ],
    "насос": [
        "Качає воду швидко, працює тихо",
        "Для свердловини підходить ідеально",
        "Потужний насос, працює вже другий сезон без проблем",
        "Зручний, компактний. Якість AL-KO",
    ],
    "олив": [
        "Якісна олива, двигун працює м'яко",
        "Використовую для газонокосарки, все ок",
        "Оригінальна олива AL-KO, рекомендую",
    ],
    "акумулятор": [
        "Тримає заряд добре, заряджається швидко",
        "Підходить до всієї лінійки EnergyFlex",
        "Якісний акумулятор, працює довго на одному заряді",
    ],
    "ніж": [
        "Ножі якісні, сталь тримає заточку",
        "Підійшли ідеально, поставив за 5 хвилин",
        "Оригінальні ножі AL-KO, рекомендую",
    ],
    "default": [
        "Якісний товар, рекомендую",
        "AL-KO — завжди якість. Задоволений",
        "Доставка швидка, товар як на фото",
        "Все працює добре, дякую магазину",
        "Замовляю вже не перший раз, завжди все ок",
        "Хороша якість, відповідає опису",
        "Товар прийшов швидко, упаковка надійна",
        "Рекомендую цей магазин та товар",
    ],
}

TEMPLATES_RU = {
    "газонокосарк": [
        "Косит ровно, двигатель работает тихо. Доволен покупкой",
        "Газонокосилка работает отлично, собирает траву чисто",
        "Качественная косилка, легко управлять. AL-KO не подводит",
        "Кошу уже второй сезон, никаких проблем",
        "Мощная, но при этом не очень шумная. Корзина большая",
        "Удобная ручка, легко складывается для хранения",
        "Работает как часы. Соседи спрашивают где купил",
    ],
    "подрібнювач": [
        "Перемалывает ветки до 4 см без проблем. Мощный аппарат",
        "Измельчитель работает тихо для своей мощности",
        "Купил для дачи, перемололи все ветки за час",
        "Качество сборки отличное, ножи острые",
    ],
    "аератор": [
        "Газон ожил после первой обработки! Результат видно сразу",
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
        "Нож и леска — два режима, очень удобно",
        "Для большого участка — идеальный выбор",
    ],
    "пил": [
        "Пилит быстро, цепь держит заточку",
        "Пила мощная, для дома и дачи хватает с головой",
        "Лёгкая, удобная. Масло не протекает",
    ],
    "шланг": [
        "Качественный материал, не перегибается",
        "Шланг прочный, соединения надёжные",
        "Для полива сада — то что нужно",
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
        "AL-KO — всегда качество. Доволен",
        "Доставка быстрая, товар как на фото",
        "Всё работает хорошо, спасибо магазину",
        "Заказываю уже не первый раз, всегда всё ок",
        "Хорошее качество, соответствует описанию",
        "Товар пришёл быстро, упаковка надёжная",
        "Рекомендую этот магазин",
    ],
}

# 3-4 star reviews (complaints)
COMPLAINTS_UK = [
    "Товар хороший, але інструкція тільки німецькою мовою",
    "Все працює, але упаковка була трохи пом'ята",
    "Нормально, але шумніший ніж очікував",
    "Якість непогана, але за ці гроші хотілось кращого пластику",
    "Працює добре, але збірка зайняла більше часу ніж написано",
    "В цілому задоволений, але комплектація могла б бути кращою",
    "Товар ок, але доставка зайняла 5 днів",
    "Непогано, але колеса могли б бути міцнішими",
]

COMPLAINTS_RU = [
    "Товар хороший, но инструкция только на немецком",
    "Всё работает, но упаковка была немного помятая",
    "Нормально, но шумнее чем ожидал",
    "Качество неплохое, но за эти деньги ожидал лучшего пластика",
    "Работает хорошо, но сборка заняла больше времени",
    "В целом доволен, но комплектация могла быть лучше",
    "Товар ок, но доставка заняла 5 дней",
    "Неплохо, но колёса могли бы быть прочнее",
]


# ── Humanize function ───────────────────────────────────────

def humanize(text: str) -> str:
    """Add random human-like imperfections to ~20-25% of texts."""
    if random.random() > 0.25:
        return text

    choice = random.random()
    if choice < 0.30:
        # Remove space after comma
        text = text.replace(", ", ",", 1)
    elif choice < 0.50:
        # Double space
        words = text.split(" ")
        if len(words) > 3:
            idx = random.randint(1, len(words) - 2)
            words[idx] = words[idx] + " "
            text = " ".join(words)
    elif choice < 0.65:
        # Remove trailing period
        text = text.rstrip(".")
    elif choice < 0.80:
        # Lowercase first letter
        if text and text[0].isupper():
            text = text[0].lower() + text[1:]
    elif choice < 0.90:
        # Minor typo — swap two adjacent letters
        if len(text) > 10:
            idx = random.randint(3, len(text) - 3)
            text = text[:idx] + text[idx + 1] + text[idx] + text[idx + 2:]
    else:
        # Extra exclamation
        text = text.rstrip(".!") + "!"

    return text


def get_name(lang: str) -> str:
    """Get a random name, ~80% matching language, ~20% mixed."""
    r = random.random()
    if r < 0.12:
        # Nickname (language-neutral)
        return random.choice(NAMES_NICK)
    elif r < 0.80:
        # Matching language
        return random.choice(NAMES_UK if lang == "uk" else NAMES_RU)
    else:
        # Mismatched (bilingual realism)
        return random.choice(NAMES_RU if lang == "uk" else NAMES_UK)


def get_template(product_title: str, lang: str, rating: int) -> str:
    """Get review text based on product category and rating."""
    title_lower = product_title.lower()
    templates = TEMPLATES_UK if lang == "uk" else TEMPLATES_RU

    if rating <= 3:
        complaints = COMPLAINTS_UK if lang == "uk" else COMPLAINTS_RU
        return random.choice(complaints)

    if rating == 4 and random.random() < 0.4:
        complaints = COMPLAINTS_UK if lang == "uk" else COMPLAINTS_RU
        return random.choice(complaints)

    # Match category
    for keyword, pool in templates.items():
        if keyword != "default" and keyword in title_lower:
            return random.choice(pool)

    return random.choice(templates["default"])


def get_rating() -> int:
    """Weighted random rating: 65% 5★, 20% 4★, 10% 3★, 5% skip."""
    r = random.random()
    if r < 0.65:
        return 5
    elif r < 0.85:
        return 4
    elif r < 0.95:
        return 3
    else:
        return 0  # skip


def get_review_count(price: float, is_bestseller: bool) -> int:
    """Determine how many reviews a product should get."""
    if is_bestseller:
        return random.randint(3, 5)
    if price > 5000:
        return random.randint(2, 4)
    if price > 1000:
        return random.randint(1, 3)
    if price > 300:
        return random.randint(1, 2)
    if price > 100:
        return random.choice([0, 0, 1, 1])
    return random.choice([0, 0, 0, 1])


def random_date(months_back: int = 6) -> datetime:
    """Random date within last N months."""
    now = datetime.now()
    days_back = random.randint(7, months_back * 30)
    dt = now - timedelta(days=days_back)
    # Random time of day
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

    # Bestseller SKUs (from sales data)
    BESTSELLER_SKUS = {
        "112924", "113871", "112800", "113872", "114040", "112387",
        "113873", "112808", "112809", "113654", "113957", "113951",
        "112822", "113962", "113371", "113961",  # top sellers
        "114053", "113928",  # recent orders
    }

    # Get products with prices
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

    # Get existing reviews count per product
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

        for _ in range(to_add):
            rating = get_rating()
            if rating == 0:
                continue

            lang = "uk" if random.random() < 0.65 else "ru"
            name = get_name(lang)
            comment = humanize(get_template(title, lang, rating))
            created = random_date(5)

            cur.execute(
                """INSERT INTO product_reviews (product_id, name, rating, comment, status, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, 'approved', %s, %s)""",
                (prod_id, name, rating, comment, created, created),
            )
            total_added += 1

    conn.commit()

    # Stats
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
