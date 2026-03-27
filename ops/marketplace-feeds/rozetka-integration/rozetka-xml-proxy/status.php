<?php
/**
 * Страница статистики AL-KO Rozetka Proxy
 * Показывает статус работы и статистику трансформации
 */

// Защита паролем (измените на свой пароль!)
$password = 'alko2024admin';

session_start();

// Простая авторизация
if (isset($_POST['password'])) {
    if ($_POST['password'] === $password) {
        $_SESSION['admin_auth'] = true;
    }
}

if (!isset($_SESSION['admin_auth']) || $_SESSION['admin_auth'] !== true) {
    ?>
    <!DOCTYPE html>
    <html lang="uk">
    <head>
        <meta charset="UTF-8">
        <title>AL-KO Rozetka Proxy - Вхід</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; }
            input[type="password"] { width: 100%; padding: 10px; margin: 10px 0; }
            button { width: 100%; padding: 10px; background: #007bff; color: white; border: none; cursor: pointer; }
        </style>
    </head>
    <body>
        <h2>🔐 Вхід до панелі статистики</h2>
        <form method="post">
            <input type="password" name="password" placeholder="Пароль" required>
            <button type="submit">Увійти</button>
        </form>
    </body>
    </html>
    <?php
    exit;
}

// Загружаем конфигурацию
$config = require __DIR__ . '/config.php';

// Функция для получения размера файла в читаемом формате
function formatBytes($bytes, $precision = 2) {
    $units = ['B', 'KB', 'MB', 'GB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . ' ' . $units[$pow];
}

// Собираем информацию
$info = [
    'source_url' => $config['source_xml_url'],
    'cache_enabled' => $config['cache']['enabled'],
    'cache_file' => $config['cache']['file'],
    'cache_time' => $config['cache']['time'],
    'cache_exists' => file_exists($config['cache']['file']),
    'cache_age' => null,
    'cache_size' => null,
    'log_dir' => $config['logging']['dir'],
    'recent_logs' => [],
];

if ($info['cache_exists']) {
    $info['cache_age'] = time() - filemtime($config['cache']['file']);
    $info['cache_size'] = filesize($config['cache']['file']);
}

// Получаем последние логи
$logDir = $config['logging']['dir'];
if (is_dir($logDir)) {
    $logFiles = glob($logDir . 'proxy_*.log');
    rsort($logFiles);
    if (!empty($logFiles)) {
        $latestLog = $logFiles[0];
        $logContent = file_get_contents($latestLog);
        $lines = explode("\n", $logContent);
        $info['recent_logs'] = array_slice(array_filter($lines), -20);
    }
}

// Тестовый запуск трансформации для получения статистики
$testStats = null;
$testError = null;

if (isset($_GET['test'])) {
    try {
        ob_start();
        include __DIR__ . '/index.php';
        $output = ob_get_clean();
        
        // Подсчитываем офферы в результате
        preg_match_all('/<offer\s/i', $output, $matches);
        $testStats = [
            'offers_count' => count($matches[0]),
            'xml_size' => strlen($output),
        ];
    } catch (Exception $e) {
        $testError = $e->getMessage();
    }
}

// Очистка кеша
if (isset($_GET['clear_cache']) && file_exists($config['cache']['file'])) {
    unlink($config['cache']['file']);
    header('Location: status.php?cleared=1');
    exit;
}
?>
<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AL-KO Rozetka Proxy - Статус</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 { color: #e60000; margin-bottom: 5px; }
        h2 { color: #333; border-bottom: 2px solid #e60000; padding-bottom: 10px; }
        .status-ok { color: #28a745; }
        .status-error { color: #dc3545; }
        .status-warning { color: #ffc107; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; }
        .btn {
            display: inline-block;
            padding: 10px 20px;
            background: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            margin-right: 10px;
        }
        .btn-danger { background: #dc3545; }
        .btn-success { background: #28a745; }
        .logs {
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 15px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            max-height: 300px;
            overflow-y: auto;
        }
        .logs pre { margin: 0; white-space: pre-wrap; }
        .alert {
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
        }
        .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .alert-info { background: #cce5ff; color: #004085; border: 1px solid #b8daff; }
    </style>
</head>
<body>
    <div class="card">
        <h1>🔧 AL-KO Rozetka Proxy</h1>
        <p>Панель статусу та статистики</p>
    </div>
    
    <?php if (isset($_GET['cleared'])): ?>
    <div class="alert alert-success">
        ✅ Кеш успішно очищено!
    </div>
    <?php endif; ?>
    
    <div class="card">
        <h2>📊 Загальна інформація</h2>
        <table>
            <tr>
                <th>Параметр</th>
                <th>Значення</th>
                <th>Статус</th>
            </tr>
            <tr>
                <td>Джерело XML</td>
                <td><a href="<?= htmlspecialchars($info['source_url']) ?>" target="_blank"><?= htmlspecialchars($info['source_url']) ?></a></td>
                <td>-</td>
            </tr>
            <tr>
                <td>Кешування</td>
                <td><?= $info['cache_enabled'] ? 'Увімкнено' : 'Вимкнено' ?></td>
                <td class="<?= $info['cache_enabled'] ? 'status-ok' : 'status-warning' ?>">
                    <?= $info['cache_enabled'] ? '✅' : '⚠️' ?>
                </td>
            </tr>
            <tr>
                <td>Час кешування</td>
                <td><?= $info['cache_time'] ?> сек (<?= round($info['cache_time'] / 60) ?> хв)</td>
                <td>-</td>
            </tr>
            <tr>
                <td>Файл кешу</td>
                <td><?= $info['cache_exists'] ? 'Існує' : 'Не існує' ?></td>
                <td class="<?= $info['cache_exists'] ? 'status-ok' : 'status-warning' ?>">
                    <?= $info['cache_exists'] ? '✅' : '⚠️' ?>
                </td>
            </tr>
            <?php if ($info['cache_exists']): ?>
            <tr>
                <td>Вік кешу</td>
                <td><?= round($info['cache_age'] / 60) ?> хв (<?= $info['cache_age'] ?> сек)</td>
                <td class="<?= $info['cache_age'] < $info['cache_time'] ? 'status-ok' : 'status-warning' ?>">
                    <?= $info['cache_age'] < $info['cache_time'] ? '✅ Актуальний' : '⚠️ Застарілий' ?>
                </td>
            </tr>
            <tr>
                <td>Розмір кешу</td>
                <td><?= formatBytes($info['cache_size']) ?></td>
                <td>-</td>
            </tr>
            <?php endif; ?>
        </table>
    </div>
    
    <div class="card">
        <h2>🔗 Посилання</h2>
        <p><strong>XML для Rozetka:</strong></p>
        <p><code><?= htmlspecialchars((isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['REQUEST_URI'])) ?>/</code></p>
        <br>
        <a href="./" class="btn btn-success" target="_blank">📄 Переглянути XML</a>
        <a href="?clear_cache=1" class="btn btn-danger" onclick="return confirm('Очистити кеш?')">🗑️ Очистити кеш</a>
        <a href="?test=1" class="btn">🧪 Тестовий запуск</a>
    </div>
    
    <?php if ($testStats): ?>
    <div class="card">
        <h2>🧪 Результат тестового запуску</h2>
        <div class="alert alert-info">
            <strong>Кількість товарів у результаті:</strong> <?= number_format($testStats['offers_count']) ?><br>
            <strong>Розмір XML:</strong> <?= formatBytes($testStats['xml_size']) ?>
        </div>
    </div>
    <?php endif; ?>
    
    <?php if ($testError): ?>
    <div class="card">
        <h2>❌ Помилка тесту</h2>
        <div class="alert" style="background: #f8d7da; color: #721c24;">
            <?= htmlspecialchars($testError) ?>
        </div>
    </div>
    <?php endif; ?>
    
    <div class="card">
        <h2>📋 Останні логи</h2>
        <?php if (!empty($info['recent_logs'])): ?>
        <div class="logs">
            <pre><?php foreach ($info['recent_logs'] as $line): echo htmlspecialchars($line) . "\n"; endforeach; ?></pre>
        </div>
        <?php else: ?>
        <p>Логи відсутні</p>
        <?php endif; ?>
    </div>
    
    <div class="card">
        <h2>⚙️ Налаштування виключень</h2>
        <p><strong>Виключені артикули:</strong></p>
        <ul>
            <?php foreach ($config['exclude_articles'] ?? [] as $art): ?>
            <li><?= htmlspecialchars($art) ?></li>
            <?php endforeach; ?>
            <?php if (empty($config['exclude_articles'])): ?>
            <li><em>Немає виключень</em></li>
            <?php endif; ?>
        </ul>
        <p><small>Редагуйте файл <code>config.php</code> для зміни налаштувань</small></p>
    </div>
    
    <div class="card" style="text-align: center; color: #666;">
        <p>AL-KO Rozetka Proxy v2.0 | <?= date('Y') ?></p>
        <p><a href="?logout=1" style="color: #dc3545;">Вийти</a></p>
    </div>
</body>
</html>
<?php
if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: status.php');
    exit;
}
?>
