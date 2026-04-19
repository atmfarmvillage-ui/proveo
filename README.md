# GP ERP — Gestion Provenderie Sadari

Logiciel de gestion provenderie SaaS — ATM Farm Village

## Structure

```
gp-erp/
├── index.html          # Structure HTML + navigation
├── css/
│   └── style.css       # Tous les styles
├── js/
│   ├── config.js       # Config Supabase + 24 formules SADARI
│   ├── auth.js         # Auth, session, boot, data loaders
│   ├── dashboard.js    # Tableau de bord
│   ├── stock.js        # Stock matières premières
│   ├── production.js   # Lots de production + Inventaire + Rapport
│   ├── ventes.js       # Ventes + Dépenses + Bilan + Remises
│   ├── clients.js      # Clients + Suivi + Classement
│   └── admin.js        # Formules + Prix + Équipe + Configuration
└── README.md
```

## Déploiement

1. Fork ce repo
2. Connecter à Netlify (Build & Deploy > Link to Git)
3. Renseigner URL et clé Supabase dans `js/config.js`
4. Appliquer `gp_schema_v2.sql` dans Supabase

## Stack

- Vanilla JS (ES6+)
- Supabase (auth + base de données + storage)
- Chart.js (graphiques)
- Netlify (hébergement)

## Contact

ATM Farm Village · (+228) 99313110 · avifarmer.net
