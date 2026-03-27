/**
 * Маппинг категорий для выгрузки товаров на Эпицентр Маркетплейс
 *
 * Структура маппинга:
 * - myCategory: ваша внутренняя категория
 * - epicentrCode: код категории в Эпицентре
 * - epicentrTitle: название категории в Эпицентре
 *
 * Для получения актуальных кодов категорий используйте:
 * - API: GET /v2/pim/categories с filter[hasChild]=false
 * - Swagger: https://api.epicentrm.com.ua/swagger/#/PIM/getCategoriesV2
 */

// Пример маппинга категорий (заполните своими данными)
const CATEGORY_MAPPINGS = {
    // Электроинструменты
    'drills': {
        epicentrCode: '', // Заполнить после получения из API
        epicentrTitle: 'Дрилі',
        attributeSet: '' // Набор атрибутов для этой категории
    },
    'screwdrivers': {
        epicentrCode: '',
        epicentrTitle: 'Шуруповерти',
        attributeSet: ''
    },
    'grinders': {
        epicentrCode: '',
        epicentrTitle: 'Болгарки (КШМ)',
        attributeSet: ''
    },
    'jigsaws': {
        epicentrCode: '',
        epicentrTitle: 'Лобзики',
        attributeSet: ''
    },
    'circular_saws': {
        epicentrCode: '',
        epicentrTitle: 'Циркулярні пили',
        attributeSet: ''
    },
    'rotary_hammers': {
        epicentrCode: '',
        epicentrTitle: 'Перфоратори',
        attributeSet: ''
    },
    'demolition_hammers': {
        epicentrCode: '',
        epicentrTitle: 'Відбійні молотки',
        attributeSet: ''
    },

    // Садовая техника
    'lawn_mowers': {
        epicentrCode: '',
        epicentrTitle: 'Газонокосарки',
        attributeSet: ''
    },
    'trimmers': {
        epicentrCode: '',
        epicentrTitle: 'Тримери',
        attributeSet: ''
    },
    'chainsaws': {
        epicentrCode: '',
        epicentrTitle: 'Пилки ланцюгові',
        attributeSet: ''
    },
    'cultivators': {
        epicentrCode: '',
        epicentrTitle: 'Культиватори',
        attributeSet: ''
    },
    'motoblocks': {
        epicentrCode: '',
        epicentrTitle: 'Мотоблоки',
        attributeSet: ''
    },

    // Сварочное оборудование
    'welding_machines': {
        epicentrCode: '',
        epicentrTitle: 'Зварювальні апарати',
        attributeSet: ''
    },
    'welding_inverters': {
        epicentrCode: '',
        epicentrTitle: 'Зварювальні інвертори',
        attributeSet: ''
    },

    // Компрессоры и пневматика
    'compressors': {
        epicentrCode: '',
        epicentrTitle: 'Компресори',
        attributeSet: ''
    },

    // Генераторы
    'generators': {
        epicentrCode: '',
        epicentrTitle: 'Генератори',
        attributeSet: ''
    },

    // Мойки высокого давления
    'pressure_washers': {
        epicentrCode: '',
        epicentrTitle: 'Мийки високого тиску',
        attributeSet: ''
    },

    // Тепловое оборудование
    'heat_guns': {
        epicentrCode: '',
        epicentrTitle: 'Теплові гармати',
        attributeSet: ''
    },
    'heaters': {
        epicentrCode: '',
        epicentrTitle: 'Обігрівачі',
        attributeSet: ''
    },

    // Измерительные инструменты
    'laser_levels': {
        epicentrCode: '',
        epicentrTitle: 'Лазерні рівні',
        attributeSet: ''
    },
    'distance_meters': {
        epicentrCode: '',
        epicentrTitle: 'Далекоміри',
        attributeSet: ''
    },

    // Расходные материалы
    'drill_bits': {
        epicentrCode: '',
        epicentrTitle: 'Свердла',
        attributeSet: ''
    },
    'cutting_discs': {
        epicentrCode: '',
        epicentrTitle: 'Круги відрізні',
        attributeSet: ''
    },
    'grinding_discs': {
        epicentrCode: '',
        epicentrTitle: 'Круги шліфувальні',
        attributeSet: ''
    }
};

/**
 * Получить код категории Эпицентра по внутренней категории
 * @param {string} myCategory - внутренняя категория
 * @returns {string|null}
 */
function getEpicentrCode(myCategory) {
    const mapping = CATEGORY_MAPPINGS[myCategory];
    return mapping ? mapping.epicentrCode : null;
}

/**
 * Получить маппинг по внутренней категории
 * @param {string} myCategory
 * @returns {Object|null}
 */
function getMapping(myCategory) {
    return CATEGORY_MAPPINGS[myCategory] || null;
}

/**
 * Поиск категории по названию Эпицентра
 * @param {string} searchTerm
 * @returns {Array}
 */
function findByEpicentrTitle(searchTerm) {
    const term = searchTerm.toLowerCase();
    const results = [];

    Object.entries(CATEGORY_MAPPINGS).forEach(([key, value]) => {
        if (value.epicentrTitle.toLowerCase().includes(term)) {
            results.push({ myCategory: key, ...value });
        }
    });

    return results;
}

/**
 * Обновить маппинги из JSON файла с категориями
 * @param {string} categoriesJsonPath - путь к файлу categories.json
 */
function updateMappingsFromJson(categoriesJsonPath) {
    const fs = require('fs');

    if (!fs.existsSync(categoriesJsonPath)) {
        console.error(`Файл не найден: ${categoriesJsonPath}`);
        console.log('Сначала запустите get-categories.js для получения категорий.');
        return;
    }

    const categories = JSON.parse(fs.readFileSync(categoriesJsonPath, 'utf8'));

    console.log('Поиск соответствий...\n');

    // Ищем соответствия по названиям
    Object.keys(CATEGORY_MAPPINGS).forEach(myCategory => {
        const mapping = CATEGORY_MAPPINGS[myCategory];
        const searchTitle = mapping.epicentrTitle.toLowerCase();

        const found = categories.find(cat => {
            const title = (cat.translations?.[0]?.title || cat.title || '').toLowerCase();
            return title === searchTitle || title.includes(searchTitle);
        });

        if (found) {
            const code = found.code || found.id;
            console.log(`✓ ${myCategory}: [${code}] ${found.translations?.[0]?.title || found.title}`);
            // Обновляем код
            CATEGORY_MAPPINGS[myCategory].epicentrCode = String(code);
        } else {
            console.log(`✗ ${myCategory}: "${mapping.epicentrTitle}" - не найдено`);
        }
    });

    // Сохраняем обновленные маппинги
    const outputPath = __dirname + '/category-mappings-updated.json';
    fs.writeFileSync(outputPath, JSON.stringify(CATEGORY_MAPPINGS, null, 2), 'utf8');
    console.log(`\nОбновленные маппинги сохранены: ${outputPath}`);
}

/**
 * Интерактивный поиск категорий
 * @param {string} searchTerm
 * @param {string} categoriesJsonPath
 */
function searchInCategories(searchTerm, categoriesJsonPath) {
    const fs = require('fs');

    if (!fs.existsSync(categoriesJsonPath)) {
        console.error(`Файл не найден: ${categoriesJsonPath}`);
        return [];
    }

    const categories = JSON.parse(fs.readFileSync(categoriesJsonPath, 'utf8'));
    const term = searchTerm.toLowerCase();

    const found = categories.filter(cat => {
        const title = (cat.translations?.[0]?.title || cat.title || '').toLowerCase();
        return title.includes(term);
    });

    return found.map(cat => ({
        code: cat.code || cat.id,
        title: cat.translations?.[0]?.title || cat.title,
        parentCode: cat.parent_code || cat.parentCode
    }));
}

// CLI
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Использование:');
        console.log('  node category-mappings.js update      - обновить маппинги из categories.json');
        console.log('  node category-mappings.js search <term> - поиск категории');
        console.log('  node category-mappings.js list        - показать текущие маппинги');
        return;
    }

    const command = args[0];

    switch (command) {
        case 'update':
            updateMappingsFromJson(__dirname + '/categories.json');
            break;

        case 'search':
            if (!args[1]) {
                console.log('Укажите поисковый запрос');
                return;
            }
            const results = searchInCategories(args[1], __dirname + '/categories.json');
            if (results.length === 0) {
                console.log('Ничего не найдено');
            } else {
                console.log(`Найдено ${results.length} категорий:\n`);
                results.forEach(r => {
                    console.log(`[${r.code}] ${r.title}`);
                });
            }
            break;

        case 'list':
            console.log('Текущие маппинги:\n');
            Object.entries(CATEGORY_MAPPINGS).forEach(([key, value]) => {
                const status = value.epicentrCode ? `[${value.epicentrCode}]` : '[---]';
                console.log(`${key}: ${status} ${value.epicentrTitle}`);
            });
            break;

        default:
            console.log(`Неизвестная команда: ${command}`);
    }
}

module.exports = {
    CATEGORY_MAPPINGS,
    getEpicentrCode,
    getMapping,
    findByEpicentrTitle,
    updateMappingsFromJson,
    searchInCategories
};

if (require.main === module) {
    main();
}
