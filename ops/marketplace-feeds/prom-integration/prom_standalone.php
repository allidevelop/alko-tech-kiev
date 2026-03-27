<?php
/**
 * AL-KO XML Proxy для Prom.ua - Standalone версія (один файл)
 *
 * Інструкція:
 * 1. Завантажте цей файл на хостинг
 * 2. Налаштуйте змінні нижче
 * 3. Вкажіть посилання на цей файл в особистому кабінеті Prom.ua
 *
 * Версія: 1.1 Standalone
 *
 * Виправлення:
 * - available=true при stock=0 → available=false
 * - Додавання quantity_in_stock
 * - Додавання presence_sure="true" для товарів в наявності
 * - name_ua → name
 * - description_ua → description
 * - article → vendorCode
 * - Видалення "Посилання на life style фото" (довжина > 255)
 * - Пропуск товарів без назви
 * - Обрізання характеристик до 1024 символів
 */

// =====================================================
// НАЛАШТУВАННЯ - ЗМІНІТЬ ПІД СВІЙ МАГАЗИН
// =====================================================

$CONFIG = [
    // Джерело XML прайс-листу
    'source_url' => 'https://apipim.al-ko.ua/storage/xml_files/PriceList.xml',

    // Інформація про магазин
    'shop_name' => 'AL-KO Technics Ukraine',
    'shop_company' => 'alko-technics.com.ua',
    'shop_url' => 'https://alko-technics.com.ua',

    // Бренд для нормалізації
    'brand' => 'AL-KO',

    // Кешування (рекомендовано)
    'cache_enabled' => true,
    'cache_time' => 3600, // 1 година в секундах

    // Артикули товарів для виключення
    'exclude_articles' => [
        '123097',
        '127192',
    ],

    // Параметри для видалення
    'remove_params' => [
        'Ставка ПДВ',
        'Посилання на life style фото',
        'Посилання на lifestyle фото',
        'Life style фото',
        'Lifestyle фото',
        'Інші специфікації',
    ],

    // Додаткові параметри для всіх товарів
    'additional_params' => [
        'Гарантія' => '2 роки',
        'Країна реєстрації бренду' => 'Німеччина',
    ],
];

// =====================================================
// КІНЕЦЬ НАЛАШТУВАНЬ - НЕ РЕДАГУЙТЕ НИЖЧЕ
// =====================================================

error_reporting(0);
ini_set('display_errors', 0);
set_time_limit(120);

header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');
header('X-Generator: AL-KO Prom.ua Proxy/1.0');

class AlkoPromProxy {
    private $config;
    private $cacheFile;

    public function __construct($config) {
        $this->config = $config;
        $this->cacheFile = sys_get_temp_dir() . '/alko_prom_cache_' . md5($config['source_url']) . '.xml';
    }

    private function fetchXml() {
        // Перевіряємо кеш
        if ($this->config['cache_enabled'] && file_exists($this->cacheFile)) {
            $age = time() - filemtime($this->cacheFile);
            if ($age < $this->config['cache_time']) {
                return file_get_contents($this->cacheFile);
            }
        }

        // Завантажуємо з джерела
        $ctx = stream_context_create([
            'http' => ['timeout' => 120, 'user_agent' => 'AL-KO Prom.ua Proxy/1.0'],
            'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]
        ]);

        $xml = @file_get_contents($this->config['source_url'], false, $ctx);
        if ($xml === false) throw new Exception('Не вдалося завантажити XML');

        // Зберігаємо в кеш
        if ($this->config['cache_enabled']) {
            @file_put_contents($this->cacheFile, $xml, LOCK_EX);
        }

        return $xml;
    }

    private function normalizeBrand($v) {
        $v = trim($v);

        // AL-KO та варіанти
        if (preg_match('/al[\-\s]?ko/i', $v)) {
            return $this->config['brand'];
        }

        // Відомі бренди Prom.ua (залишаємо як є)
        // MASPORT видалено - Prom.ua не визнає
        $knownBrands = [
            'OREGON', 'Oregon',
            'Honda', 'HONDA',
            'Briggs&Stratton', 'Briggs & Stratton', 'B&S',
            'Mowox', 'MOWOX',
            'SOLO', 'Solo', 'solo by AL-KO',
        ];

        foreach ($knownBrands as $brand) {
            if (strcasecmp($v, $brand) === 0 || stripos($v, $brand) !== false) {
                return $brand;
            }
        }

        // Невідомі бренди → AL-KO (для сумісності з Prom.ua)
        return $this->config['brand'];
    }

    /**
     * Створює елемент з текстом, безпечно обробляючи спецсимволи (&, <, > тощо)
     */
    private function createTextElement($doc, $tagName, $text) {
        $el = $doc->createElement($tagName);
        $el->appendChild($doc->createTextNode($text));
        return $el;
    }

    public function transform() {
        $sourceXml = simplexml_load_string($this->fetchXml());
        if (!$sourceXml) throw new Exception('Помилка парсингу XML');

        // Створюємо новий XML для Prom.ua
        $output = new DOMDocument('1.0', 'UTF-8');
        $output->formatOutput = true;

        // Кореневий елемент
        $catalog = $output->createElement('yml_catalog');
        $catalog->setAttribute('date', date('Y-m-d H:i'));
        $output->appendChild($catalog);

        // Shop
        $shop = $output->createElement('shop');
        $catalog->appendChild($shop);

        // Інформація про магазин
        $shop->appendChild($output->createElement('name', $this->config['shop_name']));
        $shop->appendChild($output->createElement('company', $this->config['shop_company']));
        $shop->appendChild($output->createElement('url', $this->config['shop_url']));

        // Валюти
        $currencies = $output->createElement('currencies');
        $currency = $output->createElement('currency');
        $currency->setAttribute('id', 'UAH');
        $currency->setAttribute('rate', '1');
        $currencies->appendChild($currency);
        $shop->appendChild($currencies);

        // Копіюємо категорії
        if (isset($sourceXml->shop->categories)) {
            $catNode = $output->importNode(dom_import_simplexml($sourceXml->shop->categories), true);
            $shop->appendChild($catNode);
        }

        // Обробляємо оффери
        $offers = $output->createElement('offers');
        $shop->appendChild($offers);

        if (isset($sourceXml->shop->offers->offer)) {
            foreach ($sourceXml->shop->offers->offer as $src) {
                $id = (string)$src['id'];
                $art = isset($src->article) ? (string)$src->article : $id;

                // Виключаємо по артикулу
                if (in_array($art, $this->config['exclude_articles'])) continue;

                // Виключаємо без фото
                if (!isset($src->picture) || empty(trim((string)$src->picture))) continue;

                // Перевіряємо назву ПЕРЕД створенням offer
                $name = '';
                if (isset($src->name_ua)) {
                    $name = trim((string)$src->name_ua);
                }
                if (empty($name) && isset($src->name)) {
                    $name = trim((string)$src->name);
                }
                // Пропускаємо товари без назви (обов'язкове поле Prom.ua)
                if (empty($name)) continue;

                // Перевіряємо виробника
                $vendor = $this->config['brand'];
                if (isset($src->vendor) && !empty(trim((string)$src->vendor))) {
                    $vendor = $this->normalizeBrand((string)$src->vendor);
                }
                // Пропускаємо товари без виробника
                if (empty($vendor)) continue;

                // Визначаємо наявність
                $stock = isset($src->stock_quantity) ? (int)$src->stock_quantity : 0;
                $available = $stock > 0;

                // Створюємо offer
                $offer = $output->createElement('offer');
                $offer->setAttribute('id', $id);
                $offer->setAttribute('available', $available ? 'true' : 'false');

                // presence_sure для товарів в наявності
                if ($available) {
                    $offer->setAttribute('presence_sure', 'true');
                }

                // Ціна
                if (isset($src->price)) {
                    $offer->appendChild($output->createElement('price', (string)$src->price));
                }

                // Валюта
                $offer->appendChild($output->createElement('currencyId', 'UAH'));

                // Категорія
                if (isset($src->categoryId)) {
                    $offer->appendChild($output->createElement('categoryId', (string)$src->categoryId));
                }

                // Картинки (основні)
                foreach ($src->picture as $pic) {
                    $picUrl = trim((string)$pic);
                    if (!empty($picUrl)) {
                        $offer->appendChild($this->createTextElement($output, 'picture', $picUrl));
                    }
                }

                // Додаткові картинки з параметра "Посилання на life style фото"
                // Формат: "url1"; "url2"; "url3"
                foreach ($src->param as $param) {
                    $pn = (string)$param['name'];
                    if (stripos($pn, 'life') !== false && stripos($pn, 'style') !== false) {
                        $lifestyleValue = trim((string)$param);
                        // Розбиваємо по крапці з комою та видаляємо лапки
                        $urls = preg_split('/[;,]\s*/', $lifestyleValue);
                        foreach ($urls as $url) {
                            $url = trim($url, " \t\n\r\0\x0B\"'");
                            if (!empty($url) && preg_match('/^https?:\/\//i', $url)) {
                                $offer->appendChild($this->createTextElement($output, 'picture', $url));
                            }
                        }
                    }
                }

                // URL товару
                if (isset($src->url) && !empty(trim((string)$src->url))) {
                    $offer->appendChild($this->createTextElement($output, 'url', (string)$src->url));
                }

                // Назва (вже перевірено вище)
                $offer->appendChild($this->createTextElement($output, 'name', $name));

                // Артикул → vendorCode
                $offer->appendChild($this->createTextElement($output, 'vendorCode', $art));

                // Виробник (вже перевірено вище)
                $offer->appendChild($this->createTextElement($output, 'vendor', $vendor));

                // Кількість на складі
                $offer->appendChild($output->createElement('quantity_in_stock', (string)$stock));

                // Опис (description_ua → description)
                $desc = '';
                if (isset($src->description_ua)) {
                    $desc = (string)$src->description_ua;
                } elseif (isset($src->description)) {
                    $desc = (string)$src->description;
                }
                if (!empty($desc)) {
                    // Видаляємо вкладені CDATA
                    $desc = preg_replace('/^\s*<!\[CDATA\[(.*)\]\]>\s*$/s', '$1', $desc);
                    $descEl = $output->createElement('description');
                    $descEl->appendChild($output->createCDATASection($desc));
                    $offer->appendChild($descEl);
                }

                // Параметри
                $addedParams = [];
                foreach ($src->param as $param) {
                    $pn = (string)$param['name'];
                    $pv = (string)$param;

                    // Пропускаємо параметри зі списку видалення
                    if (in_array($pn, $this->config['remove_params'])) continue;

                    // Пропускаємо параметри з URL (часто занадто довгі)
                    if (preg_match('/https?:\/\//i', $pv) && mb_strlen($pv) > 255) continue;

                    // Нормалізуємо виробника
                    if ($pn === 'Виробник' || $pn === 'Производитель') {
                        $pv = $this->config['brand'];
                    }

                    // Обрізаємо значення до 1024 символів (ліміт Prom.ua)
                    if (mb_strlen($pv) > 1024) {
                        $pv = mb_substr($pv, 0, 1021) . '...';
                    }

                    $paramEl = $output->createElement('param');
                    $paramEl->appendChild($output->createTextNode($pv));
                    $paramEl->setAttribute('name', $pn);
                    $offer->appendChild($paramEl);
                    $addedParams[$pn] = true;
                }

                // Додаткові параметри
                foreach ($this->config['additional_params'] as $pn => $pv) {
                    if (!isset($addedParams[$pn])) {
                        $paramEl = $output->createElement('param');
                        $paramEl->appendChild($output->createTextNode($pv));
                        $paramEl->setAttribute('name', $pn);
                        $offer->appendChild($paramEl);
                    }
                }

                $offers->appendChild($offer);
            }
        }

        return $output->saveXML();
    }
}

// Виконання
try {
    $proxy = new AlkoPromProxy($CONFIG);
    echo $proxy->transform();

} catch (Exception $e) {
    header('HTTP/1.1 500 Internal Server Error');
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    echo '<error><message>' . htmlspecialchars($e->getMessage()) . '</message></error>';
}
