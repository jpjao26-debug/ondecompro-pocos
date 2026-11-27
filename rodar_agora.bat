@echo off
echo Rodando a coleta (San Michel, Supervale e Vila Sul; uma loja de cada vez; pode levar 1 a 2 horas)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0rodar.ps1"
echo Terminou. O resumo esta na pasta logs.
pause
