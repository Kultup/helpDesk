# Скрипт для вивільнення порту 5000
# Використання: .\kill-port-5000.ps1

Write-Host "Перевірка порту 5000..." -ForegroundColor Yellow

# Знаходимо процеси, які використовують порт 5000
$connections = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue

if ($connections) {
    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    
    foreach ($pid in $pids) {
        try {
            $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($process) {
                Write-Host "Знайдено процес: $($process.ProcessName) (PID: $pid)" -ForegroundColor Cyan
                Write-Host "Зупиняю процес..." -ForegroundColor Yellow
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                Write-Host "✓ Процес $pid зупинено" -ForegroundColor Green
            }
        } catch {
            Write-Host "⚠ Не вдалося зупинити процес $pid: $_" -ForegroundColor Yellow
        }
    }
    
    # Даємо час на закриття
    Start-Sleep -Seconds 2
    
    # Перевіряємо ще раз
    $remaining = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue
    if ($remaining) {
        Write-Host "⚠ Деякі з'єднання все ще активні" -ForegroundColor Yellow
    } else {
        Write-Host "✓ Порт 5000 вивільнено" -ForegroundColor Green
    }
} else {
    Write-Host "✓ Порт 5000 вільний" -ForegroundColor Green
}

Write-Host ""
Write-Host "Тепер можна запустити проект: npm run dev" -ForegroundColor Cyan
