@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo Erreur : Node.js 22.13 ou plus recent est requis.
    echo Telechargement : https://nodejs.org/
    pause
    exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
    echo Erreur : pnpm n'est pas installe ou n'est pas disponible dans le PATH.
    echo Installez-le avec : corepack enable
    pause
    exit /b 1
)

call :find_server
if defined CASEBOOK_URL goto :already_running

if not exist "node_modules\" (
    echo Installation des dependances...
    call pnpm install --frozen-lockfile
    if errorlevel 1 goto :error
)

echo Demarrage de CSIRT Investigate...
rem The local Cloudflare Workers runtime (workerd) occasionally drops its
rem startup socket on the first attempt (antivirus scanning the freshly
rem extracted binary, a synced OneDrive folder, etc.), so retry a few times
rem before treating it as a real failure.
set "CASEBOOK_DEV_ATTEMPTS=0"
:dev
set /a CASEBOOK_DEV_ATTEMPTS+=1
rem No live server at this point: drop the stale dev lock and the Miniflare
rem registry left behind by a previous (killed) run, which otherwise makes the
rem next start fail with ECONNRESET.
if exist ".vinext\dev\lock.json" del /f /q ".vinext\dev\lock.json" >nul 2>&1
if exist ".wrangler\registry" rmdir /s /q ".wrangler\registry" >nul 2>&1
call pnpm dev
if not errorlevel 1 exit /b 0
call :find_server
if defined CASEBOOK_URL goto :already_running
if %CASEBOOK_DEV_ATTEMPTS% lss 3 (
    echo Le serveur de developpement a echoue, nouvel essai ^(%CASEBOOK_DEV_ATTEMPTS%/3^)...
    timeout /t 3 /nobreak >nul
    goto :dev
)
goto :error

:find_server
set "CASEBOOK_URL="
if not exist ".vinext\dev\lock.json" exit /b 0
for /f "delims=" %%U in ('powershell -NoProfile -Command "$lock = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText((Resolve-Path '.vinext/dev/lock.json'))); try { $process = Get-Process -Id ([int]$lock.pid) -ErrorAction Stop; if ($process.ProcessName -eq 'node') { [Console]::WriteLine([string]$lock.appUrl) } } catch {}"') do set "CASEBOOK_URL=%%U"
exit /b 0

:already_running
echo CSIRT Investigate est deja demarre sur %CASEBOOK_URL%/
start "" "%CASEBOOK_URL%/"
exit /b 0

:error
echo.
echo Le demarrage a echoue.
pause
exit /b 1