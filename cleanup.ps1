# Script de limpieza de archivos no utilizados en MasLife2026
# Ejecutar como administrador en PowerShell

Write-Host "=== LIMPIEZA DE ARCHIVOS NO UTILIZADOS ===" -ForegroundColor Cyan
Write-Host ""

# Array de archivos a eliminar
$files = @(
    "C:\Users\rodri\OneDrive\Escritorio\agendalife2026\maslife2026\auditService.ts",
    "C:\Users\rodri\OneDrive\Escritorio\agendalife2026\maslife2026\emailService.ts",
    "C:\Users\rodri\OneDrive\Escritorio\agendalife2026\maslife2026\pdfExport.ts",
    "C:\Users\rodri\OneDrive\Escritorio\agendalife2026\maslife2026\qrGenerator.ts",
    "C:\Users\rodri\OneDrive\Escritorio\agendalife2026\maslife2026\rutValidator.tsx",
    "C:\Users\rodri\OneDrive\Escritorio\agendalife2026\maslife2026\types_clinical.ts",
    "C:\Users\rodri\OneDrive\Escritorio\agendalife2026\maslife2026\.env.example",
    "C:\Users\rodri\OneDrive\Escritorio\agendalife2026\maslife2026\pages\Plans.tsx",
    "C:\Users\rodri\OneDrive\Escritorio\agendalife2026\maslife2026\pages\PatientLanding.tsx"
)

$deleted = 0
$failed = 0

# Eliminar archivos
foreach ($file in $files) {
    if (Test-Path $file) {
        try {
            Remove-Item $file -Force
            Write-Host "✓ Eliminado: $(Split-Path $file -Leaf)" -ForegroundColor Green
            $deleted++
        } catch {
            Write-Host "✗ Error al eliminar $(Split-Path $file -Leaf): $($_.Exception.Message)" -ForegroundColor Red
            $failed++
        }
    } else {
        Write-Host "○ No existe: $(Split-Path $file -Leaf)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "--- RESUMEN ---" -ForegroundColor Cyan
Write-Host "Eliminados: $deleted/9" -ForegroundColor Green
Write-Host "Errores: $failed/9" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })

# Git commit y push
Write-Host ""
Write-Host "=== GIT COMMIT Y PUSH ===" -ForegroundColor Cyan
Write-Host ""

try {
    Set-Location "C:\Users\rodri\OneDrive\Escritorio\agendalife2026"

    Write-Host "Ejecutando: git add -A" -ForegroundColor Yellow
    & git add -A

    Write-Host "Ejecutando: git commit" -ForegroundColor Yellow
    & git commit -m "refactor: cleanup de archivos no utilizados y duplicados"

    Write-Host "Ejecutando: git push origin main" -ForegroundColor Yellow
    & git push origin main

    Write-Host ""
    Write-Host "✓ Commit y push completados exitosamente" -ForegroundColor Green
} catch {
    Write-Host "✗ Error en git: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== PROCESO FINALIZADO ===" -ForegroundColor Cyan
Write-Host "Verifica que los cambios aparezcan en Vercel en 2-5 minutos" -ForegroundColor Cyan
