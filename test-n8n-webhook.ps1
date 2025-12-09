# n8n Webhook Test Script
# Kullanım: .\test-n8n-webhook.ps1

$webhookUrl = "https://n8n.devrekbenimmarketim.com/webhook-test/e28ba3af-75a2-4d06-9436-00332405e9db"

Write-Host "🧪 n8n Webhook Test Başlatılıyor..." -ForegroundColor Cyan
Write-Host "📍 URL: $webhookUrl" -ForegroundColor Yellow
Write-Host ""

# Basit test verisi
$testBody = @{
    test = "data"
    message = "Test isteği"
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json

try {
    Write-Host "📤 İstek gönderiliyor..." -ForegroundColor Cyan
    
    $response = Invoke-RestMethod -Uri $webhookUrl `
        -Method POST `
        -ContentType "application/json" `
        -Body $testBody `
        -ErrorAction Stop
    
    Write-Host "✅ Başarılı!" -ForegroundColor Green
    Write-Host "📥 Yanıt:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 10
}
catch {
    Write-Host "❌ Hata oluştu!" -ForegroundColor Red
    Write-Host "Hata Mesajı: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Yanıt: $responseBody" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "💡 İpucu:" -ForegroundColor Yellow
    Write-Host "   - n8n'de workflow'un aktif olduğundan emin olun" -ForegroundColor Yellow
    Write-Host "   - Test modundaysa 'Execute workflow' butonuna tıklayın" -ForegroundColor Yellow
    Write-Host "   - Webhook URL'inin doğru olduğunu kontrol edin" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "---" -ForegroundColor Gray
Write-Host "Sipariş formatında test için:" -ForegroundColor Cyan
Write-Host ""

# Sipariş formatında test verisi
$orderBody = @{
    event = "order.created"
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    order = @{
        id = "test-order-$(Get-Date -Format 'yyyyMMddHHmmss')"
        orderNumber = "TEST-001"
        user = @{
            id = "test-user-id"
            name = "Test Kullanıcı"
            email = "test@example.com"
            phone = "5551234567"
        }
        products = @(
            @{
                name = "Test Ürün 1"
                quantity = 2
                price = 25.50
                total = 51.00
            },
            @{
                name = "Test Ürün 2"
                quantity = 1
                price = 15.00
                total = 15.00
            }
        )
        totalAmount = 66.00
        city = "İstanbul"
        deliveryPoint = "Kadıköy"
        deliveryPointName = "Kadıköy Test Şubesi"
        status = "pending"
        createdAt = (Get-Date).ToUniversalTime().ToString("o")
        note = "Bu bir test siparişidir"
    }
} | ConvertTo-Json -Depth 10

Write-Host "Sipariş testi yapmak için yukarıdaki komutu tekrar çalıştırın ve webhook'u aktif edin." -ForegroundColor Yellow

