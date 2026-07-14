C.E.M.M. PROFESSIONNEL — INSTALLATION

1. Dans Firebase : Cloud Firestore > Règles.
2. Remplacer toutes les règles par le contenu de firestore.rules, puis Publier.
3. Décompresser et publier le dossier complet sur Netlify.
4. Créer ton propre compte dans l'application.
5. Firebase > Authentication > Utilisateurs : copier ton UID.
6. Firestore > users > document portant ton UID, modifier :
   role = admin
   status = approved
   payment = paid
7. Recharger l'application.

Les élèves créent leur compte. Tu les approuves depuis l'espace administrateur.
Les documents utilisent des liens HTTPS vers les PDF.
