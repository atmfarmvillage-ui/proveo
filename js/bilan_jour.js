// ══════════════════════════════════════════════════
// PROVENDA — BILAN JOURNALIER & FERMETURE DE CAISSE
// CA + encaissé + dépenses + réconciliation cash physique
// ══════════════════════════════════════════════════

async function renderBilanJour(){
  const dateEl = document.getElementById('bj_date');
  if(dateEl && !dateEl.value) dateEl.value = today();
  const date = dateEl?.value || today();

  // ── 1. Fetch des données du jour ───────────────────
  const [{data:ventes}, {data:depenses}, {data:mvts}] = await Promise.all([
    SB.from('gp_ventes').select('*').eq('admin_id',GP_ADMIN_ID).is('deleted_at',null).eq('date',date).order('created_at'),
    SB.from('gp_depenses').select('*').eq('admin_id',GP_ADMIN_ID).eq('date',date).order('created_at'),
    SB.from('gp_mouvements_caisse').select('*').eq('admin_id',GP_ADMIN_ID).eq('date_mouvement',date).order('created_at')
  ]);

  // Scope au PDV de la secrétaire (si elle a un PDV affecté, sinon admin → tout)
  const V = (GP_POINT_VENTE)
    ? (ventes||[]).filter(v=>v.point_vente===GP_POINT_VENTE)
    : (ventes||[]);
  const D = depenses || [];
  const M = (GP_POINT_VENTE)
    ? (mvts||[]).filter(m=>!m.point_vente || m.point_vente===GP_POINT_VENTE)
    : (mvts||[]);

  // ── 2. Calcul KPIs ─────────────────────────────────
  const caTotal       = V.reduce((s,v)=>s+Number(v.montant_total||0),0);
  const cashEncaisse  = V.reduce((s,v)=>s+Number(v.montant_paye||0),0);
  const creditAccorde = Math.max(0, caTotal - cashEncaisse);
  const totDepenses   = D.reduce((s,d)=>s+Number(d.montant||0),0);

  // Caisse : tous les mouvements de la journée
  const entreesCaisse = M.filter(m=>m.type==='entree').reduce((s,m)=>s+Number(m.montant||0),0);
  const sortiesCaisse = M.filter(m=>m.type==='sortie').reduce((s,m)=>s+Number(m.montant||0),0);
  const balanceJour   = entreesCaisse - sortiesCaisse;

  // ── 3. KPIs en haut ────────────────────────────────
  document.getElementById('bj-kpis').innerHTML = `
    <div class="econo-box"><div class="econo-val" style="color:var(--green)">${fmt(caTotal)}</div><div class="econo-lbl">CA du jour (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--g6)">${fmt(cashEncaisse)}</div><div class="econo-lbl">Encaissé (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--gold)">${fmt(creditAccorde)}</div><div class="econo-lbl">Crédit accordé (F)</div></div>
    <div class="econo-box"><div class="econo-val" style="color:var(--red)">${fmt(totDepenses)}</div><div class="econo-lbl">Dépenses (F)</div></div>
  `;

  // ── 4. Liste ventes du jour ────────────────────────
  document.getElementById('bj-ventes').innerHTML = V.length
    ? `<table class="tbl" style="font-size:11px"><thead><tr><th>Client</th><th>Produits</th><th class="num">Total</th><th class="num">Payé</th><th>Statut</th></tr></thead><tbody>
      ${V.map(v=>`<tr>
        <td><div style="font-weight:600">${v.client_nom||'—'}</div><div style="font-size:9px;color:var(--textm)">${(v.created_at||'').slice(11,16)}</div></td>
        <td style="font-size:10px">${v.formule_nom||''}</td>
        <td class="num" style="color:var(--gold)">${fmt(v.montant_total||0)} F</td>
        <td class="num" style="color:var(--green)">${fmt(v.montant_paye||0)} F</td>
        <td><span class="badge ${v.statut_paiement==='paye'?'bdg-g':v.statut_paiement==='partiel'?'bdg-gold':'bdg-r'}" style="font-size:9px">${v.statut_paiement==='paye'?'✅ Payée':v.statut_paiement==='partiel'?'⚠ Partiel':'❌ Impayée'}</span></td>
      </tr>`).join('')}
      <tr style="font-weight:700;background:rgba(22,163,74,.1)">
        <td colspan="2">TOTAL — ${V.length} ventes</td>
        <td class="num" style="color:var(--gold)">${fmt(caTotal)} F</td>
        <td class="num" style="color:var(--green)">${fmt(cashEncaisse)} F</td>
        <td></td>
      </tr>
    </tbody></table>`
    : '<div style="color:var(--textm);font-size:12px">Aucune vente ce jour.</div>';

  // ── 5. Liste dépenses du jour ──────────────────────
  document.getElementById('bj-depenses').innerHTML = D.length
    ? `<table class="tbl" style="font-size:11px"><thead><tr><th>Catégorie</th><th>Description</th><th class="num">Montant</th></tr></thead><tbody>
      ${D.map(d=>`<tr>
        <td style="font-weight:600;font-size:11px">${d.categorie||'—'}</td>
        <td style="font-size:10px">${d.description||''}</td>
        <td class="num" style="color:var(--red)">${fmt(d.montant||0)} F</td>
      </tr>`).join('')}
      <tr style="font-weight:700;background:rgba(239,68,68,.1)">
        <td colspan="2">TOTAL — ${D.length} dépenses</td>
        <td class="num" style="color:var(--red)">${fmt(totDepenses)} F</td>
      </tr>
    </tbody></table>`
    : '<div style="color:var(--textm);font-size:12px">Aucune dépense ce jour.</div>';

  // ── 6. Bilan + réconciliation caisse ────────────────
  // Cash attendu en caisse à la fin du jour = balance des mouvements de la journée
  // (les entrées et sorties incluent déjà les ventes encaissées + dépenses + apports)
  const cashAttendu = balanceJour;
  const margeBrute = caTotal - totDepenses;

  // Sauvegarder en mémoire pour comparer avec saisie utilisateur
  window._bj_cashAttendu = cashAttendu;

  document.getElementById('bj-bilan').innerHTML = `
    <!-- Section 1 : Flux caisse du jour -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
      <div style="background:rgba(22,163,74,.08);border:1px solid rgba(22,163,74,.3);border-radius:10px;padding:12px">
        <div style="font-size:10px;color:var(--textm);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Entrées caisse</div>
        <div style="font-size:18px;font-weight:800;color:var(--green)">+${fmt(entreesCaisse)} F</div>
        <div style="font-size:9px;color:var(--textm);margin-top:4px">${M.filter(m=>m.type==='entree').length} mouvement(s)</div>
      </div>
      <div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:10px;padding:12px">
        <div style="font-size:10px;color:var(--textm);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Sorties caisse</div>
        <div style="font-size:18px;font-weight:800;color:var(--red)">−${fmt(sortiesCaisse)} F</div>
        <div style="font-size:9px;color:var(--textm);margin-top:4px">${M.filter(m=>m.type==='sortie').length} mouvement(s)</div>
      </div>
      <div style="background:rgba(232,197,71,.12);border:2px solid var(--gold);border-radius:10px;padding:12px">
        <div style="font-size:10px;color:var(--textm);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Solde du jour</div>
        <div style="font-size:18px;font-weight:800;color:${balanceJour>=0?'var(--gold)':'var(--red)'}">${balanceJour>=0?'+':''}${fmt(balanceJour)} F</div>
        <div style="font-size:9px;color:var(--textm);margin-top:4px">Net entrées − sorties</div>
      </div>
    </div>

    <!-- Section 2 : Marge brute du jour -->
    <div style="background:rgba(34,197,94,.05);border-left:4px solid var(--green);border-radius:8px;padding:12px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:11px;color:var(--textm);text-transform:uppercase;letter-spacing:1px">Marge brute du jour</div>
          <div style="font-size:9px;color:var(--textm);margin-top:2px">CA ${fmt(caTotal)} − Dépenses ${fmt(totDepenses)}</div>
        </div>
        <div style="font-size:22px;font-weight:800;color:${margeBrute>=0?'var(--green)':'var(--red)'}">${margeBrute>=0?'+':''}${fmt(margeBrute)} F</div>
      </div>
    </div>

    <!-- Section 3 : RÉCONCILIATION CAISSE PHYSIQUE -->
    <div style="background:var(--card2);border:2px solid var(--gold);border-radius:12px;padding:16px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:var(--gold);margin-bottom:10px">🧮 Réconciliation caisse physique</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;align-items:end">
        <div>
          <label style="font-size:11px;color:var(--textm);display:block;margin-bottom:4px">Cash attendu (calculé)</label>
          <div style="font-size:18px;font-weight:700;color:var(--g6);padding:8px 10px;background:rgba(0,0,0,.15);border-radius:8px">${fmt(cashAttendu)} F</div>
        </div>
        <div>
          <label style="font-size:11px;color:var(--textm);display:block;margin-bottom:4px">💵 Cash compté physiquement (F)</label>
          <input type="number" id="bj-cash-compte" placeholder="0" oninput="bjCalcEcart()"
            style="font-size:18px;font-weight:700;padding:8px 10px;width:100%;border:2px solid var(--gold);border-radius:8px;background:rgba(232,197,71,.05);color:var(--gold)">
        </div>
        <div>
          <label style="font-size:11px;color:var(--textm);display:block;margin-bottom:4px">Écart</label>
          <div id="bj-ecart" style="font-size:18px;font-weight:700;padding:8px 10px;border-radius:8px;text-align:center;background:rgba(255,255,255,.05);color:var(--textm)">—</div>
        </div>
      </div>
      <div style="font-size:10px;color:var(--textm);margin-top:8px;line-height:1.4">
        💡 Comment ça marche : entre le montant cash physiquement présent dans la caisse maintenant.
        Si écart positif (+) = surplus inexpliqué. Si négatif (−) = manque dans la caisse à investiguer.
      </div>
    </div>

    <!-- Section 4 : Détail mouvements caisse -->
    ${M.length?`
    <div class="card-title" style="font-size:12px;color:var(--textm)">📋 Mouvements de caisse du jour</div>
    <table class="tbl" style="font-size:10px"><thead><tr><th>Heure</th><th>Type</th><th>Catégorie</th><th>Description</th><th class="num">Montant</th></tr></thead><tbody>
      ${M.map(m=>`<tr>
        <td style="font-family:'DM Mono',monospace">${(m.created_at||'').slice(11,16)}</td>
        <td><span class="badge ${m.type==='entree'?'bdg-g':'bdg-r'}" style="font-size:8px">${m.type==='entree'?'+ Entrée':'− Sortie'}</span></td>
        <td>${m.categorie||'—'}</td>
        <td style="font-size:10px">${m.description||''}</td>
        <td class="num" style="color:${m.type==='entree'?'var(--green)':'var(--red)'}">${m.type==='entree'?'+':'−'}${fmt(m.montant||0)} F</td>
      </tr>`).join('')}
    </tbody></table>`:''}
  `;
}

// Calcule l'écart entre cash compté et cash attendu
function bjCalcEcart(){
  const compte = +document.getElementById('bj-cash-compte')?.value || 0;
  const attendu = +window._bj_cashAttendu || 0;
  const ecart = compte - attendu;
  const el = document.getElementById('bj-ecart');
  if(!el) return;
  if(!compte){ el.textContent = '—'; el.style.color = 'var(--textm)'; el.style.background = 'rgba(255,255,255,.05)'; return; }
  if(Math.abs(ecart) < 1){
    el.innerHTML = '✅ OK';
    el.style.color = 'var(--green)';
    el.style.background = 'rgba(22,163,74,.15)';
  } else if(ecart > 0){
    el.innerHTML = `+${fmt(ecart)} F`;
    el.style.color = 'var(--gold)';
    el.style.background = 'rgba(232,197,71,.15)';
  } else {
    el.innerHTML = `${fmt(ecart)} F`;
    el.style.color = 'var(--red)';
    el.style.background = 'rgba(239,68,68,.15)';
  }
}
