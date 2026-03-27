<?php
/**
 * Конфигурация AL-KO XML Proxy для Rozetka
 */

return [
    // Исходный XML прайс-лист
    'source_xml_url' => 'https://apipim.al-ko.ua/storage/xml_files/PriceList.xml',
    
    // Информация о магазине
    'shop' => [
        'name' => 'AL-KO Technics Ukraine',
        'company' => 'alko-technics.com.ua',
        'url' => 'https://alko-technics.com.ua',
    ],
    
    // Бренд (для нормализации)
    'brand_name' => 'AL-KO',
    
    // Кеширование
    'cache' => [
        'enabled' => true,
        'file' => __DIR__ . '/cache/pricelist_cache.xml',
        'time' => 3600, // 1 час
    ],
    
    // Логирование
    'logging' => [
        'enabled' => true,
        'dir' => __DIR__ . '/logs/',
    ],
    
    // Товары для исключения (ID)
    'exclude_products' => [
        // '123456', // Пример: товар без фото
    ],
    
    // Товары для исключения по артикулу
    'exclude_articles' => [
        '123097', // Нет фото
        '127192', // Нет фото
    ],
    
    // Правила замены названий категорий для Rozetka
    'category_mapping' => [
        // 'Исходная категория' => 'Категория для Rozetka',
    ],
    
    // Дополнительные параметры для добавления
    'additional_params' => [
        // Параметры которые нужно добавить ко всем товарам
        'Гарантія' => '2 роки',
        'Країна реєстрації бренду' => 'Німеччина',
    ],
    
    // Параметры для удаления (если они есть)
    'remove_params' => [
        'Ставка ПДВ',
        // 'Другой параметр',
    ],
];
