<?php
/**
 * AL-KO XML Proxy для Rozetka - Standalone версія (один файл)
 * 
 * Інструкція:
 * 1. Завантажте цей файл на хостинг (наприклад, в /rozetka/ або /feed/)
 * 2. Налаштуйте змінні нижче
 * 3. Надайте посилання на цей файл менеджеру Rozetka
 * 
 * Версія: 2.0 Standalone
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
    
    // Параметри для видалення
    'remove_params' => [
        'Ставка ПДВ',
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
            'http' => ['timeout' => 120, 'user_agent' => 'AL-KO Rozetka Proxy/2.0'],
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
    
    private function removeUrls($t) {
        $t = preg_replace('/https?:\/\/[^\s<>"\']+/i', '', $t);
        $t = preg_replace('/www\.[^\s<>"\']+/i', '', $t);
        return trim(preg_replace('/\n\s*\n/', "\n", $t));
    }
    
    private function formatName($name, $art) {
        $brand = $this->config['brand'];
        $name = preg_replace('/\b(AL-KO|AL KO|ALKO)\b\s*/i', '', trim($name));
        
        $types = ['Газонокосарка','Тример','Мотокоса','Кущоріз','Повітродувка','Аератор',
                  'Скарифікатор','Пила','Снігоприбирач','Висоторіз','Культиватор','Мотоблок',
                  'Насос','Мийка','Генератор','Подрібнювач','Компостер','Гриль','Обприскувач',
                  'Акумулятор','Зарядний','Ніж','Котушка','Шланг','Ланцюг','Масло'];
        
        foreach ($types as $type) {
            if (mb_stripos($name, $type) === 0) {
                $rest = trim(mb_substr($name, mb_strlen($type)));
                return $type . ' ' . $brand . ($rest ? ' ' . $rest : '');
            }
        }
        
        $w = preg_split('/\s+/', $name, 2);
        return count($w) > 1 ? $w[0] . ' ' . $brand . ' ' . $w[1] : $brand . ' ' . $name;
    }
    
    public function transform() {
        $xml = simplexml_load_string($this->fetchXml());
        if (!$xml) throw new Exception('Помилка парсингу XML');
        
        // Оновлюємо інфо магазину
        if (isset($xml->shop->url)) $xml->shop->url = $this->config['shop_url'];
        if (isset($xml->shop->name)) $xml->shop->name = $this->config['shop_name'];
        
        $toRemove = [];
        $names = [];
        
        foreach ($xml->shop->offers->offer as $i => $offer) {
            $id = (string)$offer['id'];
            $art = isset($offer->article) ? (string)$offer->article : $id;
            
            // Виключаємо по артикулу
            if (in_array($art, $this->config['exclude_articles'])) {
                $toRemove[] = $i;
                continue;
            }
            
            // Виключаємо без фото
            if (!isset($offer->picture) || empty(trim((string)$offer->picture))) {
                $toRemove[] = $i;
                continue;
            }
            
            // Виправляємо available при stock=0
            $stock = isset($offer->stock_quantity) ? (int)$offer->stock_quantity : 0;
            if ($stock <= 0) $offer['available'] = 'false';
            
            // Нормалізуємо виробника
            if (isset($offer->vendor)) {
                $offer->vendor = $this->normalizeBrand((string)$offer->vendor);
            } else {
                $offer->addChild('vendor', $this->config['brand']);
            }
            
            // Обробляємо параметри
            foreach ($offer->param as $param) {
                $pn = (string)$param['name'];
                $pv = (string)$param;
                
                // Видаляємо URL
                if (preg_match('/https?:\/\/|www\./i', $pv)) {
                    $dom = dom_import_simplexml($param);
                    while ($dom->firstChild) $dom->removeChild($dom->firstChild);
                    $dom->appendChild($dom->ownerDocument->createTextNode($this->removeUrls($pv)));
                }
                
                // Нормалізуємо виробника в параметрах
                if ($pn === 'Виробник' || $pn === 'Производитель') {
                    $dom = dom_import_simplexml($param);
                    while ($dom->firstChild) $dom->removeChild($dom->firstChild);
                    $dom->appendChild($dom->ownerDocument->createTextNode($this->config['brand']));
                }
            }
            
            // Форматуємо назву
            if (isset($offer->name_ua)) {
                $newName = $this->formatName((string)$offer->name_ua, $art);
                $offer->name_ua = $newName;
                
                if (!isset($names[$newName])) $names[$newName] = [];
                $names[$newName][] = ['i' => $i, 'art' => $art];
            }
        }
        
        // Робимо назви унікальними
        foreach ($names as $name => $items) {
            if (count($items) > 1) {
                foreach ($items as $item) {
                    if (in_array($item['i'], $toRemove)) continue;
                    $xml->shop->offers->offer[$item['i']]->name_ua = $name . ' (арт. ' . $item['art'] . ')';
                }
            }
        }
        
        // Видаляємо позначені
        rsort($toRemove);
        foreach ($toRemove as $i) unset($xml->shop->offers->offer[$i]);
        
        // Оновлюємо дату
        $xml['date'] = date('Y-m-d H:i');
        
        return $xml->asXML();
    }
}

// Виконання
try {
    $proxy = new AlkoRozetkaProxy($CONFIG);
    $result = $proxy->transform();
    
    $dom = new DOMDocument('1.0', 'UTF-8');
    $dom->preserveWhiteSpace = false;
    $dom->formatOutput = true;
    $dom->loadXML($result);
    echo $dom->saveXML();
    
} catch (Exception $e) {
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    echo '<e><message>' . htmlspecialchars($e->getMessage()) . '</message></e>';
}
