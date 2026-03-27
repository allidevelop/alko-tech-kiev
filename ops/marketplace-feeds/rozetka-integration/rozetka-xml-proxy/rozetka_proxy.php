<?php
/**
 * AL-KO XML Proxy для Rozetka
 * Автоматически трансформирует исходный XML прайс-лист под требования Rozetka
 * 
 * Автор: Создано для alko-technics.com.ua
 * Версия: 1.0
 */

// Настройки
$sourceXmlUrl = 'https://apipim.al-ko.ua/storage/xml_files/PriceList.xml';
$brandName = 'AL-KO';
$shopUrl = 'https://alko-technics.com.ua';

// Кеширование (опционально, для снижения нагрузки на источник)
$cacheEnabled = true;
$cacheFile = __DIR__ . '/cache/pricelist_cache.xml';
$cacheTime = 3600; // 1 час в секундах

// Устанавливаем заголовки
header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: no-cache, must-revalidate');

// Функция логирования
function logMessage($message) {
    $logFile = __DIR__ . '/logs/proxy_' . date('Y-m-d') . '.log';
    $logDir = dirname($logFile);
    if (!is_dir($logDir)) {
        mkdir($logDir, 0755, true);
    }
    file_put_contents($logFile, date('Y-m-d H:i:s') . ' - ' . $message . "\n", FILE_APPEND);
}

// Функция получения XML
function fetchXml($url, $cacheEnabled, $cacheFile, $cacheTime) {
    // Проверяем кеш
    if ($cacheEnabled && file_exists($cacheFile)) {
        $cacheAge = time() - filemtime($cacheFile);
        if ($cacheAge < $cacheTime) {
            logMessage("Используем кеш (возраст: {$cacheAge} сек)");
            return file_get_contents($cacheFile);
        }
    }
    
    // Загружаем XML
    $context = stream_context_create([
        'http' => [
            'timeout' => 60,
            'user_agent' => 'AL-KO Rozetka Proxy/1.0'
        ]
    ]);
    
    $xml = @file_get_contents($url, false, $context);
    
    if ($xml === false) {
        logMessage("Ошибка загрузки XML: " . error_get_last()['message']);
        return false;
    }
    
    // Сохраняем в кеш
    if ($cacheEnabled) {
        $cacheDir = dirname($cacheFile);
        if (!is_dir($cacheDir)) {
            mkdir($cacheDir, 0755, true);
        }
        file_put_contents($cacheFile, $xml);
        logMessage("XML загружен и закеширован");
    }
    
    return $xml;
}

// Функция для очистки текста от ссылок
function removeUrls($text) {
    // Удаляем HTTP/HTTPS ссылки
    $text = preg_replace('/https?:\/\/[^\s<>"\']+/i', '', $text);
    // Удаляем www ссылки
    $text = preg_replace('/www\.[^\s<>"\']+/i', '', $text);
    // Удаляем остаточные пустые строки
    $text = preg_replace('/\n\s*\n/', "\n", $text);
    return trim($text);
}

// Функция для нормализации названия бренда
function normalizeBrand($vendor) {
    $vendor = trim($vendor);
    // Приводим к единому формату AL-KO
    if (preg_match('/al[\-\s]?ko/i', $vendor)) {
        return 'AL-KO';
    }
    return $vendor;
}

// Функция для форматирования названия товара
function formatProductName($name, $brand, $categoryName) {
    $name = trim($name);
    
    // Убираем бренд из начала названия если он там есть
    $name = preg_replace('/^(AL-KO|AL KO|ALKO)\s*/i', '', $name);
    
    // Определяем тип товара из названия
    $productTypes = [
        'Газонокосарка' => 'Газонокосарка',
        'Тример' => 'Тример',
        'Мотокоса' => 'Мотокоса',
        'Кущоріз' => 'Кущоріз',
        'Повітродувка' => 'Повітродувка',
        'Аератор' => 'Аератор',
        'Пила' => 'Пила',
        'Снігоприбиральна' => 'Снігоприбирач',
        'Висоторіз' => 'Висоторіз',
        'Культиватор' => 'Культиватор',
        'Мотоблок' => 'Мотоблок',
        'Насос' => 'Насос',
        'Мийка' => 'Мийка',
        'Генератор' => 'Генератор',
        'Подрібнювач' => 'Подрібнювач',
        'Компостер' => 'Компостер',
        'Гриль' => 'Гриль',
        'Обприскувач' => 'Обприскувач',
        'Акумулятор' => 'Акумулятор',
        'Зарядний' => 'Зарядний пристрій',
        'Ніж' => 'Ніж',
        'Котушка' => 'Котушка',
        'Шланг' => 'Шланг',
        'Ланцюг' => 'Ланцюг',
        'Масло' => 'Масло',
    ];
    
    $foundType = '';
    foreach ($productTypes as $search => $type) {
        if (mb_stripos($name, $search) !== false) {
            $foundType = $type;
            break;
        }
    }
    
    // Формируем название: Тип товару + Бренд + Модель
    if ($foundType && mb_stripos($name, $foundType) === 0) {
        // Если название начинается с типа, вставляем бренд после типа
        $restOfName = trim(mb_substr($name, mb_strlen($foundType)));
        // Убираем слова типа "акумуляторна", "бензинова" и т.д. чтобы вставить бренд
        $modifiers = [];
        $words = preg_split('/\s+/', $restOfName);
        $modelPart = [];
        
        foreach ($words as $word) {
            if (preg_match('/^(акумуляторн|бензинов|електричн|ручн|садов|універсальн)/ui', $word)) {
                $modifiers[] = $word;
            } else {
                $modelPart[] = $word;
            }
        }
        
        $newName = $foundType;
        if (!empty($modifiers)) {
            $newName .= ' ' . implode(' ', $modifiers);
        }
        $newName .= ' ' . $brand;
        if (!empty($modelPart)) {
            $newName .= ' ' . implode(' ', $modelPart);
        }
        
        return trim($newName);
    }
    
    // Если тип не найден в начале, просто добавляем бренд после первого слова
    $words = preg_split('/\s+/', $name, 2);
    if (count($words) > 1) {
        return $words[0] . ' ' . $brand . ' ' . $words[1];
    }
    
    return $brand . ' ' . $name;
}

// Функция для создания уникальных названий
function makeNamesUnique(&$offers) {
    $nameCount = [];
    $processedNames = [];
    
    // Первый проход - считаем повторения
    foreach ($offers as $offer) {
        $name = (string)$offer->name_ua;
        if (!isset($nameCount[$name])) {
            $nameCount[$name] = 0;
        }
        $nameCount[$name]++;
    }
    
    // Второй проход - делаем уникальными
    foreach ($offers as $offer) {
        $name = (string)$offer->name_ua;
        $article = (string)$offer->article;
        
        if ($nameCount[$name] > 1) {
            // Если название повторяется, добавляем артикул
            if (!isset($processedNames[$name])) {
                $processedNames[$name] = 0;
            }
            $processedNames[$name]++;
            
            // Добавляем артикул для уникальности
            $offer->name_ua = $name . ' (арт. ' . $article . ')';
        }
    }
}

// Основная функция трансформации
function transformXml($xmlContent, $brandName, $shopUrl) {
    libxml_use_internal_errors(true);
    
    $xml = simplexml_load_string($xmlContent);
    
    if ($xml === false) {
        $errors = libxml_get_errors();
        logMessage("Ошибка парсинга XML: " . print_r($errors, true));
        return false;
    }
    
    // Обновляем информацию о магазине
    if (isset($xml->shop->url)) {
        $xml->shop->url = $shopUrl;
    }
    
    // Собираем категории для справки
    $categories = [];
    if (isset($xml->shop->categories->category)) {
        foreach ($xml->shop->categories->category as $cat) {
            $catId = (string)$cat['id'];
            $categories[$catId] = (string)$cat;
        }
    }
    
    // Список офферов для удаления (без фото или с критическими ошибками)
    $offersToRemove = [];
    
    // Обрабатываем каждый оффер
    if (isset($xml->shop->offers->offer)) {
        foreach ($xml->shop->offers->offer as $index => $offer) {
            $offerId = (string)$offer['id'];
            
            // 1. Проверяем и исправляем available при stock_quantity = 0
            $stockQty = isset($offer->stock_quantity) ? (int)$offer->stock_quantity : 0;
            if ($stockQty <= 0) {
                $offer['available'] = 'false';
            }
            
            // 2. Проверяем наличие фото
            if (!isset($offer->picture) || empty(trim((string)$offer->picture))) {
                $offersToRemove[] = $index;
                logMessage("Товар {$offerId} без фото - будет исключен");
                continue;
            }
            
            // 3. Нормализуем производителя
            if (isset($offer->vendor)) {
                $offer->vendor = normalizeBrand((string)$offer->vendor);
            } else {
                // Добавляем vendor если его нет
                $offer->addChild('vendor', $brandName);
            }
            
            // 4. Убираем ссылки из параметров
            if (isset($offer->param)) {
                foreach ($offer->param as $param) {
                    $paramValue = (string)$param;
                    if (preg_match('/https?:\/\/|www\./i', $paramValue)) {
                        // Удаляем ссылки из значения параметра
                        $cleanValue = removeUrls($paramValue);
                        // Обновляем значение (через DOM для корректной работы)
                        $dom = dom_import_simplexml($param);
                        $dom->nodeValue = htmlspecialchars($cleanValue, ENT_XML1);
                    }
                }
            }
            
            // 5. Нормализуем параметр "Виробник"
            foreach ($offer->param as $param) {
                $paramName = (string)$param['name'];
                if ($paramName === 'Виробник' || $paramName === 'Производитель') {
                    $dom = dom_import_simplexml($param);
                    $dom->nodeValue = $brandName;
                }
            }
            
            // 6. Форматируем название товара
            if (isset($offer->name_ua)) {
                $categoryId = (string)$offer->categoryId;
                $categoryName = isset($categories[$categoryId]) ? $categories[$categoryId] : '';
                $offer->name_ua = formatProductName((string)$offer->name_ua, $brandName, $categoryName);
            }
        }
        
        // Удаляем офферы без фото (в обратном порядке чтобы не сбить индексы)
        foreach (array_reverse($offersToRemove) as $index) {
            unset($xml->shop->offers->offer[$index]);
        }
        
        // 7. Делаем названия уникальными
        makeNamesUnique($xml->shop->offers->offer);
    }
    
    // Обновляем дату генерации
    $xml['date'] = date('Y-m-d H:i');
    
    return $xml->asXML();
}

// Выполняем
try {
    // Загружаем исходный XML
    $xmlContent = fetchXml($sourceXmlUrl, $cacheEnabled, $cacheFile, $cacheTime);
    
    if ($xmlContent === false) {
        throw new Exception('Не удалось загрузить исходный XML');
    }
    
    // Трансформируем
    $transformedXml = transformXml($xmlContent, $brandName, $shopUrl);
    
    if ($transformedXml === false) {
        throw new Exception('Ошибка трансформации XML');
    }
    
    // Форматируем вывод
    $dom = new DOMDocument('1.0', 'UTF-8');
    $dom->preserveWhiteSpace = false;
    $dom->formatOutput = true;
    $dom->loadXML($transformedXml);
    
    echo $dom->saveXML();
    
} catch (Exception $e) {
    logMessage("Критическая ошибка: " . $e->getMessage());
    
    // Возвращаем ошибку в формате XML
    echo '<?xml version="1.0" encoding="UTF-8"?>';
    echo '<error>';
    echo '<message>' . htmlspecialchars($e->getMessage()) . '</message>';
    echo '<time>' . date('Y-m-d H:i:s') . '</time>';
    echo '</error>';
}
