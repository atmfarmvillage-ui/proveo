# IMPACTON — Architecture & Patterns réutilisables

Recap de la stack, des patterns et des modules réutilisables pour bâtir une autre app du même type (PWA + Supabase + chat temps réel + push).

---

## 1. Pile technique

| Couche | Choix |
|---|---|
| **Frontend** | Vanilla JS (aucun framework), 1 fichier HTML, scripts en chaîne dans `<head>` |
| **Backend** | Supabase (Postgres + Auth + Realtime + Storage + Edge Functions) |
| **Auth** | Supabase Auth (numéro WhatsApp converti en email synthétique `<num>@impacton.app`) |
| **Realtime** | Supabase Realtime (postgres_changes + presence) |
| **Stockage** | Supabase Storage (buckets publics avec RLS) |
| **PDF** | `html2pdf.js` (CDN) — génération client-side |
| **Cartes** | Leaflet + OpenStreetMap (gratuit, sans clé API) |
| **Scanner code-barres** | `html5-qrcode` (CDN, ~80 Ko) pour scan caméra mobile |
| **Push** | Web Push API + Service Worker custom + VAPID + Supabase Edge Function |
| **PWA** | Manifest + Service Worker, théme adaptable (clair/sombre/auto) |

---

## 2. Arborescence des fichiers

```
/
├── index.html               (1 seul HTML, tous les scripts en chaîne)
├── manifest.json            (PWA)
├── sw.js                    (Service Worker — push uniquement, pas de cache)
├── public.html              (page publique standalone — partage WhatsApp)
├── css/
│   ├── variables.css        (couleurs, espacements — design tokens)
│   ├── base.css             (reset, body, h1-h6)
│   ├── animations.css       (keyframes : fadeIn, scaleIn, pulse)
│   ├── layout.css           (sidebar, topbar, content area)
│   ├── components.css       (boutons, cards, modal, tables, detail-print)
│   ├── screens.css          (styles spécifiques par écran)
│   └── responsive.css       (mobile + bottom nav)
├── supabase/
│   └── functions/
│       └── send-push/
│           └── index.ts     (Edge Function Deno : envoi web push via VAPID)
└── js/
    ├── config.js            (constantes globales : ICC.churches, ICC.departments, vapidPublicKey)
    ├── app.js               (bootstrap : login, init nav, restore session)
    ├── utils/
    │   ├── supabase.js      (init client : URL + anon key)
    │   ├── helpers.js       (qsa, el, initials, fmtDate, fmtFCFA, youtubeThumb)
    │   ├── whatsapp.js      (wa.me builders)
    │   └── animate.js       (animations on render)
    ├── modules/             (singletons réutilisables — un par responsabilité)
    │   ├── auth.js          (login/logout/restore + permissions)
    │   ├── nav.js           (sidebar + bottom-nav rendering par rôle)
    │   ├── router.js        (Router.register / Router.go avec animation)
    │   ├── modal.js         (Modal.open / Modal.close)
    │   ├── toast.js         (Toast.show)
    │   ├── notifications.js (notifs in-app : table + cloche topbar)
    │   ├── ecarts.js        (recoupement auto entre tables → crée notifs)
    │   ├── scope.js         (cloisonnement écriture par église)
    │   ├── view.js          (état "église visitée" + topbar switcher)
    │   ├── theme.js         (clair/sombre/auto persisté)
    │   ├── detail.js        (composant générique œil→PDF→WhatsApp)
    │   ├── chat.js          (subscribe/send Realtime + compression image + upload)
    │   └── push.js          (Web Push subscriptions client-side)
    └── screens/             (un fichier par écran, registered via Router)
        ├── dashboard.js
        ├── accueil.js
        ├── protocole.js
        ├── integration.js
        ├── comptabilite.js
        ├── solidarite.js
        ├── communication.js
        ├── departements.js  (liste des cartes)
        ├── departement-detail.js  (vue détail avec outils)
        ├── eglises.js
        ├── carte.js         (Leaflet map)
        ├── familles.js
        ├── impact-junior.js
        ├── comptes.js
        ├── chat-dept.js
        ├── chat-pasteurs.js
        ├── librairie-catalogue.js   (Phase A : CRUD articles + recherche + import CSV)
        ├── librairie-mouvements.js  (Phase B : entrées/sorties + alertes réappro)
        ├── librairie-caisse.js      (Phase C : panier + scan + ticket 80mm)
        ├── librairie-inventaire.js  (Phase D : snapshot + comptage + ajustement)
        └── librairie-historique.js  (Phase E : stock valorisé + top ventes + dormant + achats + export CSV)
```

---

## 3. Pattern d'écran (Router)

Chaque écran est un fichier JS qui s'enregistre auprès du Router :

```js
Router.register('mon_ecran', async () => {
  // 1. Charge les données nécessaires (Supabase queries en parallèle)
  const sb = getSupabase();
  const [res1, res2] = await Promise.all([
    sb.from('table1').select('*'),
    sb.from('table2').select('*'),
  ]);

  // 2. Retourne le HTML
  return `
    <div class="page-header animate-up">
      <h2 class="page-title">Mon écran</h2>
    </div>
    <div class="card animate-up stagger-1">
      ... contenu ...
    </div>
  `;
});

// Optionnel : code exécuté après le rendu (subscriptions, charts, etc.)
Router.register('mon_ecran_init', async () => {
  // Attache des listeners, lance des subscriptions Realtime, etc.
});

// Handlers globaux pour les onclick inline
async function monAction(id) {
  // ...
}
```

**Convention** : les `function foo()` au top-level deviennent globales → utilisables dans les `onclick="foo()"`.

---

## 4. Modules clés (réutilisables tels quels)

### Auth
- WhatsApp → email synthétique `<num>@impacton.app`
- `Auth.current` exposé partout : `{ id, name, role, churchId, deptId, ... }`
- Rôles dans une table `profiles` linkée à `auth.users.id`

### Scope (cloisonnement écriture)
```js
Scope.isGlobal()        // pasteur_principal ?
Scope.myEglise()        // churchId courant
Scope.canWrite(egId)    // OK si global ou même église
Scope.lockEgliseSelect(selectId)  // grise le select dans un modal
Scope.denyIfForeign(egId, msg)    // refuse une action + toast
```

### View (église visitée différente de l'église rattachée)
- Permet à un user de "visiter" une autre église en lecture seule
- État `viewingEgliseId` séparé de `Auth.churchId`
- Fidèles en "guest visit" → mode communication-only

### Detail (composant générique œil → PDF → WhatsApp)
```js
Detail.show({
  titre: 'Culte du 12/03',
  sousTitre: 'ICC Sanguera',
  sections: [
    { type: 'kv',    label: 'Infos',    data: { 'Orateur': 'Past. Doe' } },
    { type: 'table', label: 'Présence', cols: ['', 'H', 'F'], rows: [['PDS', 5, 3]] },
    { type: 'text',  label: 'Notes',    data: 'Texte libre' },
  ],
  partagerTexte: 'Résumé pour WhatsApp',  // optionnel
});
```
- Bouton "Imprimer/PDF" → ouvre fenêtre dédiée avec CSS A4 + `window.print()`
- Bouton "Envoyer (PDF + texte)" → html2pdf.js → Web Share API → WhatsApp attache le PDF directement (mobile)

### Notifications (in-app)
```js
Notifications.add({
  type: 'ecart' | 'validation' | 'info' | 'warning' | 'success',
  titre, message, lien,
  destinataire_id: userId,  // OU role_cible: 'pasteur_eglise'
  eglise_id,                // pour filtrer par église
});
```
- Cloche topbar avec badge compteur
- Panel modal avec liste
- Polling 60 sec

### Push (notifs système hors-app)
- VAPID + Service Worker `sw.js` + table `push_subscriptions`
- Client : `Push.enable() / .disable() / .openSettings()` (subscription PushManager)
- Client : `Push.sendToUsers(userIds[], title, body, opts)` (push directe)
- Client : `Push.sendToChannel(channelId, title, body, opts)` (Edge dérive les destinataires)
- Serveur : Edge Function `supabase/functions/send-push/index.ts` (Deno + web-push lib)
  - Mode A : reçoit `user_ids[]` → push direct
  - Mode B : reçoit `channel_id` → dérive les destinataires depuis le pattern de nom (`dept_corporate_*`, `pasteurs_*`, suffixe `_pays_*`)
  - Auto-cleanup : supprime les subscriptions 410/404 (devices désinstallés)
- Triggers auto :
  - `Notifications.add(...)` → après l'insert in-app, déclenche `Push.sendToUsers` ou (si role_cible) lookup + push
  - `Chat.send/sendImage/sendVideo` → après l'insert, déclenche `Push.sendToChannel`
- Secrets requis dans Supabase (Settings → Edge Functions → Secrets) :
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`

### Chat (Realtime + Storage)
```js
Chat.fetchMessages(channelId, limit)
Chat.send(channelId, content)
Chat.sendImage(channelId, file, caption)   // compression 1200px + upload
Chat.sendVideo(channelId, file, caption)   // upload tel quel
Chat.sendMedia(channelId, file, caption)   // dispatcher image/vidéo
Chat.subscribe(channelId, onMessage, onPresence)
Chat.openLightbox(url)
```

---

## 5. Conventions SQL

### Pattern RLS pragmatique
Sur toute nouvelle table, par défaut :
```sql
alter table ma_table enable row level security;
drop policy if exists auth_all on ma_table;
create policy auth_all on ma_table for all to authenticated using(true) with check(true);
```
Lecture/écriture ouverte aux authentifiés, restrictions au niveau client (Scope module).

### Cloisonnement par champ
Pour cloisonner par église / rôle / pays, fonction SECURITY DEFINER :
```sql
create or replace function chat_can_access(channel_id text) returns boolean as $$
declare my_role text; my_pays_slug text;
begin
  select p.role, chat_slug_pays(e.pays) into my_role, my_pays_slug
  from profiles p left join eglises e on e.id = p.eglise_id
  where p.id = auth.uid();
  -- ... logique de gating ...
  return true;
end;
$$ language plpgsql stable security definer set search_path = public;
```
Puis :
```sql
create policy chat_read on chat_messages for select to authenticated
  using (chat_can_access(channel_id));
```

### Storage public + RLS
```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mon_bucket', 'mon_bucket', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = true;

create policy bucket_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'mon_bucket');
create policy bucket_read on storage.objects for select to public
  using (bucket_id = 'mon_bucket');
```

### Realtime sur une table
```sql
alter publication supabase_realtime add table chat_messages;
```
Et côté client :
```js
sb.channel('chat:' + channelId)
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${channelId}` },
    payload => handleMsg(payload.new))
  .subscribe();
```

### Cron (pg_cron) pour cleanup auto
```sql
create extension if not exists pg_cron;
select cron.schedule('cleanup-old-x', '0 3 * * *',
  $$ delete from ma_table where created_at < now() - interval '14 days' $$);
```

---

## 6. Hiérarchie de scope (clé de l'app multi-tenant)

### Rôles
- `pasteur_principal` — accès global (toutes les églises)
- `pasteur_eglise` — accès à son église (`profiles.eglise_id`)
- `chef_departement` — son dept + son église
- `membre_departement` — son dept + son église
- `berger_disciple` — son église, accès limité
- `fidele` — son église, accès consommation
- `pending` — en attente de validation

### Hiérarchie d'églises
- `eglises.niveau` : `'mondiale'` | `'pays'` | `'locale'`
- Mondiale = siège, peut publier en portée mondiale
- Pays = principale d'un pays, peut publier en portée pays
- Locale = église normale

### Hiérarchie de publications
- `publications.portee` : `'mondiale'` | `'pays'` | `'locale'`
- Filtre OR client : `eglise_id=mienne OR portee=mondiale OR (portee=pays AND pays=monpays)`

### Hiérarchie des chats
- `dept_corporate_<dept>` (mondial dept) — tous les stars de ce dept
- `dept_corporate_<dept>_pays_<pays>` (dept par pays) — stars de ce dept dans ce pays
- `pasteurs_global` (mondial pasteurs) — tous les pasteurs
- `pasteurs_pays_<pays>` (pasteurs par pays) — pasteurs de ce pays

---

## 7. Nav par rôle (config dans `js/modules/nav.js`)

Structure : `Nav.items[role] = [{ section, links: [{ id, label, icon, badge?, requireDept? }] }]`

- `badge` : nom d'un compteur dans `{badges}` passé à `Nav.render(role, badges)`
- `requireDept` : ne montre le lien que si `Auth.deptId === requireDept`

Architecture choisie pour cette app : **tout part de "Départements"** (les écrans fonctionnels Accueil/Compta/Protocole/etc. sont accessibles via le détail d'un département, pas directement dans le menu).

---

## 8. Patterns récurrents dans les écrans

### Header animé
```html
<div class="page-header animate-up">
  <h2 class="page-title">Titre</h2>
  <p class="page-sub">Sous-titre</p>
</div>
```

### Card avec head + body
```html
<div class="card animate-up stagger-1">
  <div class="card-head">
    <span class="card-title">Mon titre</span>
    <span class="badge badge-pending">42</span>
  </div>
  <div class="member-list">
    <div class="member-row">
      <div class="avatar">XY</div>
      <div class="member-info">
        <div class="member-name">Nom</div>
        <div class="member-detail">Détail</div>
      </div>
      <div class="member-actions">
        <button class="btn-icon"><i class="ti ti-edit"></i></button>
      </div>
    </div>
  </div>
</div>
```

### KPI grid
```html
<div class="amount-grid">
  <div class="amount-card">
    <div class="amount-label">Label</div>
    <div class="amount-value" style="color:var(--primary)">42</div>
  </div>
</div>
```

### Empty state
```html
<div class="empty-state">
  <div class="empty-state-icon"><i class="ti ti-x"></i></div>
  <div class="empty-title">Rien à afficher</div>
  <div class="empty-desc">Explication courte</div>
</div>
```

---

## 9. Fonctionnalités livrées (recap par chantier)

### Cœur fonctionnel
1. **Auth WhatsApp** — numéro → email synthétique, RLS sur `profiles`
2. **Multi-rôles** — 7 rôles avec menus distincts
3. **Multi-églises** — hiérarchie mondiale/pays/locale + cloisonnement écriture
4. **Validation pastorale** — workflow Soumis → Validé/Rejeté avec commentaire

### Modules métier (écrans)
- **Accueil** — saisie stats (fiches culte/réunion identiques au papier)
- **Protocole** — validation des soumissions
- **Intégration** — suivi nouveaux venus + messages WhatsApp templated
- **Comptabilité** — collectes + demandes de budget (cloisonnée par église)
- **Solidarité** — dons, kits, demandes d'aide
- **Communication** — publications avec portée + modèles WhatsApp + partage public
- **Familles de disciple** — création + gestion membres + bergers
- **Impact Junior** — saisie indépendante des juniors + recoupement auto avec Accueil
- **Comptes** — admin des accès (pasteur principal)
- **Églises** — gestion réseau + géoloc + niveau
- **Carte** — Leaflet + tous les marqueurs + "Trouvez l'église la plus proche"

### Composants transverses
- **Composant Detail** (œil → PDF → WhatsApp) appliqué sur 5 écrans
- **Module Notifications** (in-app + cloche topbar)
- **Module Ecarts** (recoupement auto entre tables → crée notifs)
- **Système de famille de disciple** (avec validation berger)
- **Hiérarchie publications** (portée locale/pays/mondiale)
- **Topbar switcher d'église** (view une autre église en lecture)

### Chat temps réel
- **Chat département corporate** (1 channel par dept par scope)
- **Chat pasteurs** (channel réservé aux pasteurs)
- **Scopes** : mondial + par pays
- **Médias** : photos (compression 1200px JPEG 85%) + vidéos (max 50 Mo)
- **Présence en ligne** (Supabase Realtime Presence)
- **Sécurité RLS dure** (fonction Postgres `chat_can_access` qui check role + pays)
- **Badges** : 🌍 Pasteur principal · 🏳 National · ⛪ Local · ⭐ Chef · 🟢 En ligne

### Push notifications (PWA)
- VAPID keys + Service Worker (`sw.js`)
- Table `push_subscriptions` (1 user × N devices)
- Module `Push` : `enable() / disable() / openSettings()`
- **Step B à compléter** : Supabase Edge Function `send-push` (Deno + lib web-push)

### Librairie (département complet — 5 sous-écrans)
Mini POS + gestion stock à l'intérieur du dept "Librairie". Cloisonné par église.
- **Catalogue** (`librairie_catalogue`) : CRUD articles (titre, auteur, ISBN, code-barres, prix achat/vente, stock, seuil alerte) + recherche temps réel + **import CSV** en masse
- **Mouvements de stock** (`librairie_mouvements`) : entrées fournisseur + sorties (perte/casse/don/ajustement) + section "à réapprovisionner" auto + historique 100 derniers filtré
- **Caisse / Vente** (`librairie_caisse`) : panier 2 colonnes + scan code-barres (clavier-douchette ET caméra mobile html5-qrcode) + recherche + ticket 80mm thermique imprimable
- **Inventaire physique** (`librairie_inventaire`) : snapshot stock théorique → comptage progressif auto-save → validation ajuste stocks via mouvement type `inventaire`
- **Historique & rapports** (`librairie_historique`) : 4 onglets (stock valorisé / top ventes / stock dormant >90j / achats fournisseurs) + export CSV Excel (BOM UTF-8)

**Tables Librairie (5 tables, cloisonnées par `eglise_id text`) :**
- `librairie_articles` — catalogue (id, titre, auteur, isbn, code_barre, prix_achat, prix_vente, stock_actuel, seuil_alerte, actif)
- `librairie_mouvements` — log de tous les mouvements (type IN entree|sortie|vente|inventaire|ajustement, quantite signée, prix_unitaire, fournisseur, motif, vente_id)
- `librairie_ventes` — en-tête de vente (numero auto, vendeur_id/nom, client_nom, total, paiement IN espece|mobile|autre)
- `librairie_vente_lignes` — détail vente (vente_id, article_id, titre_snapshot, quantite, prix_unitaire, total_ligne)
- `librairie_inventaires` + `librairie_inventaire_lignes` — sessions d'inventaire (statut en_cours|valide|annule, snapshot qte_theorique, qte_comptee, ecart)

**Pattern transactionnel** (caisse) :
1. Insert `librairie_ventes` (en-tête)
2. Insert `librairie_vente_lignes` (1 ligne par article)
3. Insert `librairie_mouvements` (type='vente', quantite=-qte, vente_id=…)
4. Update `librairie_articles.stock_actuel` (decrement)
5. Génération ticket 80mm imprimable dans une fenêtre `window.print()`

---

## 10. Décisions architecturales clés (pourquoi telle chose plutôt que telle autre)

| Décision | Pourquoi |
|---|---|
| Vanilla JS, pas de framework | App PWA simple, déploiement statique, pas de build step, easy à debug |
| 1 HTML + scripts en chaîne | Pas de bundler, F5 = nouvelle version chargée |
| SW sans cache fetch | Évite les bugs "ancien code servi" en dev. Seule responsabilité = push notif |
| Supabase au lieu de Firebase/custom backend | Postgres + Auth + Realtime + Storage + Edge — tout-en-un, gratuit pour démarrer |
| RLS pragmatique (auth_all) par défaut | On commence ouvert, on durcit ensuite avec des policies spécifiques |
| Compression photo client + upload Storage | Évite de bouffer la BDD avec des blobs, scalable |
| html2pdf pour PDF client-side | Pas de backend PDF, marche partout |
| Web Share API pour partager PDF WhatsApp | Mobile : marche super bien. Desktop : fallback download |
| Realtime Postgres CDC pour le chat | Pas besoin de WebSocket server custom, RLS s'applique automatiquement |
| pg_cron pour cleanup auto | Pas de cron externe à gérer |
| Leaflet + OpenStreetMap | Gratuit, pas de clé API, marche partout |

---

## 10b. Edge Function push : génération clés + déploiement

### Génération des clés VAPID (une fois)
```bash
npx web-push generate-vapid-keys --json
# → { "publicKey": "B...", "privateKey": "..." }
```
- `publicKey` → dans `config.js` (`ICC.vapidPublicKey`)
- `privateKey` → JAMAIS dans le code, va dans les secrets Supabase

### Déploiement de l'Edge Function

**Option Dashboard (sans CLI) :**
1. https://supabase.com/dashboard/project/{ref}/functions → "Create a new function" → nom `send-push`
2. Copier-coller le contenu de `supabase/functions/send-push/index.ts` → Deploy
3. Settings → Edge Functions → Secrets :
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`

**Option CLI :**
```bash
scoop install supabase  # ou télécharger le binaire depuis github.com/supabase/cli/releases
supabase login
supabase link --project-ref <YOUR_REF>
supabase secrets set VAPID_PUBLIC_KEY=...
supabase secrets set VAPID_PRIVATE_KEY=...
supabase secrets set VAPID_EMAIL=mailto:admin@...
supabase functions deploy send-push
```

### Convention de nommage des channels (pour Mode B de l'Edge)
| Channel ID | Destinataires dérivés |
|---|---|
| `dept_corporate_<dept>` | profiles where `departement = <dept>` + tous pasteurs |
| `dept_corporate_<dept>_pays_<pays>` | idem + filtre `eglise.pays = <pays>` |
| `pasteurs_global` | profiles where `role IN ('pasteur_principal','pasteur_eglise')` |
| `pasteurs_pays_<pays>` | idem + filtre pays |

Le slug pays est normalisé : NFD + suppression diacritiques + remplacement non-alphanumériques par `_` (ex: "Bénin" → "Benin", "Côte d'Ivoire" → "Cote_d_Ivoire").

---

## 11. Quick-start pour cloner ce modèle dans une autre app

1. Créer un nouveau projet Supabase (URL + anon key)
2. Copier le squelette `index.html` + `js/` + `css/` + `sw.js` + `manifest.json`
3. Renommer les références "IMPACTON" / "ICC" / etc.
4. Adapter `config.js` (constantes métier : rôles, sections, etc.)
5. Créer les tables métier en SQL (avec le pattern `auth_all`)
6. Ajouter les écrans dans `js/screens/` + register au Router
7. Mettre à jour `Nav.items` selon les rôles
8. Décliner les modules transverses (Detail, Notifications, Chat) selon le besoin
9. Pour le chat : reuse `chat_messages` schema + module `Chat` quasi tel quel
10. Pour les push : générer VAPID keys + setup Edge Function (template à venir Step B)

---

## 12. Mémoire de session (vocabulaire)

- **Star** = membre actif d'un département (pas une étoile/note)
- **Famille de disciple** = petit groupe pastoral encadré par un Berger
- **Berger** = responsable d'une famille de disciple
- **PDS** = Prière De Sanctification (temps avant le culte)
- **TAJ** = Total Avec Juniors
- **NC** = Nouveaux Convertis · **NV** = Nouveaux Venus
- **Impact Junior** = département enfants (saisie indépendante pour recoupement)

---

Document maintenu manuellement — à mettre à jour à chaque ajout structurel important.
