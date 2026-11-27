@echo off
cd /d "%~dp0"
echo Enviando o app (com os precos da ultima coleta) ao GitHub...
py -3 -m coletor.publicar
if errorlevel 1 goto erro
echo.
echo Pronto! Em 1 a 2 minutos o app novo aparece no celular.
pause
exit /b 0
:erro
echo.
echo Deu erro. Mande um print desta janela.
pause
