# Script para eliminar archivos no utilizados
$basePath = "C:\Users\rodri\OneDrive\Escritorio\agendalife2026\maslife2026"

# Archivos a eliminar
$filesToDelete = @(
    "$basePath\auditService.ts",
    "$basePath\emailService.ts",
    "$basePath\pdfExport.ts",
    "$basePath\qrGenerator.ts",
    "$basePath\rutValidator.tsx",
    "$basePath\types_clinical.ts",
    "$basePath\.env.example",
    "$basePath\pages\Plans.tsx",
    "$basePath\pages\PatientLanding.tsx"
)

# Eliminar cada archivo
foreach ($file in $filesToDelete) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "✓ Eliminado: $file"
    } else {
        Write-Host "✗ No encontrado: $file"
    }
}

# Cambiar al directorio del proyecto
Set-Location "C:\Users\rodri\OneDrive\Escritorio\agendalife2026"

# Ejecutar comandos git
Write-Host "`nEjecutando comandos git..."
git add -A
Write-Host "✓ git add -A completado"

git commit -m "refactor: cleanup de archivos no utilizados y duplicados"
Write-Host "✓ git commit completado"

git push origin main
Write-Host "✓ git push completado"

Write-Host "`n¡Operación finalizada exitosamente!"
