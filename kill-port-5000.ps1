# Скрипт для завершення процесів на порту 5000
$port = 5000
$connections = netstat -ano | findstr ":$port" | findstr "LISTENING"

if ($connections) {
    Write-Host "Знайдено процеси на порту $port, завершую..."
    foreach ($line in $connections) {
        $parts = $line -split '\s+'
        $processId = $parts[-1]
        if ($processId -and $processId -match '^\d+$') {
            Write-Host "Завершую процес з PID: $processId"
            taskkill /F /PID $processId 2>$null
        }
    }
    Write-Host "Порт $port звільнено"
} else {
    Write-Host "Порт $port вільний"
}

