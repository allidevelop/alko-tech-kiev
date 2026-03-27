<?php
/**
 * AL-KO XML Proxy для Rozetka - Расширенная версия
 * Автоматически трансформирует исходный XML прайс-лист под требования Rozetka
 * 
 * Версия: 2.0
 * 
 * Исправляемые проблемы:
 * 1. Товары available=true при stock_quantity=0
 * 2. Товары без фото - исключаются
 * 3. Ссылки в параметрах - удаляются
 * 4. Производитель - нормализуется к AL-KO
 * 5. Название товара - добавляется бренд после типа
 * 6. Дублирующиеся названия - делаются уникальными
 * 7. Добавляются недостающие параметры
 */

error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Загружаем конфигурацию
$config = require __DIR__ . '/config.php';

// Устанавливаем заголовки
header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');
header('X-Generator: AL-KO Rozetka Proxy v2.0');

class RozetkaXmlProxy {
    private $config;
    private $stats = [
        'total_products' => 0,
        'excluded_no_photo' => 0,
        'excluded_manual' => 0,
        'fixed_availability' => 0,
        'fixed_names' => 0,
        'removed_urls' => 0,
        'duplicates_fixed' => 0,
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
                'user_agent' => 'AL-KO Rozetka Proxy/2.0',
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
     * Удаление URL из текста
     */
    private function removeUrls($text) {
        $original = $text;
        $text = preg_replace('/https?:\/\/[^\s<>"\']+/i', '', $text);
        $text = preg_replace('/www\.[^\s<>"\']+/i', '', $text);
        $text = preg_replace('/\n\s*\n/', "\n", $text);
        $text = trim($text);
        
        if ($original !== $text) {
            $this->stats['removed_urls']++;
        }
        
        return $text;
    }
    
    /**
     * Нормализация бренда
     */
    private function normalizeBrand($vendor) {
        $vendor = trim($vendor);
        if (preg_match('/al[\-\s]?ko/i', $vendor)) {
            return $this->config['brand_name'];
        }
        return $vendor;
    }
    
    /**
     * Форматирование названия товара
     */
    private function formatProductName($name, $article) {
        $brand = $this->config['brand_name'];
        $originalName = $name;
        $name = trim($name);
        
        // Убираем существующий бренд если есть
        $name = preg_replace('/\b(AL-KO|AL KO|ALKO)\b\s*/i', '', $name);
        $name = trim($name);
        
        // Типы товаров и их порядок в названии
        $productTypes = [
            'Газонокосарка', 'Тример', 'Мотокоса', 'Кущоріз', 'Повітродувка',
            'Аератор', 'Скарифікатор', 'Пила', 'Снігоприбирач', 'Висоторіз',
            'Культиватор', 'Мотоблок', 'Насос', 'Мийка', 'Генератор',
            'Подрібнювач', 'Компостер', 'Гриль', 'Обприскувач', 'Акумулятор',
            'Зарядний пристрій', 'Ніж', 'Котушка', 'Шланг', 'Ланцюг', 
            'Масло', 'Ліхтар', 'Канистра',
        ];
        
        $foundType = '';
        $typePosition = PHP_INT_MAX;
        
        foreach ($productTypes as $type) {
            $pos = mb_stripos($name, $type);
            if ($pos !== false && $pos < $typePosition) {
                $foundType = $type;
                $typePosition = $pos;
            }
        }
        
        if ($foundType) {
            // Находим тип в названии
            $pattern = '/^(.*)(' . preg_quote($foundType, '/') . ')\s*(.*)/ui';
            if (preg_match($pattern, $name, $matches)) {
                $prefix = trim($matches[1]);
                $type = $matches[2];
                $suffix = trim($matches[3]);
                
                // Собираем новое название: Тип + Бренд + остальное
                $newName = $type . ' ' . $brand;
                
                if (!empty($prefix)) {
                    $newName .= ' ' . $prefix;
                }
                if (!empty($suffix)) {
                    $newName .= ' ' . $suffix;
                }
                
                $newName = preg_replace('/\s+/', ' ', $newName);
                
                if ($newName !== $originalName) {
                    $this->stats['fixed_names']++;
                }
                
                return trim($newName);
            }
        }
        
        // Если тип не найден - просто добавляем бренд в начало
        $newName = $brand . ' ' . $name;
        if ($newName !== $originalName) {
            $this->stats['fixed_names']++;
        }
        return $newName;
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
     * Обработка офферов
     */
    private function processOffers($xml) {
        if (!isset($xml->shop->offers->offer)) {
            return;
        }
        
        // Собираем категории
        $categories = [];
        if (isset($xml->shop->categories->category)) {
            foreach ($xml->shop->categories->category as $cat) {
                $categories[(string)$cat['id']] = (string)$cat;
            }
        }
        
        // Список для удаления
        $toRemove = [];
        
        // Счетчик названий для уникальности
        $nameCount = [];
        $nameArticles = [];
        
        // Первый проход - обработка и подсчет названий
        foreach ($xml->shop->offers->offer as $index => $offer) {
            $offerId = (string)$offer['id'];
            $article = isset($offer->article) ? (string)$offer->article : $offerId;
            
            $this->stats['total_products']++;
            
            // Проверяем на исключение
            if ($this->shouldExcludeProduct($offerId, $article)) {
                $toRemove[] = $index;
                $this->stats['excluded_manual']++;
                $this->log("Товар {$offerId} исключен вручную");
                continue;
            }
            
            // Проверяем фото
            if (!isset($offer->picture) || empty(trim((string)$offer->picture))) {
                $toRemove[] = $index;
                $this->stats['excluded_no_photo']++;
                $this->log("Товар {$offerId} без фото - исключен");
                continue;
            }
            
            // Исправляем available при stock_quantity = 0
            $stockQty = isset($offer->stock_quantity) ? (int)$offer->stock_quantity : 0;
            if ($stockQty <= 0 && (string)$offer['available'] === 'true') {
                $offer['available'] = 'false';
                $this->stats['fixed_availability']++;
            }
            
            // Нормализуем производителя
            if (isset($offer->vendor)) {
                $offer->vendor = $this->normalizeBrand((string)$offer->vendor);
            } else {
                $offer->addChild('vendor', $this->config['brand_name']);
            }
            
            // Обрабатываем параметры
            $paramsToRemove = [];
            foreach ($offer->param as $paramIndex => $param) {
                $paramName = (string)$param['name'];
                $paramValue = (string)$param;
                
                // Удаляем URL из параметров
                if (preg_match('/https?:\/\/|www\./i', $paramValue)) {
                    $cleanValue = $this->removeUrls($paramValue);
                    $dom = dom_import_simplexml($param);
                    while ($dom->firstChild) {
                        $dom->removeChild($dom->firstChild);
                    }
                    $dom->appendChild($dom->ownerDocument->createTextNode($cleanValue));
                }
                
                // Нормализуем параметр Виробник
                if ($paramName === 'Виробник' || $paramName === 'Производитель') {
                    $dom = dom_import_simplexml($param);
                    while ($dom->firstChild) {
                        $dom->removeChild($dom->firstChild);
                    }
                    $dom->appendChild($dom->ownerDocument->createTextNode($this->config['brand_name']));
                }
                
                // Помечаем параметры для удаления
                if (in_array($paramName, $this->config['remove_params'] ?? [])) {
                    $paramsToRemove[] = $paramIndex;
                }
            }
            
            // Форматируем название
            if (isset($offer->name_ua)) {
                $newName = $this->formatProductName((string)$offer->name_ua, $article);
                $offer->name_ua = $newName;
                
                // Считаем для уникальности
                if (!isset($nameCount[$newName])) {
                    $nameCount[$newName] = 0;
                    $nameArticles[$newName] = [];
                }
                $nameCount[$newName]++;
                $nameArticles[$newName][] = ['index' => $index, 'article' => $article];
            }
        }
        
        // Второй проход - делаем названия уникальными
        foreach ($nameCount as $name => $count) {
            if ($count > 1) {
                foreach ($nameArticles[$name] as $item) {
                    if (in_array($item['index'], $toRemove)) continue;
                    
                    $offer = $xml->shop->offers->offer[$item['index']];
                    $offer->name_ua = $name . ' (арт. ' . $item['article'] . ')';
                    $this->stats['duplicates_fixed']++;
                }
            }
        }
        
        // Удаляем помеченные офферы (в обратном порядке)
        rsort($toRemove);
        foreach ($toRemove as $index) {
            unset($xml->shop->offers->offer[$index]);
        }
    }
    
    /**
     * Основная трансформация
     */
    public function transform() {
        $xmlContent = $this->fetchXml();
        
        libxml_use_internal_errors(true);
        $xml = simplexml_load_string($xmlContent);
        
        if ($xml === false) {
            $errors = libxml_get_errors();
            $errorMsg = '';
            foreach ($errors as $error) {
                $errorMsg .= trim($error->message) . '; ';
            }
            $this->log("Ошибка парсинга: " . $errorMsg, 'ERROR');
            throw new Exception('Ошибка парсинга XML: ' . $errorMsg);
        }
        
        // Обновляем информацию о магазине
        if (isset($xml->shop->url)) {
            $xml->shop->url = $this->config['shop']['url'];
        }
        if (isset($xml->shop->name)) {
            $xml->shop->name = $this->config['shop']['name'];
        }
        if (isset($xml->shop->company)) {
            $xml->shop->company = $this->config['shop']['company'];
        }
        
        // Обрабатываем офферы
        $this->processOffers($xml);
        
        // Обновляем дату
        $xml['date'] = date('Y-m-d H:i');
        
        // Логируем статистику
        $this->log("Статистика: " . json_encode($this->stats, JSON_UNESCAPED_UNICODE));
        
        return $xml->asXML();
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
    $proxy = new RozetkaXmlProxy($config);
    $result = $proxy->transform();
    
    // Форматируем XML для читаемости
    $dom = new DOMDocument('1.0', 'UTF-8');
    $dom->preserveWhiteSpace = false;
    $dom->formatOutput = true;
    
    if ($dom->loadXML($result)) {
        echo $dom->saveXML();
    } else {
        echo $result;
    }
    
} catch (Exception $e) {
    // Возвращаем ошибку
    header('HTTP/1.1 500 Internal Server Error');
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    echo '<error>' . "\n";
    echo '  <message>' . htmlspecialchars($e->getMessage()) . '</message>' . "\n";
    echo '  <time>' . date('Y-m-d H:i:s') . '</time>' . "\n";
    echo '</error>';
    
    // Логируем
    error_log("AL-KO Rozetka Proxy Error: " . $e->getMessage());
}
