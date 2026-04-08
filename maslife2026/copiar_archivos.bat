@echo off
echo ========================================
echo COPIANDO ARCHIVOS AL PROYECTO
echo ========================================
echo.

REM Define las rutas
set "DOWNLOADS=C:\Users\rodri\Downloads"
set "PROYECTO=C:\Users\rodri\OneDrive\Escritorio\agendalife2026"

echo Verificando carpeta del proyecto...
if not exist "%PROYECTO%\src" (
    echo ERROR: No se encuentra la carpeta src en el proyecto
    pause
    exit /b 1
)

echo.
echo Copiando archivos...
echo.

REM Copiar archivos a src/
echo [1/9] Copiando types.ts...
copy /Y "%DOWNLOADS%\types.ts" "%PROYECTO%\src\types.ts"

echo [2/9] Copiando ClinicContext.tsx...
copy /Y "%DOWNLOADS%\ClinicContext.tsx" "%PROYECTO%\src\ClinicContext.tsx"

echo [3/9] Copiando App.tsx (desde App_ACTUALIZADO.tsx)...
copy /Y "%DOWNLOADS%\App_ACTUALIZADO.tsx" "%PROYECTO%\src\App.tsx"

REM Copiar archivos a src/pages/
echo [4/9] Copiando ClinicalRecord.tsx...
copy /Y "%DOWNLOADS%\ClinicalRecord.tsx" "%PROYECTO%\src\pages\ClinicalRecord.tsx"

echo [5/9] Copiando Settings.tsx...
copy /Y "%DOWNLOADS%\Settings.tsx" "%PROYECTO%\src\pages\Settings.tsx"

echo [6/9] Copiando Finances.tsx...
copy /Y "%DOWNLOADS%\Finances.tsx" "%PROYECTO%\src\pages\Finances.tsx"

echo [7/9] Copiando PatientProfile.tsx...
copy /Y "%DOWNLOADS%\PatientProfile.tsx" "%PROYECTO%\src\pages\PatientProfile.tsx"

echo [8/9] Copiando ProfessionalAgenda.tsx...
copy /Y "%DOWNLOADS%\ProfessionalAgenda.tsx" "%PROYECTO%\src\pages\ProfessionalAgenda.tsx"

echo [9/9] Copiando ProfessionalDashboard.tsx...
copy /Y "%DOWNLOADS%\ProfessionalDashboard.tsx" "%PROYECTO%\src\pages\ProfessionalDashboard.tsx"

echo.
echo ========================================
echo ARCHIVOS COPIADOS EXITOSAMENTE
echo ========================================
echo.
echo SIGUIENTE PASO:
echo 1. Abre GitHub Desktop
echo 2. Veras los archivos en la lista de cambios
echo 3. Haz click en "Commit to main"
echo 4. Haz click en "Push origin"
echo.
pause
