<?php
/**
 * Конфигурация AL-KO XML Proxy для Prom.ua
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

    // Товары для исключения по ID
    'exclude_products' => [
        // '123456', // Пример
    ],

    // Товары для исключения по артикулу
    'exclude_articles' => [
        '123097', // Нет фото
        '127192', // Нет фото
    ],

    // Дополнительные параметры для добавления ко всем товарам
    'additional_params' => [
        'Гарантія' => '2 роки',
        'Країна реєстрації бренду' => 'Німеччина',
    ],

    // Параметры для удаления
    'remove_params' => [
        'Ставка ПДВ',
        'Посилання на life style фото',
        'Посилання на lifestyle фото',
        'Life style фото',
        'Lifestyle фото',
        'Інші специфікації',
    ],
];
