@echo off
setlocal
cd /d "%~dp0"

where docker >nul 2>&1
if errorlevel 1 (
    echo Erreur : Docker n'est pas installe. https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo Erreur : le moteur Docker ne repond pas. Demarrez Docker Desktop puis relancez.
    pause
    exit /b 1
)

echo Construction et demarrage de CSIRT Investigate dans Docker...
set /a TRIES=0
rem Miroir par defaut (Docker Hub renvoie des 503 sur une couche de l'image node) ; Docker Hub en secours.
if "%NODE_IMAGE%"=="" set "NODE_IMAGE=mirror.gcr.io/library/node:22-bookworm-slim"
:retry
set /a TRIES+=1
docker compose up -d --build
if not errorlevel 1 goto started
if %TRIES% equ 2 set "NODE_IMAGE=node:22-bookworm-slim"
if %TRIES% lss 4 (
    echo Echec ^(tentative %TRIES%/4^), probablement un probleme reseau Docker Hub. Nouvelle tentative dans 10s...
    timeout /t 10 /nobreak >nul
    goto retry
)
echo Le demarrage a echoue apres %TRIES% tentatives.
echo Verifiez https://www.dockerstatus.com, votre proxy/VPN, ou relancez plus tard.
pause
exit /b 1

:started

if "%CASEBOOK_PORT%"=="" set "CASEBOOK_PORT=5173"
echo.
echo CSIRT Investigate : http://localhost:%CASEBOOK_PORT%/
echo Jeton du premier administrateur (a coller dans "Administrator bootstrap token") :
set "TOKEN_OK="
for /l %%i in (1,1,15) do if not defined TOKEN_OK (
    docker compose exec -T casebook cat /data/initial-admin-token 2>nul && set "TOKEN_OK=1"
    if not defined TOKEN_OK timeout /t 2 /nobreak >nul
)
echo.
echo Ce jeton ne sert qu'a la creation du premier compte. Pour le relire : docker compose exec casebook cat /data/initial-admin-token
echo Arret : docker compose down   (les donnees restent dans le volume casebook-data)
start "" "http://localhost:%CASEBOOK_PORT%/"
exit /b 0
