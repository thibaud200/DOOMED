@echo off
rem Editeur de niveaux de DOOMED (Unreal) : peindre une grille, la controler, l'enregistrer, la construire dans Unreal.
rem Ouvre http://127.0.0.1:8770/ dans le navigateur ; fermer cette fenetre arrete l'editeur.
cd /d "%~dp0..\methode\outils"
python -X utf8 editeur.py --profil "%~dp0profil\jeu.json"
pause
