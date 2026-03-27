<?php
/**
 * AL-KO XML Proxy для Rozetka - Standalone версія (один файл)
 *
 * Інструкція:
 * 1. Завантажте цей файл на хостинг (наприклад, в /rozetka/ або /feed/)
 * 2. Налаштуйте змінні нижче
 * 3. Надайте посилання на цей файл менеджеру Rozetka
 *
 * Версія: 2.2 Standalone - виправлення помилок Marketplace
 * Дата: 2025-12-16
 */

// =====================================================
// НАЛАШТУВАННЯ - ЗМІНІТЬ ПІД СВІЙ МАГАЗИН
// =====================================================

$CONFIG = [
    // Джерело XML прайс-листу
    'source_url' => 'https://apipim.al-ko.ua/storage/xml_files/PriceList.xml',

    // Інформація про магазин
    'shop_name' => 'AL-KO Technics Ukraine',
    'shop_url' => 'https://alko-technics.com.ua',

    // Бренд для нормалізації
    'brand' => 'AL-KO',

    // Кешування (рекомендовано)
    'cache_enabled' => true,
    'cache_time' => 3600, // 1 година в секундах

    // Артикули товарів для виключення (без фото тощо)
    'exclude_articles' => [
        '123097',
        '127192',
    ],

    // Параметри для повного видалення (містять URL або занадто довгі)
    'remove_params' => [
        'Ставка ПДВ',
        'Посилання на life style фото',
        'Посилання на відео',
        'Гарантійні умови',
    ],

    // Максимальна довжина значення параметра
    'max_param_length' => 490,
];

// =====================================================
// КІНЕЦЬ НАЛАШТУВАНЬ - НЕ РЕДАГУЙТЕ НИЖЧЕ
// =====================================================

error_reporting(0);
ini_set('display_errors', 0);
set_time_limit(120);

header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');

class AlkoRozetkaProxy {
    private $config;
    private $cacheFile;

    public function __construct($config) {
        $this->config = $config;
        $this->cacheFile = sys_get_temp_dir() . '/alko_rozetka_cache_' . md5($config['source_url']) . '.xml';
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
            'http' => ['timeout' => 120, 'user_agent' => 'AL-KO Rozetka Proxy/2.2'],
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
        return preg_match('/al[\-\s]?ko/i', $v) ? $this->config['brand'] : trim($v);
    }

    private function truncateText($text, $maxLen = 490) {
        $text = trim($text);
        if (mb_strlen($text) <= $maxLen) return $text;
        $text = mb_substr($text, 0, $maxLen);
        $lastSpace = mb_strrpos($text, ' ');
        if ($lastSpace > $maxLen - 50) {
            $text = mb_substr($text, 0, $lastSpace);
        }
        return $text . '...';
    }

    private function containsUrl($text) {
        return preg_match('/https?:\/\/|www\./i', $text);
    }

    private function shouldRemoveParam($paramName) {
        foreach ($this->config['remove_params'] as $removeParam) {
            if (mb_stripos($paramName, $removeParam) !== false) {
                return true;
            }
        }
        return false;
    }

    private function formatName($name, $art) {
        $brand = $this->config['brand'];
        $name = preg_replace('/\b(AL-KO|AL KO|ALKO)\b\s*/i', '', trim($name));

        $types = ['Газонокосарка','Тример','Мотокоса','Кущоріз','Повітродувка','Аератор',
                  'Скарифікатор','Пила','Снігоприбирач','Висоторіз','Культиватор','Мотоблок',
                  'Насос','Мийка','Генератор','Подрібнювач','Компостер','Гриль','Обприскувач',
                  'Акумулятор','Зарядний','Ніж','Котушка','Шланг','Ланцюг','Масло','Олива',
                  'Шпулька','Ремінь','Ножі','Запасні','Набір','Косильна','Трактор'];

        foreach ($types as $type) {
            if (mb_stripos($name, $type) === 0) {
                $rest = trim(mb_substr($name, mb_strlen($type)));
                return $type . ' ' . $brand . ($rest ? ' ' . $rest : '') . ' (арт. ' . $art . ')';
            }
        }

        $w = preg_split('/\s+/', $name, 2);
        $formatted = count($w) > 1 ? $w[0] . ' ' . $brand . ' ' . $w[1] : $brand . ' ' . $name;
        return $formatted . ' (арт. ' . $art . ')';
    }

    public function transform() {
        // Завантажуємо XML через DOM для кращого контролю
        $dom = new DOMDocument('1.0', 'UTF-8');
        $dom->preserveWhiteSpace = false;
        $dom->formatOutput = true;

        $xmlString = $this->fetchXml();
        if (!$dom->loadXML($xmlString)) {
            throw new Exception('Помилка парсингу XML');
        }

        $xpath = new DOMXPath($dom);

        // Оновлюємо інфо магазину
        $nameNodes = $xpath->query('//shop/name');
        if ($nameNodes->length > 0) {
            $nameNodes->item(0)->nodeValue = $this->config['shop_name'];
        }

        $urlNodes = $xpath->query('//shop/url');
        if ($urlNodes->length > 0) {
            $urlNodes->item(0)->nodeValue = $this->config['shop_url'];
        }

        // Оновлюємо дату
        $root = $dom->documentElement;
        $root->setAttribute('date', date('Y-m-d H:i'));

        // Обробляємо оффери
        $offersToRemove = [];
        $offers = $xpath->query('//offer');

        foreach ($offers as $offer) {
            $id = $offer->getAttribute('id');

            // Отримуємо артикул
            $articleNodes = $xpath->query('article', $offer);
            $art = ($articleNodes->length > 0) ? $articleNodes->item(0)->nodeValue : $id;

            // Перевіряємо виключення по артикулу
            if (in_array($art, $this->config['exclude_articles']) || in_array($id, $this->config['exclude_articles'])) {
                $offersToRemove[] = $offer;
                continue;
            }

            // Перевіряємо наявність фото
            $pictureNodes = $xpath->query('picture', $offer);
            if ($pictureNodes->length == 0 || empty(trim($pictureNodes->item(0)->nodeValue))) {
                $offersToRemove[] = $offer;
                continue;
            }

            // Перевіряємо ціну
            $priceNodes = $xpath->query('price', $offer);
            $price = ($priceNodes->length > 0) ? (float)$priceNodes->item(0)->nodeValue : 0;
            if ($price <= 0) {
                $offersToRemove[] = $offer;
                continue;
            }

            // Виправляємо available при stock=0
            $stockNodes = $xpath->query('stock_quantity', $offer);
            $stock = ($stockNodes->length > 0) ? (int)$stockNodes->item(0)->nodeValue : 0;
            if ($stock <= 0) {
                $offer->setAttribute('available', 'false');
            }

            // Обробляємо vendor (обов'язкове поле!)
            $vendorNodes = $xpath->query('vendor', $offer);
            if ($vendorNodes->length > 0) {
                $oldVendor = $vendorNodes->item(0);
                $vendorValue = trim($oldVendor->nodeValue);
                if (empty($vendorValue)) {
                    // Vendor пустий - замінюємо новим елементом
                    $newVendor = $dom->createElement('vendor', $this->config['brand']);
                    $oldVendor->parentNode->replaceChild($newVendor, $oldVendor);
                } else {
                    // Нормалізуємо значення
                    while ($oldVendor->firstChild) {
                        $oldVendor->removeChild($oldVendor->firstChild);
                    }
                    $oldVendor->appendChild($dom->createTextNode($this->normalizeBrand($vendorValue)));
                }
            } else {
                // Vendor відсутній - додаємо
                $vendor = $dom->createElement('vendor', $this->config['brand']);
                // Знаходимо перший param або appendChild
                $firstParam = $xpath->query('param', $offer)->item(0);
                if ($firstParam) {
                    $offer->insertBefore($vendor, $firstParam);
                } else {
                    $offer->appendChild($vendor);
                }
            }

            // Обробляємо параметри
            $paramsToRemove = [];
            $params = $xpath->query('param', $offer);

            foreach ($params as $param) {
                $pn = $param->getAttribute('name');
                $pv = $param->nodeValue;

                // Видаляємо параметри зі списку або з URL
                if ($this->shouldRemoveParam($pn) || $this->containsUrl($pv)) {
                    $paramsToRemove[] = $param;
                    continue;
                }

                // Обрізаємо занадто довгі параметри
                if (mb_strlen($pv) > $this->config['max_param_length']) {
                    $param->nodeValue = $this->truncateText($pv, $this->config['max_param_length']);
                }

                // Нормалізуємо виробника
                if ($pn === 'Виробник' || $pn === 'Производитель') {
                    $param->nodeValue = $this->config['brand'];
                }
            }

            // Видаляємо помічені параметри
            foreach ($paramsToRemove as $param) {
                $param->parentNode->removeChild($param);
            }

            // Форматуємо назву
            $nameUaNodes = $xpath->query('name_ua', $offer);
            if ($nameUaNodes->length > 0) {
                $nameValue = trim($nameUaNodes->item(0)->nodeValue);
                if (empty($nameValue)) {
                    // Якщо назва пуста - беремо з description або ставимо артикул
                    $descNodes = $xpath->query('description_ua', $offer);
                    if ($descNodes->length > 0 && !empty(trim($descNodes->item(0)->nodeValue))) {
                        $desc = strip_tags(trim($descNodes->item(0)->nodeValue));
                        $nameValue = mb_substr($desc, 0, 50);
                    } else {
                        $nameValue = 'Товар';
                    }
                }
                $nameUaNodes->item(0)->nodeValue = $this->formatName($nameValue, $art);
            }

            $nameNodes = $xpath->query('name', $offer);
            if ($nameNodes->length > 0) {
                $nameValue = trim($nameNodes->item(0)->nodeValue);
                if (empty($nameValue)) {
                    $nameValue = 'Product';
                }
                $nameNodes->item(0)->nodeValue = $this->formatName($nameValue, $art);
            }
        }

        // Видаляємо позначені оффери
        foreach ($offersToRemove as $offer) {
            $offer->parentNode->removeChild($offer);
        }

        return $dom->saveXML();
    }
}

// Виконання
try {
    $proxy = new AlkoRozetkaProxy($CONFIG);
    echo $proxy->transform();

} catch (Exception $e) {
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    echo '<e><message>' . htmlspecialchars($e->getMessage()) . '</message></e>';
}
