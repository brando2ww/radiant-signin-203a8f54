@echo off
chcp 65001 >NUL 2>&1
cd /d "%~dp0"

echo.
echo === Velara Print Bridge — Build do Executavel Windows ===
echo.

:: Verifica dependências
where node >NUL 2>&1
IF %ERRORLEVEL% NEQ 0 (
  echo ERRO: Node.js nao encontrado. Instale em https://nodejs.org
  pause & exit /b 1
)

where npm >NUL 2>&1
IF %ERRORLEVEL% NEQ 0 (
  echo ERRO: npm nao encontrado.
  pause & exit /b 1
)

:: Instala dependências (incluindo devDependencies para pkg)
echo [1/4] Instalando dependencias...
call npm install
IF %ERRORLEVEL% NEQ 0 ( echo ERRO no npm install & pause & exit /b 1 )

:: Cria pasta dist se não existir
if not exist "dist\" mkdir dist

:: Build do .exe com pkg
echo [2/4] Compilando executavel Windows (pode demorar na primeira vez)...
call npx pkg server.js --targets node20-win-x64 --output dist\velara-print-bridge.exe --compress GZip
IF %ERRORLEVEL% NEQ 0 ( echo ERRO no build & pause & exit /b 1 )

:: Baixa NSSM se não existir
if not exist "dist\nssm.exe" (
  echo [3/4] Baixando NSSM ^(gerenciador de servico^)...
  powershell -Command "try { Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile 'nssm.zip' -UseBasicParsing; Expand-Archive 'nssm.zip' -DestinationPath 'nssm-tmp' -Force; Copy-Item 'nssm-tmp\nssm-2.24\win64\nssm.exe' 'dist\nssm.exe'; Remove-Item 'nssm.zip','nssm-tmp' -Recurse -Force; Write-Host 'NSSM baixado com sucesso' } catch { Write-Host 'AVISO: falha ao baixar NSSM —' $_.Exception.Message }"
) ELSE (
  echo [3/4] NSSM ja presente, pulando download.
)

:: Copia arquivos de distribuição
echo [4/4] Copiando arquivos de instalacao...
copy /Y "dist\setup.bat" "dist\setup.bat" >NUL 2>&1
copy /Y ".env.example" "dist\.env.example" >NUL 2>&1

echo.
echo === Build concluido! ===
echo.
echo Conteudo da pasta dist\:
dir /B dist\
echo.
echo Para distribuir: compacte toda a pasta dist\ em um ZIP e envie ao restaurante.
echo.
echo Instrucoes para o restaurante:
echo   1. Descompactar em C:\VelaraPrintBridge\
echo   2. Executar setup.bat
echo   3. Executar install.bat como Administrador
echo   4. Verificar: http://localhost:7777/health
echo.
pause
