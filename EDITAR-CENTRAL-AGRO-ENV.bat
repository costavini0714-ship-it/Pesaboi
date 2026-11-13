@echo off
setlocal
cd /d "%~dp0"
if not exist "central-agro.env" (
  echo Arquivo central-agro.env nao encontrado nesta pasta.
  pause
  exit /b 1
)
start "" notepad.exe "%CD%\central-agro.env"
endlocal
