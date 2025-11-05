# PowerShell скрипт для запуску ngrok та налаштування Telegram webhook

$ErrorActionPreference = "Stop"

Write-Host "🚀 Запускаю ngrok для Telegram бота..." -ForegroundColor Green
Write-Host ""

# Перевірка наявності ngrok
$ngrokExists = Get-Command ngrok -ErrorAction SilentlyContinue
if (-not $ngrokExists) {
    Write-Host "❌ ngrok не знайдено в PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Встановіть ngrok:" -ForegroundColor Yellow
    Write-Host "   choco install ngrok" -ForegroundColor Cyan
    Write-Host "   або завантажте з: https://ngrok.com/download" -ForegroundColor Cyan
    exit 1
}

# Завантажуємо .env файл
$envPath = Join-Path $PSScriptRoot "..\.env"
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            if ($key -and $value) {
                [Environment]::SetEnvironmentVariable($key, $value, "Process")
            }
        }
    }
}

$PORT = if ($env:PORT) { $env:PORT } else { 5000 }
$BOT_TOKEN = $env:TELEGRAM_BOT_TOKEN

if (-not $BOT_TOKEN) {
    Write-Host "❌ TELEGRAM_BOT_TOKEN не знайдено в .env файлі" -ForegroundColor Red
    exit 1
}

Write-Host "📡 Проксіюю порт $PORT -> ngrok" -ForegroundColor Cyan
Write-Host ""

# Запускаємо ngrok у фоновому режимі
$ngrokProcess = Start-Process -FilePath "ngrok" -ArgumentList "http", $PORT, "--log=stdout" -NoNewWindow -PassThru -RedirectStandardOutput "ngrok_output.txt" -RedirectStandardError "ngrok_error.txt"

# Чекаємо, поки ngrok запуститься
Start-Sleep -Seconds 3

# Отримуємо URL через ngrok API
$maxRetries = 10
$retryCount = 0
$ngrokUrl = $null

while ($retryCount -lt $maxRetries -and -not $ngrokUrl) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -Method Get -ErrorAction SilentlyContinue
        if ($response.tunnels -and $response.tunnels.Count -gt 0) {
            $httpsTunnel = $response.tunnels | Where-Object { $_.proto -eq "https" }
            if ($httpsTunnel) {
                $ngrokUrl = $httpsTunnel.public_url
            } else {
                $ngrokUrl = $response.tunnels[0].public_url
            }
        }
    } catch {
        # Ігноруємо помилки і пробуємо ще раз
    }
    
    if (-not $ngrokUrl) {
        $retryCount++
        Start-Sleep -Seconds 1
    }
}

if (-not $ngrokUrl) {
    Write-Host "❌ Не вдалося отримати ngrok URL" -ForegroundColor Red
    Write-Host "💡 Перевірте, що ngrok запущено правильно" -ForegroundColor Yellow
    Stop-Process -Id $ngrokProcess.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "✅ ngrok запущено успішно!" -ForegroundColor Green
Write-Host "🌐 Публічний URL: $ngrokUrl" -ForegroundColor Cyan
Write-Host "🔗 Webhook URL буде: $ngrokUrl/api/telegram/webhook" -ForegroundColor Cyan
Write-Host "📊 Ngrok web interface: http://localhost:4040" -ForegroundColor Cyan
Write-Host ""

# Налаштовуємо webhook
Write-Host "🔧 Налаштовую webhook для бота..." -ForegroundColor Yellow

$webhookUrl = "$ngrokUrl/api/telegram/webhook"

try {
    # Перевіряємо поточний webhook
    $infoResponse = Invoke-RestMethod -Uri "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo" -Method Get
    if ($infoResponse.ok -and $infoResponse.result.url) {
        Write-Host "📋 Поточний webhook: $($infoResponse.result.url)" -ForegroundColor Gray
    }

    # Встановлюємо webhook
    $webhookData = @{
        url = $webhookUrl
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" -Method Post -Body $webhookData -ContentType "application/json"

    if ($response.ok) {
        Write-Host "✅ Webhook успішно налаштовано!" -ForegroundColor Green
        Write-Host "📡 URL: $webhookUrl" -ForegroundColor Cyan
        
        # Перевіряємо інформацію про webhook
        $finalInfo = Invoke-RestMethod -Uri "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo" -Method Get
        if ($finalInfo.ok) {
            Write-Host ""
            Write-Host "📋 Інформація про webhook:" -ForegroundColor Cyan
            Write-Host ($finalInfo.result | ConvertTo-Json -Depth 10) -ForegroundColor Gray
            
            if ($finalInfo.result.pending_update_count -gt 0) {
                Write-Host ""
                Write-Host "⚠️  Увага: є $($finalInfo.result.pending_update_count) необроблених оновлень" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "❌ Помилка налаштування webhook: $($response | ConvertTo-Json)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Помилка налаштування webhook: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Відповідь сервера: $responseBody" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "✨ Готово! Telegram бот тепер може отримувати повідомлення через ngrok." -ForegroundColor Green
Write-Host ""
Write-Host "💡 Натисніть Ctrl+C для зупинки ngrok" -ForegroundColor Yellow
Write-Host ""

# Очікуємо завершення
try {
    Wait-Process -Id $ngrokProcess.Id
} catch {
    # Якщо процес вже завершено, це нормально
}

