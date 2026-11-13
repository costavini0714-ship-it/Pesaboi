@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo =====================================================
echo                 PESABOI 3.16
echo      Análise visual automática experimental
echo ==================================================
echo A detecao visual pode baixar um modelo na primeira utilizacao. A estimativa e experimental.
where py >nul 2>nul
if errorlevel 1 (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python 3 nao foi encontrado. Instale o Python 3 e tente novamente.
    pause
    exit /b 1
  )
  set PYTHON=python
) else (
  set PYTHON=py -3
)
if not exist ".venv\Scripts\python.exe" (
  echo Preparando ambiente do PesaBoi...
  %PYTHON% -m venv .venv
  if errorlevel 1 (
    echo Nao foi possivel preparar o ambiente Python.
    pause
    exit /b 1
  )
)
echo Verificando componentes do servidor (biblioteca padrão)...
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r requirements.txt
if errorlevel 1 (
  echo Nao foi possivel preparar os componentes. Verifique o Python e tente novamente.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" server.py
pause
