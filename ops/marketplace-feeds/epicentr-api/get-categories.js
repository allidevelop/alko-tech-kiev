/**
 * Скрипт для получения категорий Эпицентр Маркетплейс через API
 *
 * API Documentation: https://api.epicentrm.com.ua/swagger/
 * Endpoint V2: GET /v2/pim/categories
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Загрузка .env файла
function loadEnv() {
    const envPaths = [
        path.join(__dirname, '.env'),
        path.join(__dirname, '..', '.env')
    ];

    for (const envPath of envPaths) {
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            content.split('\n').forEach(line => {
                const match = line.match(/^([^#=]+)=(.*)$/);
                if (match && !process.env[match[1].trim()]) {
                    process.env[match[1].trim()] = match[2].trim();
                }
            });
        }
    }
}

loadEnv();

// Конфигурация
const API_BASE_URL = 'api.epicentrm.com.ua';

// ВАЖНО: Замените на ваш реальный Bearer токен
// Токен можно получить в личном кабинете продавца Эпицентр
const BEARER_TOKEN = process.env.EPICENTR_API_TOKEN || 'YOUR_BEARER_TOKEN_HERE';

/**
 * Получить список категорий с API Эпицентра
 * @param {number} page - номер страницы
 * @param {boolean|null} hasChild - фильтр: true = только родительские, false = только конечные
 * @returns {Promise<Object>}
 */
async function getCategories(page = 1, hasChild = null) {
    return new Promise((resolve, reject) => {
        let path = `/v2/pim/categories?page=${page}`;

        // Добавляем фильтр hasChild если указан
        if (hasChild !== null) {
            path += `&filter[hasChild]=${hasChild}`;
        }

        const options = {
            hostname: API_BASE_URL,
            path: path,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${BEARER_TOKEN}`
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({
                        status: res.statusCode,
                        data: jsonData
                    });
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${e.message}`));
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.end();
    });
}

/**
 * Получить все категории (все страницы)
 * @param {boolean|null} hasChild - фильтр
 * @returns {Promise<Array>}
 */
async function getAllCategories(hasChild = null) {
    const allCategories = [];
    let page = 1;
    let hasMore = true;

    console.log('Загрузка категорий с API Эпицентра...\n');

    while (hasMore) {
        try {
            const result = await getCategories(page, hasChild);

            if (result.status === 403) {
                console.error('Ошибка авторизации (403). Проверьте Bearer токен.');
                break;
            }

            if (result.status !== 200) {
                console.error(`Ошибка API: статус ${result.status}`);
                break;
            }

            const categories = result.data.data || result.data;

            if (!categories || categories.length === 0) {
                hasMore = false;
            } else {
                allCategories.push(...categories);
                console.log(`Страница ${page}: загружено ${categories.length} категорий`);
                page++;

                // Проверяем пагинацию
                if (result.data.meta && result.data.meta.last_page) {
                    hasMore = page <= result.data.meta.last_page;
                } else if (categories.length < 100) {
                    // Предполагаем размер страницы 100
                    hasMore = false;
                }
            }
        } catch (error) {
            console.error(`Ошибка на странице ${page}:`, error.message);
            hasMore = false;
        }
    }

    return allCategories;
}

/**
 * Форматировать категории для маппинга
 * @param {Array} categories
 * @returns {Object}
 */
function formatCategoriesForMapping(categories) {
    const mapping = {};

    categories.forEach(cat => {
        const code = cat.code || cat.id;
        const title = cat.translations?.[0]?.title || cat.title || cat.name || 'Unknown';
        const parentCode = cat.parent_code || cat.parentCode || null;

        mapping[code] = {
            title: title,
            parentCode: parentCode,
            hasChild: cat.hasChild || cat.has_child || false
        };
    });

    return mapping;
}

/**
 * Построить дерево категорий
 * @param {Array} categories
 * @returns {Array}
 */
function buildCategoryTree(categories) {
    const tree = [];
    const categoryMap = new Map();

    // Создаем карту категорий
    categories.forEach(cat => {
        const code = cat.code || cat.id;
        categoryMap.set(code, {
            ...cat,
            children: []
        });
    });

    // Строим дерево
    categoryMap.forEach((cat, code) => {
        const parentCode = cat.parent_code || cat.parentCode;
        if (parentCode && categoryMap.has(parentCode)) {
            categoryMap.get(parentCode).children.push(cat);
        } else {
            tree.push(cat);
        }
    });

    return tree;
}

/**
 * Вывести дерево категорий
 * @param {Array} tree
 * @param {number} indent
 */
function printCategoryTree(tree, indent = 0) {
    const prefix = '  '.repeat(indent);

    tree.forEach(cat => {
        const code = cat.code || cat.id;
        const title = cat.translations?.[0]?.title || cat.title || cat.name || 'Unknown';
        console.log(`${prefix}[${code}] ${title}`);

        if (cat.children && cat.children.length > 0) {
            printCategoryTree(cat.children, indent + 1);
        }
    });
}

/**
 * Найти категорию по названию (поиск)
 * @param {Array} categories
 * @param {string} searchTerm
 * @returns {Array}
 */
function searchCategories(categories, searchTerm) {
    const term = searchTerm.toLowerCase();

    return categories.filter(cat => {
        const title = cat.translations?.[0]?.title || cat.title || cat.name || '';
        return title.toLowerCase().includes(term);
    });
}

// Главная функция
async function main() {
    console.log('='.repeat(60));
    console.log('  Эпицентр Маркетплейс - Получение категорий');
    console.log('='.repeat(60));
    console.log('');

    if (BEARER_TOKEN === 'YOUR_BEARER_TOKEN_HERE') {
        console.log('ВНИМАНИЕ: Установите Bearer токен!');
        console.log('');
        console.log('Способы установки токена:');
        console.log('1. Переменная окружения: export EPICENTR_API_TOKEN="ваш_токен"');
        console.log('2. Измените значение BEARER_TOKEN в этом файле');
        console.log('');
        console.log('Токен можно получить в личном кабинете продавца Эпицентр Маркетплейс.');
        console.log('');
        return;
    }

    try {
        // Получаем только конечные категории (без детей) для маппинга товаров
        console.log('Загрузка конечных категорий (hasChild=false)...');
        const leafCategories = await getAllCategories(false);

        console.log(`\nВсего конечных категорий: ${leafCategories.length}\n`);

        if (leafCategories.length > 0) {
            // Сохраняем в JSON файл
            const outputPath = __dirname + '/categories.json';

            fs.writeFileSync(outputPath, JSON.stringify(leafCategories, null, 2), 'utf8');
            console.log(`Категории сохранены в: ${outputPath}\n`);

            // Создаем маппинг
            const mapping = formatCategoriesForMapping(leafCategories);
            const mappingPath = __dirname + '/category-mapping.json';

            fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2), 'utf8');
            console.log(`Маппинг сохранен в: ${mappingPath}\n`);

            // Выводим первые 20 категорий для примера
            console.log('Примеры категорий (первые 20):');
            console.log('-'.repeat(60));

            leafCategories.slice(0, 20).forEach(cat => {
                const code = cat.code || cat.id;
                const title = cat.translations?.[0]?.title || cat.title || 'Unknown';
                console.log(`[${code}] ${title}`);
            });
        }

    } catch (error) {
        console.error('Ошибка:', error.message);
    }
}

// Экспорт функций для использования в других скриптах
module.exports = {
    getCategories,
    getAllCategories,
    formatCategoriesForMapping,
    buildCategoryTree,
    printCategoryTree,
    searchCategories
};

// Запуск если вызван напрямую
if (require.main === module) {
    main();
}
