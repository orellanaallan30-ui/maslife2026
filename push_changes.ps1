# Script para subir cambios del proyecto MasLife2026 a GitHub y Vercel
# Ejecutar en PowerShell como administrador

Write-Host "=== SUBIENDO CAMBIOS A GITHUB ===" -ForegroundColor Cyan
Write-Host ""

try {
    # Navegar a la carpeta del proyecto
    Set-Location "C:\Users\rodri\OneDrive\Escritorio\agendalife2026"

    Write-Host "📂 Directorio actual: $(Get-Location)" -ForegroundColor Yellow
    Write-Host ""

    # Mostrar estado actual
    Write-Host "📋 Estado de Git:" -ForegroundColor Yellow
    & git status
    Write-Host ""

    # Agregar todos los cambios
    Write-Host "➕ Agregando cambios (git add -A)..." -ForegroundColor Yellow
    & git add -A
    Write-Host "✓ Cambios agregados" -ForegroundColor Green
    Write-Host ""

    # Crear commit
    $commitMessage = @"
feat: actualizar funciones clave del proyecto MasLife2026

- Mejorar autenticación profesional con rate limiting (5 intentos en 15 min)
- Implementar exportación de registros clínicos a PDF con QR
- Actualizar gestión de citas y calendario profesional
- Mejorar panel de configuración con integración MercadoPago
- Actualizar flujo de booking de pacientes (5 pasos)
- Mejorar panel admin para aprobación de profesionales
- Agregar protecciones de seguridad en autenticación
- Actualizar tipos TypeScript y contexto global
"@

    Write-Host "💾 Creando commit..." -ForegroundColor Yellow
    & git commit -m $commitMessage
    Write-Host "✓ Commit creado" -ForegroundColor Green
    Write-Host ""

    # Push a GitHub
    Write-Host "🚀 Haciendo push a GitHub (origin main)..." -ForegroundColor Yellow
    & git push origin main
    Write-Host "✓ Push completado" -ForegroundColor Green
    Write-Host ""

    Write-Host "=== RESUMEN ===" -ForegroundColor Cyan
    Write-Host "✓ Cambios agregados a staging" -ForegroundColor Green
    Write-Host "✓ Commit creado en repositorio local" -ForegroundColor Green
    Write-Host "✓ Push enviado a GitHub (main)" -ForegroundColor Green
    Write-Host ""
    Write-Host "⏳ Vercel detectará los cambios automáticamente en 30-60 segundos" -ForegroundColor Cyan
    Write-Host "📍 Monitorea el deploy en: https://vercel.com/rodrigoprecisoroo/maslife2026" -ForegroundColor Cyan

} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Intenta ejecutar manualmente estos comandos:" -ForegroundColor Yellow
    Write-Host "cd 'C:\Users\rodri\OneDrive\Escritorio\agendalife2026'" -ForegroundColor Gray
    Write-Host "git add -A" -ForegroundColor Gray
    Write-Host "git commit -m 'feat: actualizar funciones clave del proyecto MasLife2026'" -ForegroundColor Gray
    Write-Host "git push origin main" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Presiona ENTER para salir..."
Read-Host
