@echo off
rem Lance un niveau de DOOMED en jeu dans Unreal (sans l'editeur). Exemple : Tester_niveau.bat 22
rem L'apercu des niveaux (cartes, etat, controle) : profil\fiches\apercu.html
cd /d "%~dp0outils"
python -X utf8 jouer.py %1
