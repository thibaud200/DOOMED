"""Page d'aperçu des niveaux (comme « tester un niveau » du jeu HTML) : carte vue de dessus, plan, état, contrôle en jeu.

    python apercu.py [--profil jeu.json]        → <fiches>\\apercu.html (un seul fichier, ouvrable sans serveur)

Lit les fiches de l'enchaîneur (<fiches>\\E<n>\\) et, pour les niveaux d'origine (source « export »), la grille du jeu.
Commun à tous les jeux : couleurs d'après les catégories du profil (carte.categories). Régénérée par l'enchaîneur.
"""
import html, json, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fiches as F


def part_couloirs(rows, p):
    """Part du sol en couloir (case de sol entre deux murs face à face) : au-delà de 40 %, le niveau manque de salles."""
    if not rows:
        return None
    return round(100 * F.part_couloirs(F.Grille(rows, p)))


def niveaux(p):
    ch = p['chaine']
    dossier = Path(ch['racine']) / ch['fiches']
    export = json.loads(Path(p['construction']['source_cartes']).read_text(encoding='utf-8'))['niveaux'] \
        if p.get('construction', {}).get('source_cartes') else []
    out = []
    nums = sorted({int(d.name[1:]) for d in dossier.glob('E*') if d.name[1:].isdigit()} | set(range(1, len(export) + 1)))
    for n in nums:
        d = dossier / f'E{n}'
        lit = lambda f: F.lire(d / f) if (d / f).exists() else None
        etat, plan, carte, rapport = lit('etat.json'), lit('plan.json'), lit('carte.json'), lit('rapport.json')
        if carte is None and n <= len(export):
            carte = {'nom': export[n - 1]['name'], 'rows': export[n - 1]['rows']}
        if carte is None and plan is None:
            if etat:
                out.append({'n': n, 'nom': f'E{n}', 'statut': etat['statut'], 'historique': etat['historique'][-6:]})
            continue
        photos = [f'E{n}/photos/{q}.jpg' for q in ('dessus', 'salle', 'depart', 'sortie') if (d / 'photos' / f'{q}.jpg').exists()]
        out.append({'n': n, 'nom': (carte or plan)['nom'], 'rows': (carte or {}).get('rows'), 'photos': photos,
                    'statut': (etat or {}).get('statut', 'origine' if n == 1 else '—'),
                    'source': 'jeu HTML' if n <= len(export) and not plan else 'modèle local',
                    'theme': (plan or {}).get('theme', ''), 'temps_forts': (plan or {}).get('temps_forts', []),
                    'zones': [f'{z["nom"]} ({z["role"]}, {z["taille"]})' for z in (plan or {}).get('zones', [])],
                    'erreurs': (rapport or {}).get('erreurs', []), 'alertes': (rapport or {}).get('alertes', []),
                    'comptes': (rapport or {}).get('comptes', {}), 'historique': (etat or {}).get('historique', [])[-6:],
                    'suivant': (etat or {}).get('suivant', ''),
                    'couloirs': part_couloirs((carte or {}).get('rows'), p)})
    return out


PAGE = r'''<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>__JEU__ — aperçu des niveaux</title>
<style>
body{margin:0;padding:14px 18px;background:#141416;color:#ddd;font:14px/1.45 Consolas,monospace}
h1{color:#e33;margin:0 0 4px} .gris{color:#888}
#filtres{position:sticky;top:0;background:#141416;padding:8px 0 10px;border-bottom:1px solid #333;margin-bottom:12px;z-index:1}
#filtres label{margin-right:14px;cursor:pointer}
.carte{display:inline-block;vertical-align:top;margin:0 12px 14px 0;padding:8px;background:#1d1d22;border:1px solid #333;cursor:pointer;width:300px}
@media (max-width:700px){.carte{width:calc(100% - 18px);margin-right:0}#detail img{width:100%!important}}
.carte:hover{border-color:#e33;background:#26262c}
.carte canvas{display:block;margin:6px 0;image-rendering:pixelated;max-width:100%}
.carte b{color:#ffd040}
.st{display:inline-block;padding:0 6px;border-radius:3px;font-size:12px}
.controle_ok{background:#1e5e2a}.controle_ko{background:#7a2a1a}.echec{background:#5a1a1a}.carte_ok{background:#4a4a1a}.origine{background:#2a3a5a}
#detail{position:fixed;inset:0;background:#000c;display:none;overflow:auto;z-index:2}
#detail>div{max-width:1100px;margin:20px auto;background:#1d1d22;border:1px solid #444;padding:14px}
#detail canvas{image-rendering:pixelated;max-width:100%;border:1px solid #333}
.leg span{display:inline-block;margin:0 10px 4px 0}.leg i{display:inline-block;width:12px;height:12px;vertical-align:middle;margin-right:4px}
code{background:#000;padding:2px 6px;color:#9f9}
</style></head><body>
<h1>__JEU__ — aperçu des niveaux</h1>
<div class="gris">Mis à jour le __DATE__ — clic sur un niveau pour le détail et la commande pour y jouer</div>
<div id="filtres"><label><input type="checkbox" id="fok" checked> validés</label><label><input type="checkbox" id="fko" checked> à revoir / en échec</label>
<span id="compte" class="gris"></span></div>
<div id="liste"></div>
<div id="detail" onclick="if(event.target===this)this.style.display='none'"><div id="dc"></div></div>
<script>
const N = __DONNEES__, CAT = __CAT__, JOUER = __JOUER__;
const COUL = {mur:'#5b2a22', tech:'#566070', sol:'#2a2a2e', lave:'#e0601a', porte:'#c8a040', R:'#e03030', B:'#3060e0', J:'#e0d030',
  secret:'#a040c0', embuscade:'#d050ff', depart:'#40a0ff', sortie:'#30ff60', monstre:'#ff3030', chef:'#ff00aa', objet:'#40d070', cle:'#ffffff', decor:'#9a8a6a'};
function couleur(ch){
  if(ch===CAT.depart) return COUL.depart; if(ch===CAT.sortie) return COUL.sortie; if(ch===CAT.secret) return COUL.secret;
  if(ch===CAT.embuscade) return COUL.embuscade;
  if(ch==='%') return COUL.tech; if(CAT.murs.includes(ch)) return COUL.mur;
  if(CAT.danger.includes(ch)) return COUL.lave; if(COUL[ch] && CAT.portes.includes(ch)) return COUL[ch];
  if(CAT.portes.includes(ch)) return COUL.porte; if(ch===CAT.chef) return COUL.chef;
  if(CAT.monstres.includes(ch)) return COUL.monstre; if(Object.values(CAT.cles).includes(ch)) return COUL.cle;
  if((CAT.decor||'').includes(ch)) return COUL.decor;
  if(CAT.objets.includes(ch)) return COUL.objet; return COUL.sol;
}
function dessiner(rows, t){
  const c=document.createElement('canvas'); c.width=rows[0].length*t; c.height=rows.length*t; const g=c.getContext('2d');
  rows.forEach((r,y)=>[...r].forEach((ch,x)=>{
    const pt = CAT.monstres.includes(ch)||CAT.objets.includes(ch)||ch===CAT.depart;
    g.fillStyle = pt ? COUL.sol : couleur(ch); g.fillRect(x*t,y*t,t,t);
    if(pt){ g.fillStyle=couleur(ch); g.beginPath(); g.arc(x*t+t/2,y*t+t/2,t*.38,0,7); g.fill();
      if(t>=14){ g.fillStyle='#000'; g.font=`bold ${t*.6}px Consolas`; g.textAlign='center'; g.textBaseline='middle'; g.fillText(ch,x*t+t/2,y*t+t/2+1);} }
  })); return c;
}
const ok = s => s==='controle_ok' || s==='origine';
function liste(){
  const L=document.getElementById('liste'); L.innerHTML=''; let k=0;
  N.forEach((v,i)=>{ if((ok(v.statut)&&!fok.checked)||(!ok(v.statut)&&!fko.checked)) return; k++;
    const d=document.createElement('div'); d.className='carte'; d.onclick=()=>detail(i);
    const cl = v.couloirs==null ? '' : ` · <span style="color:${v.couloirs>40?'#f66':v.couloirs>25?'#fc6':'#8d8'}">couloirs ${v.couloirs} %</span>`;
    d.innerHTML=`<b>${v.nom}</b> <span class="st ${v.statut}">${v.statut}</span><div class="gris">${v.source||''}${cl}</div>`;
    if(v.photos&&v.photos.length) d.insertAdjacentHTML('beforeend', `<img src="${v.photos[0]}" loading="lazy" style="display:block;width:100%;margin:6px 0">`);
    if(v.rows) d.appendChild(dessiner(v.rows,7));
    d.insertAdjacentHTML('beforeend', `<div class="gris">${(v.theme||'').slice(0,110)}</div>`); L.appendChild(d); });
  compte.textContent = ` — ${k} niveau(x) affiché(s) sur ${N.length}`;
}
function detail(i){
  const v=N[i], e=s=>String(s).replace(/</g,'&lt;'); let h=`<h2>${e(v.nom)} <span class="st ${v.statut}">${v.statut}</span></h2>`;
  if(v.theme) h+=`<p>${e(v.theme)}</p>`;
  if(v.photos&&v.photos.length) h+=`<div>${v.photos.map(p=>`<img src="${p}" style="width:32%;margin:0 1% 8px 0;vertical-align:top" title="${p.split('/').pop()}">`).join('')}</div>`;
  if(v.rows) h+=`<p>Pour y jouer (éditeur Unreal fermé) : <code>${JOUER} ${v.n}</code></p><div id="grand"></div>`;
  h+=`<div class="leg">${[['mur brique','mur'],['mur tech','tech'],['sol','sol'],['lave','lave'],['porte','porte'],['porte rouge','R'],['porte bleue','B'],['porte jaune','J'],['secret','secret'],['départ','depart'],['sortie','sortie'],['monstre','monstre'],['chef','chef'],['objet','objet'],['clé','cle'],['embuscade','embuscade'],['décor','decor']].map(([n,k])=>`<span><i style="background:${COUL[k]}"></i>${n}</span>`).join('')}</div>`;
  if(v.zones&&v.zones.length) h+=`<p><b>Zones :</b> ${v.zones.map(e).join(' · ')}</p>`;
  if(v.temps_forts&&v.temps_forts.length) h+=`<p><b>Temps forts :</b> ${v.temps_forts.map(e).join(' · ')}</p>`;
  if(v.comptes&&Object.keys(v.comptes).length) h+=`<p><b>Contrôle en jeu :</b> ${Object.entries(v.comptes).map(([a,b])=>a+' '+b).join(', ')}${v.suivant?' — sortie vers '+e(v.suivant):''}</p>`;
  if(v.erreurs&&v.erreurs.length) h+=`<p style="color:#f66"><b>Erreurs :</b><br>${v.erreurs.map(e).join('<br>')}</p>`;
  if(v.alertes&&v.alertes.length) h+=`<p style="color:#fc6"><b>Alertes :</b><br>${v.alertes.map(e).join('<br>')}</p>`;
  if(v.historique&&v.historique.length) h+=`<p class="gris"><b>Historique :</b><br>${v.historique.map(e).join('<br>')}</p>`;
  dc.innerHTML=h; if(v.rows) document.getElementById('grand').appendChild(dessiner(v.rows,16)); detail_.style.display='block';
}
const detail_=document.getElementById('detail'); fok.onchange=fko.onchange=liste; liste();
</script></body></html>'''


def ecrire(profil_chemin=None):
    p = F.charger_profil(profil_chemin)
    ch = p['chaine']
    sortie = Path(ch['racine']) / ch['fiches'] / 'apercu.html'
    page = (PAGE.replace('__JEU__', html.escape(p.get('jeu', 'Jeu')))
            .replace('__DATE__', time.strftime('%d/%m/%Y %H:%M'))
            .replace('__JOUER__', json.dumps(ch.get('jouer', 'jouer')))
            .replace('__CAT__', json.dumps(p['carte']['categories'], ensure_ascii=False))
            .replace('__DONNEES__', json.dumps(niveaux(p), ensure_ascii=False)))
    sortie.write_text(page, encoding='utf-8')
    return sortie


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    a = sys.argv[1:]
    print(ecrire(a[a.index('--profil') + 1] if '--profil' in a else None))
