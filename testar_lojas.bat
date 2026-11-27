@echo off
cd /d "%~dp0"
echo Teste rapido: abre as 3 lojas e le so a primeira pagina de cada departamento.
set LIMITE=1
for %%m in (sanmichel supervale vilasul) do (
  echo.
  echo ===== %%m =====
  py -3 -m coletor.vipcommerce %%m
)
echo.
echo Terminou. Mande um print desta janela.
pause
