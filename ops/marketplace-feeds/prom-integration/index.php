<?php
/**
 * AL-KO XML Proxy для Prom.ua
 * Автоматически трансформирует исходный XML прайс-лист под требования Prom.ua
 *
 * Версия: 1.0
 *
 * Исправляемые проблемы:
 * 1. available=true при stock_quantity=0 → available=false
 * 2. Добавление quantity_in_stock для отображения остатков
 * 3. Добавление presence_sure="true" для товаров в наличии
 * 4. Переименование name_ua → name
 * 5. Переименование description_ua → description
 * 6. Добавление vendorCode из article
 * 7. Исключение товаров без фото
 */

error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Загружаем конфигурацию
$config = require __DIR__ . '/config.php';

// Устанавливаем заголовки
header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');
header('X-Generator: AL-KO Prom.ua Proxy v1.0');

class PromXmlProxy {
    private $config;
    private $stats = [
        'total_products' => 0,
        'excluded_no_photo' => 0,
        'excluded_manual' => 0,
        'fixed_availability' => 0,
        'in_stock' => 0,
        'out_of_stock' => 0,
    ];

    public function __construct($config) {
        $this->config = $config;
    }

    /**
     * Логирование
     */
    private function log($message, $level = 'INFO') {
        if (!$this->config['logging']['enabled']) return;

        $logDir = $this->config['logging']['dir'];
        if (!is_dir($logDir)) {
            mkdir($logDir, 0755, true);
        }

        $logFile = $logDir . 'proxy_' . date('Y-m-d') . '.log';
        $logLine = date('Y-m-d H:i:s') . " [{$level}] {$message}\n";
        file_put_contents($logFile, $logLine, FILE_APPEND | LOCK_EX);
    }

    /**
     * Получение XML с кешированием
     */
    private function fetchXml() {
        $cacheConfig = $this->config['cache'];

        // Проверяем кеш
        if ($cacheConfig['enabled'] && file_exists($cacheConfig['file'])) {
            $cacheAge = time() - filemtime($cacheConfig['file']);
            if ($cacheAge < $cacheConfig['time']) {
                $this->log("Используем кеш (возраст: {$cacheAge} сек)");
                return file_get_contents($cacheConfig['file']);
            }
        }

        // Загружаем XML
        $this->log("Загружаем XML с источника: " . $this->config['source_xml_url']);

        $context = stream_context_create([
            'http' => [
                'timeout' => 120,
                'user_agent' => 'AL-KO Prom.ua Proxy/1.0',
                'ignore_errors' => true,
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
            ],
        ]);

        $xml = @file_get_contents($this->config['source_xml_url'], false, $context);

        if ($xml === false) {
            $error = error_get_last();
            $this->log("Ошибка загрузки: " . ($error['message'] ?? 'Unknown'), 'ERROR');
            throw new Exception('Не удалось загрузить XML: ' . ($error['message'] ?? 'Unknown error'));
        }

        // Сохраняем в кеш
        if ($cacheConfig['enabled']) {
            $cacheDir = dirname($cacheConfig['file']);
            if (!is_dir($cacheDir)) {
                mkdir($cacheDir, 0755, true);
            }
            file_put_contents($cacheConfig['file'], $xml, LOCK_EX);
            $this->log("XML сохранен в кеш");
        }

        return $xml;
    }

    /**
     * Нормализация бренда
     */
    private function normalizeBrand($vendor) {
        $vendor = trim($vendor);

        // AL-KO и варианты
        if (preg_match('/al[\-\s]?ko/i', $vendor)) {
            return $this->config['brand_name'];
        }

        // Известные бренды Prom.ua (оставляем как есть)
        $knownBrands = [
            'OREGON', 'Oregon',
            'Honda', 'HONDA',
            'Briggs&Stratton', 'Briggs & Stratton', 'B&S',
            'Mowox', 'MOWOX',
            'MASPORT', 'Masport',
            'SOLO', 'Solo', 'solo by AL-KO',
        ];

        foreach ($knownBrands as $brand) {
            if (strcasecmp($vendor, $brand) === 0 || stripos($vendor, $brand) !== false) {
                return $brand;
            }
        }

        // Неизвестные бренды → AL-KO (для совместимости с Prom.ua)
        return $this->config['brand_name'];
    }

    /**
     * Создаёт элемент с текстом, безопасно обрабатывая спецсимволы
     */
    private function createTextElement($doc, $tagName, $text) {
        $el = $doc->createElement($tagName);
        $el->appendChild($doc->createTextNode($text));
        return $el;
    }

    /**
     * Проверка, нужно ли исключить товар
     */
    private function shouldExcludeProduct($offerId, $article) {
        // Проверяем ID
        if (in_array($offerId, $this->config['exclude_products'] ?? [])) {
            return true;
        }

        // Проверяем артикул
        if (in_array($article, $this->config['exclude_articles'] ?? [])) {
            return true;
        }

        return false;
    }

    /**
     * Основная трансформация
     */
    public function transform() {
        $xmlContent = $this->fetchXml();

        libxml_use_internal_errors(true);
        $sourceXml = simplexml_load_string($xmlContent);

        if ($sourceXml === false) {
            $errors = libxml_get_errors();
            $errorMsg = '';
            foreach ($errors as $error) {
                $errorMsg .= trim($error->message) . '; ';
            }
            $this->log("Ошибка парсинга: " . $errorMsg, 'ERROR');
            throw new Exception('Ошибка парсинга XML: ' . $errorMsg);
        }

        // Создаём новый XML для Prom.ua
        $output = new DOMDocument('1.0', 'UTF-8');
        $output->formatOutput = true;

        // Корневой элемент
        $catalog = $output->createElement('yml_catalog');
        $catalog->setAttribute('date', date('Y-m-d H:i'));
        $output->appendChild($catalog);

        // Shop
        $shop = $output->createElement('shop');
        $catalog->appendChild($shop);

        // Информация о магазине
        $shop->appendChild($output->createElement('name', $this->config['shop']['name']));
        $shop->appendChild($output->createElement('company', $this->config['shop']['company']));
        $shop->appendChild($output->createElement('url', $this->config['shop']['url']));

        // Валюты
        $currencies = $output->createElement('currencies');
        $currency = $output->createElement('currency');
        $currency->setAttribute('id', 'UAH');
        $currency->setAttribute('rate', '1');
        $currencies->appendChild($currency);
        $shop->appendChild($currencies);

        // Копируем категории
        if (isset($sourceXml->shop->categories)) {
            $categoriesNode = $output->importNode(dom_import_simplexml($sourceXml->shop->categories), true);
            $shop->appendChild($categoriesNode);
        }

        // Обрабатываем офферы
        $offers = $output->createElement('offers');
        $shop->appendChild($offers);

        if (isset($sourceXml->shop->offers->offer)) {
            foreach ($sourceXml->shop->offers->offer as $sourceOffer) {
                $offerId = (string)$sourceOffer['id'];
                $article = isset($sourceOffer->article) ? (string)$sourceOffer->article : $offerId;

                $this->stats['total_products']++;

                // Проверяем на исключение
                if ($this->shouldExcludeProduct($offerId, $article)) {
                    $this->stats['excluded_manual']++;
                    $this->log("Товар {$offerId} исключен вручную");
                    continue;
                }

                // Проверяем фото
                if (!isset($sourceOffer->picture) || empty(trim((string)$sourceOffer->picture))) {
                    $this->stats['excluded_no_photo']++;
                    $this->log("Товар {$offerId} без фото - исключен");
                    continue;
                }

                // Определяем наличие
                $stockQty = isset($sourceOffer->stock_quantity) ? (int)$sourceOffer->stock_quantity : 0;
                $isAvailable = $stockQty > 0;

                if (!$isAvailable && (string)$sourceOffer['available'] === 'true') {
                    $this->stats['fixed_availability']++;
                }

                if ($isAvailable) {
                    $this->stats['in_stock']++;
                } else {
                    $this->stats['out_of_stock']++;
                }

                // Создаём offer
                $offer = $output->createElement('offer');
                $offer->setAttribute('id', $offerId);
                $offer->setAttribute('available', $isAvailable ? 'true' : 'false');

                // Добавляем presence_sure для товаров в наличии
                if ($isAvailable) {
                    $offer->setAttribute('presence_sure', 'true');
                }

                // Цена
                if (isset($sourceOffer->price)) {
                    $offer->appendChild($output->createElement('price', (string)$sourceOffer->price));
                }

                // Валюта
                $offer->appendChild($output->createElement('currencyId', 'UAH'));

                // Категория
                if (isset($sourceOffer->categoryId)) {
                    $offer->appendChild($output->createElement('categoryId', (string)$sourceOffer->categoryId));
                }

                // Картинки (все)
                foreach ($sourceOffer->picture as $picture) {
                    $picUrl = trim((string)$picture);
                    if (!empty($picUrl)) {
                        $offer->appendChild($output->createElement('picture', $picUrl));
                    }
                }

                // URL товара
                if (isset($sourceOffer->url)) {
                    $offer->appendChild($output->createElement('url', (string)$sourceOffer->url));
                }

                // Название (name_ua → name)
                $name = '';
                if (isset($sourceOffer->name_ua)) {
                    $name = (string)$sourceOffer->name_ua;
                } elseif (isset($sourceOffer->name)) {
                    $name = (string)$sourceOffer->name;
                }
                if (!empty($name)) {
                    $offer->appendChild($output->createElement('name', $name));
                }

                // Артикул → vendorCode
                $offer->appendChild($output->createElement('vendorCode', $article));

                // Производитель (нормализуем)
                $vendor = $this->config['brand_name'];
                if (isset($sourceOffer->vendor)) {
                    $vendor = $this->normalizeBrand((string)$sourceOffer->vendor);
                }
                $offer->appendChild($output->createElement('vendor', $vendor));

                // Количество на складе
                $offer->appendChild($output->createElement('quantity_in_stock', (string)$stockQty));

                // Описание (description_ua → description)
                $description = '';
                if (isset($sourceOffer->description_ua)) {
                    $description = (string)$sourceOffer->description_ua;
                } elseif (isset($sourceOffer->description)) {
                    $description = (string)$sourceOffer->description;
                }
                if (!empty($description)) {
                    // Удаляем вложенные CDATA если есть (источник уже имеет CDATA)
                    $description = preg_replace('/^\s*<!\[CDATA\[(.*)\]\]>\s*$/s', '$1', $description);
                    $descElement = $output->createElement('description');
                    $descElement->appendChild($output->createCDATASection($description));
                    $offer->appendChild($descElement);
                }

                // Параметры
                $addedParams = [];
                foreach ($sourceOffer->param as $param) {
                    $paramName = (string)$param['name'];
                    $paramValue = (string)$param;

                    // Пропускаем параметры из списка удаления
                    if (in_array($paramName, $this->config['remove_params'] ?? [])) {
                        continue;
                    }

                    // Нормализуем производителя в параметрах
                    if ($paramName === 'Виробник' || $paramName === 'Производитель') {
                        $paramValue = $this->config['brand_name'];
                    }

                    $paramElement = $output->createElement('param', htmlspecialchars($paramValue));
                    $paramElement->setAttribute('name', $paramName);
                    $offer->appendChild($paramElement);
                    $addedParams[$paramName] = true;
                }

                // Добавляем дополнительные параметры
                foreach ($this->config['additional_params'] ?? [] as $paramName => $paramValue) {
                    if (!isset($addedParams[$paramName])) {
                        $paramElement = $output->createElement('param', htmlspecialchars($paramValue));
                        $paramElement->setAttribute('name', $paramName);
                        $offer->appendChild($paramElement);
                    }
                }

                $offers->appendChild($offer);
            }
        }

        // Логируем статистику
        $this->log("Статистика: " . json_encode($this->stats, JSON_UNESCAPED_UNICODE));

        return $output->saveXML();
    }

    /**
     * Получение статистики
     */
    public function getStats() {
        return $this->stats;
    }
}

// Выполнение
try {
    $proxy = new PromXmlProxy($config);
    echo $proxy->transform();

} catch (Exception $e) {
    // Возвращаем ошибку
    header('HTTP/1.1 500 Internal Server Error');
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    echo '<error>' . "\n";
    echo '  <message>' . htmlspecialchars($e->getMessage()) . '</message>' . "\n";
    echo '  <time>' . date('Y-m-d H:i:s') . '</time>' . "\n";
    echo '</error>';

    // Логируем
    error_log("AL-KO Prom.ua Proxy Error: " . $e->getMessage());
}
