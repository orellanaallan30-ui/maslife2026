@echo off
echo ============================================
echo   MasLife2026 - Push a nuevo repositorio
echo ============================================
echo.

cd /d "C:\Users\rodri\OneDrive\Escritorio\agendalife2026"

echo [1/3] Cambiando remote URL a orellanaallan30-ui/maslife2026...
git remote set-url origin https://github.com/orellanaallan30-ui/maslife2026.git
echo Remote actualizado correctamente.
echo.

echo [2/3] Verificando remote...
git remote -v
echo.

echo [3/3] Haciendo push a GitHub (main)...
git push -u origin main
echo.

echo ============================================
echo   Push completado. Verifica en GitHub!
echo ============================================
pause
