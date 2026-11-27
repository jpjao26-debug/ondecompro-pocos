@echo off
echo Rodando a coleta (San Michel, Supervale e Vila Sul; pode levar perto de 1 hora)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0rodar.ps1"
echo Terminou. O resumo esta na pasta logs.
pause
