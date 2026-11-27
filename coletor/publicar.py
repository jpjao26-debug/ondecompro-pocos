"""Publica o app no GitHub Pages e guarda o histórico no repositório.

- O histórico de preços (dados/historico_precos.json) e a leitura dos encartes
  (dados/cache_encartes.json) vão para a branch principal — assim o outro PC
  continua de onde este parou.
- O app (pasta site/) vai para a branch gh-pages, sempre substituída pela versão
  do dia (não acumula arquivos velhos).
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from .comum import RAIZ, hoje, log


def git(*args, cwd=RAIZ, checar=True):
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if checar and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} falhou:\n{r.stdout}\n{r.stderr}")
    return r


def guardar_historico():
    arquivos = [f for f in ("dados/historico_precos.json", "dados/cache_encartes.json") if (RAIZ / f).exists()]
    if not arquivos:
        return
    git("add", *arquivos)
    if git("diff", "--cached", "--quiet", checar=False).returncode == 0:
        log("Histórico: nada novo para guardar")
        return
    git("commit", "-m", f"Preços de {hoje()}")
    if git("push", checar=False).returncode != 0:
        git("pull", "--rebase", "--autostash")
        git("push")
    log("Histórico guardado no GitHub")


def publicar_site():
    remoto = git("remote", "get-url", "origin").stdout.strip()
    with tempfile.TemporaryDirectory() as tmp:
        destino = Path(tmp) / "site"
        shutil.copytree(RAIZ / "site", destino)
        (destino / ".nojekyll").write_text("")
        git("init", "-q", cwd=destino)
        git("checkout", "-q", "-b", "gh-pages", cwd=destino)
        git("config", "user.name", "robo-ondecompro", cwd=destino)
        git("config", "user.email", "robo@ondecompro.local", cwd=destino)
        git("add", "-A", cwd=destino)
        git("commit", "-q", "-m", f"App atualizado em {hoje()}", cwd=destino)
        git("push", "--force", remoto, "gh-pages", cwd=destino)
    log("App publicado no GitHub Pages")


def main():
    try:
        guardar_historico()
        publicar_site()
    except Exception as e:
        log(f"Falha ao publicar: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
