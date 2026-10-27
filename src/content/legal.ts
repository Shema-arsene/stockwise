// Terms & Conditions and Privacy Policy (draft). Plain language, written for StockWise under the
// laws of Rwanda. Have a qualified lawyer review before launch; update LAST_UPDATED on every change.

export const LAST_UPDATED = "2026-10-21";
export const CONTACT_WHATSAPP = "+250 781 782 250";

export interface LegalDoc {
  title: string;
  intro: string;
  sections: { heading: string; body: string[] }[];
}

type Docs = { terms: LegalDoc; privacy: LegalDoc };

const en: Docs = {
  terms: {
    title: "Terms and Conditions",
    intro:
      "These terms explain the rules for using StockWise, the bookkeeping and stock control service for shops (\"StockWise\", \"we\", \"us\"). By creating an account or using StockWise you agree to them. If you use StockWise for a shop, you accept these terms on behalf of that shop.",
    sections: [
      {
        heading: "1. The service",
        body: [
          "StockWise lets shops record sales, purchases, stock, customer debts and staff, see reports, and keep working without internet. Features may change as we improve the service; we will not remove core features you rely on without reasonable notice.",
          "StockWise is a record-keeping tool. It is not accounting, tax or legal advice. You remain responsible for your books, tax returns and compliance, including with the Rwanda Revenue Authority, the Zambia Revenue Authority or any other authority that applies to you.",
        ],
      },
      {
        heading: "2. Accounts",
        body: [
          "You must give accurate information and keep your password, and any staff logins you create, private. You are responsible for everything done through accounts in your shop.",
          "A shop owner can add managers and cashiers and decide what they can do. Owners are responsible for the staff they add and for removing access when someone leaves.",
          "You must be at least 18 years old, or the legal age to enter contracts where you live, to open a shop.",
        ],
      },
      {
        heading: "3. Packages and payment",
        body: [
          "StockWise offers Starter, Business and Pro packages as described on the Pricing page. During early access all packages are free.",
          "Before any paid plan starts we will tell you at least 30 days in advance, explain the price and how to pay, and you can choose to continue, change package or stop. Early users will keep a discount as announced.",
          "Unless the law requires otherwise, fees already paid are not refundable, but you can cancel at any time and keep access until the end of the paid period.",
        ],
      },
      {
        heading: "4. Your data",
        body: [
          "The records you enter (products, sales, customers, debts and so on) belong to you. You give us permission to store and process them only to run, secure and improve StockWise for you.",
          "You can download your data at any time using the reports and activity log downloads. How we handle personal information is explained in our Privacy Policy.",
          "Every action in StockWise is written to an activity log that cannot be edited or deleted. This protects you and your shop from fraud and mistakes.",
        ],
      },
      {
        heading: "5. Acceptable use",
        body: [
          "Do not use StockWise for anything illegal, to record goods or sales you know are unlawful, to break into other people's accounts or shops, to overload or disrupt the service, or to copy or resell it.",
          "We may suspend a shop or account that breaks these rules, puts other users at risk, or is required to be suspended by law. Where possible we will tell you why and give you a chance to fix the problem first.",
        ],
      },
      {
        heading: "6. Offline use",
        body: [
          "StockWise saves your work on your device when there is no internet and sends it when you reconnect. Work that has not yet been sent can be lost if the device is lost, reset or signed out. Connect regularly so your records are safely backed up.",
        ],
      },
      {
        heading: "7. Availability and support",
        body: [
          "We work to keep StockWise available and your data safe, including regular backups, but we cannot promise the service will never be interrupted. Support is available on WhatsApp at " + CONTACT_WHATSAPP + ".",
        ],
      },
      {
        heading: "8. Liability",
        body: [
          "StockWise is provided \"as is\". To the extent the law allows, we are not liable for indirect losses such as lost profits, lost sales or business interruption, and our total liability for any claim is limited to the fees you paid us in the 12 months before the claim (or 50,000 Rwandan francs if you paid nothing).",
          "Nothing in these terms limits liability that cannot be limited by law, including for fraud or for death or injury caused by negligence.",
        ],
      },
      {
        heading: "9. Ending your use",
        body: [
          "You can stop using StockWise at any time. Ask us on WhatsApp to close your shop; we will give you a chance to download your data first, and then delete it as described in the Privacy Policy, except for records we must keep by law.",
        ],
      },
      {
        heading: "10. Changes to these terms",
        body: [
          "We may update these terms. If a change matters to you we will tell you in the app at least 14 days before it takes effect. Continuing to use StockWise after that means you accept the new terms.",
        ],
      },
      {
        heading: "11. Law and disputes",
        body: [
          "These terms are governed by the laws of the Republic of Rwanda. We will first try to resolve any disagreement with you directly and in good faith. If that fails, the competent courts of Rwanda will decide, unless the law where you live gives you the right to go to your own courts.",
        ],
      },
      {
        heading: "12. Contact",
        body: ["Questions about these terms: WhatsApp " + CONTACT_WHATSAPP + "."],
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    intro:
      "This policy explains what personal information StockWise collects, why, how long we keep it, and your rights. We follow Rwanda's Law No. 058/2021 of 13/10/2021 relating to the protection of personal data and privacy, and respect the data protection laws of the other countries where our users work.",
    sections: [
      {
        heading: "1. Who we are",
        body: [
          "StockWise is responsible for the personal information described here. For shop records (for example your customers' names and debts), the shop is in charge of that information and StockWise processes it on the shop's behalf.",
        ],
      },
      {
        heading: "2. What we collect",
        body: [
          "Account information: your name, email address or username, and a securely scrambled (hashed) password. We never store passwords in readable form.",
          "Shop records you enter: products, prices, stock, sales, purchases, suppliers, customers (names and phone numbers) and their debts and payments.",
          "Activity and security information: what was done, by whom, when, from which device, and the IP address, including sign-ins and failed sign-in attempts.",
          "Device information needed to work offline, stored in your own browser on your device.",
        ],
      },
      {
        heading: "3. Why we use it",
        body: [
          "To provide StockWise: keeping your records, syncing your devices, producing reports and letting your staff work with the right permissions.",
          "To keep accounts and shops secure: detecting misuse, locking accounts after repeated wrong passwords, and keeping an activity log that cannot be altered.",
          "To support you and to tell you about important changes, such as new terms or paid plans.",
          "We do not sell your personal information, and we do not use your shop records for advertising.",
        ],
      },
      {
        heading: "4. Legal basis",
        body: [
          "We process personal information to perform our agreement with you (providing the service), to meet legal obligations, for our legitimate interest in keeping StockWise secure, and with your consent where the law requires it.",
        ],
      },
      {
        heading: "5. Who can see it",
        body: [
          "People in your shop, according to their role: owners see everything in their shop; managers see the branches they run; cashiers see only what they need to sell and cannot see costs or profit.",
          "StockWise staff (our founder and authorised support staff) can see account and shop information to provide support and keep the service safe. They cannot change your shop's sales, stock or debts, and their actions are recorded in the activity log.",
          "Service providers that help us run StockWise, such as cloud hosting and database providers, only on our instructions and under confidentiality and security obligations.",
          "Authorities, only when the law requires it.",
        ],
      },
      {
        heading: "6. Where it is stored",
        body: [
          "Our servers and database are hosted with reputable cloud providers in the European Union (Frankfurt, Germany). This means your information is transferred outside Rwanda. We do this with appropriate safeguards and protections in line with Rwandan law and its supervisory authority.",
          "Information is encrypted while it travels between your device and our servers.",
        ],
      },
      {
        heading: "7. How long we keep it",
        body: [
          "We keep your account and shop records while your shop is active. If you close your shop we delete or anonymise its records within 90 days, except what we must keep longer by law (for example tax-related records) or to resolve disputes.",
          "Activity log entries are kept for as long as the shop exists, because they protect against fraud. Deactivated accounts are kept, not deleted, so history stays complete; you can ask for their personal details to be removed.",
        ],
      },
      {
        heading: "8. Your rights",
        body: [
          "You can ask to see the personal information we hold about you, to correct it, to have it deleted, to restrict or object to its processing, and to receive a copy to take elsewhere. You can withdraw consent where we rely on it.",
          "Customers and staff of a shop should first contact the shop owner, who is in charge of that shop's records; we will help the owner respond.",
          "If you are not satisfied with our answer, you can complain to the National Cyber Security Authority (NCSA), Rwanda's data protection supervisory authority, or to the authority in your own country.",
        ],
      },
      {
        heading: "9. Security",
        body: [
          "We use hashed passwords, encrypted connections, strict separation between shops, role-based permissions, account lockout after repeated wrong passwords, regular backups, and a tamper-proof activity log. No system is perfectly secure; if a breach affects your information we will tell you and the authorities as the law requires.",
        ],
      },
      {
        heading: "10. Children",
        body: ["StockWise is for businesses and is not meant for children under 18."],
      },
      {
        heading: "11. Changes",
        body: [
          "We may update this policy. Important changes will be announced in the app before they take effect. The date at the top shows the latest version.",
        ],
      },
      {
        heading: "12. Contact",
        body: ["Privacy questions or requests: WhatsApp " + CONTACT_WHATSAPP + "."],
      },
    ],
  },
};

const fr: Docs = {
  terms: {
    title: "Conditions générales d'utilisation",
    intro:
      "Ces conditions expliquent les règles d'utilisation de StockWise, le service de comptabilité et de gestion de stock pour les boutiques (« StockWise », « nous »). En créant un compte ou en utilisant StockWise, vous les acceptez. Si vous utilisez StockWise pour une boutique, vous les acceptez au nom de cette boutique.",
    sections: [
      {
        heading: "1. Le service",
        body: [
          "StockWise permet aux boutiques d'enregistrer ventes, achats, stock, dettes des clients et personnel, de consulter des rapports et de travailler sans Internet. Les fonctionnalités peuvent évoluer ; nous ne retirerons pas une fonction essentielle sans préavis raisonnable.",
          "StockWise est un outil de tenue de registres. Ce n'est pas un conseil comptable, fiscal ou juridique. Vous restez responsable de vos comptes, déclarations fiscales et obligations, notamment envers l'Office rwandais des recettes (RRA), l'Autorité fiscale zambienne (ZRA) ou toute autre autorité compétente.",
        ],
      },
      {
        heading: "2. Comptes",
        body: [
          "Vous devez fournir des informations exactes et garder confidentiels votre mot de passe et les accès que vous créez pour votre personnel. Vous êtes responsable de tout ce qui est fait avec les comptes de votre boutique.",
          "Le propriétaire peut ajouter des gérants et des caissiers et décider de leurs droits. Il est responsable du personnel qu'il ajoute et doit retirer l'accès de quiconque quitte la boutique.",
          "Vous devez avoir au moins 18 ans, ou l'âge légal pour contracter dans votre pays, pour ouvrir une boutique.",
        ],
      },
      {
        heading: "3. Formules et paiement",
        body: [
          "StockWise propose les formules Starter, Business et Pro décrites sur la page Tarifs. Pendant l'accès anticipé, toutes les formules sont gratuites.",
          "Avant le début de toute formule payante, nous vous préviendrons au moins 30 jours à l'avance, avec le prix et les modalités de paiement ; vous pourrez continuer, changer de formule ou arrêter. Les premiers utilisateurs garderont la réduction annoncée.",
          "Sauf obligation légale contraire, les sommes déjà payées ne sont pas remboursables, mais vous pouvez résilier à tout moment et garder l'accès jusqu'à la fin de la période payée.",
        ],
      },
      {
        heading: "4. Vos données",
        body: [
          "Les données que vous saisissez (produits, ventes, clients, dettes…) vous appartiennent. Vous nous autorisez à les stocker et à les traiter uniquement pour faire fonctionner, sécuriser et améliorer StockWise pour vous.",
          "Vous pouvez télécharger vos données à tout moment grâce aux téléchargements des rapports et du journal d'activité. Le traitement des informations personnelles est expliqué dans notre Politique de confidentialité.",
          "Chaque action dans StockWise est inscrite dans un journal d'activité qui ne peut être ni modifié ni supprimé, ce qui protège votre boutique contre la fraude et les erreurs.",
        ],
      },
      {
        heading: "5. Utilisation acceptable",
        body: [
          "N'utilisez pas StockWise à des fins illégales, pour enregistrer des biens ou ventes que vous savez illicites, pour accéder aux comptes ou boutiques d'autrui, pour surcharger ou perturber le service, ni pour le copier ou le revendre.",
          "Nous pouvons suspendre une boutique ou un compte qui enfreint ces règles, met d'autres utilisateurs en danger ou dont la suspension est exigée par la loi. Dans la mesure du possible, nous vous en expliquerons la raison et vous laisserons corriger le problème d'abord.",
        ],
      },
      {
        heading: "6. Utilisation hors ligne",
        body: [
          "Sans Internet, StockWise enregistre votre travail sur l'appareil et l'envoie dès la reconnexion. Un travail non encore envoyé peut être perdu si l'appareil est perdu, réinitialisé ou déconnecté. Connectez-vous régulièrement pour que vos données soient sauvegardées.",
        ],
      },
      {
        heading: "7. Disponibilité et assistance",
        body: [
          "Nous nous efforçons de garder StockWise disponible et vos données en sécurité, avec des sauvegardes régulières, mais nous ne pouvons garantir l'absence totale d'interruption. L'assistance est disponible sur WhatsApp au " + CONTACT_WHATSAPP + ".",
        ],
      },
      {
        heading: "8. Responsabilité",
        body: [
          "StockWise est fourni « en l'état ». Dans la mesure permise par la loi, nous ne sommes pas responsables des pertes indirectes (manque à gagner, ventes perdues, interruption d'activité), et notre responsabilité totale est limitée aux sommes payées au cours des 12 mois précédant la réclamation (ou 50 000 francs rwandais si vous n'avez rien payé).",
          "Rien dans ces conditions ne limite une responsabilité qui ne peut l'être légalement, notamment en cas de fraude ou de décès ou blessure causés par négligence.",
        ],
      },
      {
        heading: "9. Fin de l'utilisation",
        body: [
          "Vous pouvez cesser d'utiliser StockWise à tout moment. Demandez-nous sur WhatsApp de fermer votre boutique ; nous vous laisserons d'abord télécharger vos données, puis nous les supprimerons comme décrit dans la Politique de confidentialité, sauf ce que la loi nous oblige à conserver.",
        ],
      },
      {
        heading: "10. Modifications",
        body: [
          "Nous pouvons modifier ces conditions. Si un changement vous concerne, nous vous en informerons dans l'application au moins 14 jours avant son entrée en vigueur. Continuer à utiliser StockWise ensuite vaut acceptation.",
        ],
      },
      {
        heading: "11. Droit applicable et litiges",
        body: [
          "Ces conditions sont régies par les lois de la République du Rwanda. Nous chercherons d'abord à résoudre tout désaccord directement et de bonne foi. À défaut, les juridictions compétentes du Rwanda trancheront, sauf si la loi de votre pays vous donne le droit de saisir vos propres tribunaux.",
        ],
      },
      {
        heading: "12. Contact",
        body: ["Questions sur ces conditions : WhatsApp " + CONTACT_WHATSAPP + "."],
      },
    ],
  },
  privacy: {
    title: "Politique de confidentialité",
    intro:
      "Cette politique explique quelles informations personnelles StockWise collecte, pourquoi, combien de temps nous les gardons et quels sont vos droits. Nous respectons la loi rwandaise n° 058/2021 du 13/10/2021 relative à la protection des données à caractère personnel et de la vie privée, ainsi que les lois des autres pays où nos utilisateurs travaillent.",
    sections: [
      {
        heading: "1. Qui sommes-nous",
        body: [
          "StockWise est responsable des informations personnelles décrites ici. Pour les données d'une boutique (par exemple les noms et dettes de ses clients), c'est la boutique qui en est responsable et StockWise les traite pour son compte.",
        ],
      },
      {
        heading: "2. Ce que nous collectons",
        body: [
          "Informations de compte : votre nom, votre e-mail ou identifiant, et un mot de passe brouillé de façon sécurisée (haché). Nous ne stockons jamais les mots de passe en clair.",
          "Données de la boutique que vous saisissez : produits, prix, stock, ventes, achats, fournisseurs, clients (noms et téléphones), leurs dettes et paiements.",
          "Informations d'activité et de sécurité : ce qui a été fait, par qui, quand, depuis quel appareil, et l'adresse IP, y compris les connexions et tentatives échouées.",
          "Informations nécessaires au fonctionnement hors ligne, stockées dans votre propre navigateur sur votre appareil.",
        ],
      },
      {
        heading: "3. Pourquoi nous les utilisons",
        body: [
          "Pour fournir StockWise : conserver vos données, synchroniser vos appareils, produire des rapports et permettre à votre personnel de travailler avec les bons droits.",
          "Pour sécuriser les comptes et boutiques : détecter les abus, bloquer les comptes après plusieurs mots de passe erronés et tenir un journal d'activité inaltérable.",
          "Pour vous assister et vous informer des changements importants, comme de nouvelles conditions ou des formules payantes.",
          "Nous ne vendons pas vos informations personnelles et n'utilisons pas les données de votre boutique à des fins publicitaires.",
        ],
      },
      {
        heading: "4. Base légale",
        body: [
          "Nous traitons les informations personnelles pour exécuter notre contrat avec vous (fournir le service), respecter nos obligations légales, pour notre intérêt légitime à sécuriser StockWise, et avec votre consentement lorsque la loi l'exige.",
        ],
      },
      {
        heading: "5. Qui peut les voir",
        body: [
          "Les personnes de votre boutique, selon leur rôle : le propriétaire voit tout dans sa boutique ; les gérants voient les succursales qu'ils gèrent ; les caissiers voient seulement ce dont ils ont besoin pour vendre et ne voient ni coûts ni bénéfices.",
          "Le personnel de StockWise (notre fondateur et le personnel d'assistance autorisé) peut voir les informations de compte et de boutique pour vous assister et sécuriser le service. Il ne peut pas modifier les ventes, le stock ni les dettes de votre boutique, et ses actions sont inscrites dans le journal d'activité.",
          "Les prestataires qui nous aident à faire fonctionner StockWise, comme l'hébergement cloud et la base de données, uniquement sur nos instructions et avec des obligations de confidentialité et de sécurité.",
          "Les autorités, uniquement lorsque la loi l'exige.",
        ],
      },
      {
        heading: "6. Où elles sont stockées",
        body: [
          "Nos serveurs et notre base de données sont hébergés par des fournisseurs cloud reconnus dans l'Union européenne (Francfort, Allemagne). Vos informations sont donc transférées hors du Rwanda, avec des garanties et protections appropriées conformément à la loi rwandaise et à son autorité de contrôle.",
          "Les informations sont chiffrées pendant leur transfert entre votre appareil et nos serveurs.",
        ],
      },
      {
        heading: "7. Durée de conservation",
        body: [
          "Nous gardons votre compte et les données de votre boutique tant qu'elle est active. Si vous fermez votre boutique, nous supprimons ou anonymisons ses données sous 90 jours, sauf ce que la loi nous oblige à garder plus longtemps (par exemple les données fiscales) ou ce qui est nécessaire pour régler un litige.",
          "Les entrées du journal d'activité sont conservées aussi longtemps que la boutique existe, car elles protègent contre la fraude. Les comptes désactivés sont conservés, pas supprimés, pour garder un historique complet ; vous pouvez demander la suppression de leurs données personnelles.",
        ],
      },
      {
        heading: "8. Vos droits",
        body: [
          "Vous pouvez demander à consulter les informations personnelles que nous détenons sur vous, à les corriger, à les supprimer, à limiter ou contester leur traitement, et à en recevoir une copie. Vous pouvez retirer votre consentement lorsque nous nous appuyons sur celui-ci.",
          "Les clients et le personnel d'une boutique doivent d'abord s'adresser au propriétaire, responsable des données de cette boutique ; nous l'aiderons à répondre.",
          "Si notre réponse ne vous satisfait pas, vous pouvez saisir la National Cyber Security Authority (NCSA), autorité rwandaise de protection des données, ou l'autorité de votre pays.",
        ],
      },
      {
        heading: "9. Sécurité",
        body: [
          "Nous utilisons des mots de passe hachés, des connexions chiffrées, une séparation stricte entre boutiques, des droits par rôle, le blocage des comptes après plusieurs mots de passe erronés, des sauvegardes régulières et un journal d'activité infalsifiable. Aucun système n'est parfaitement sûr ; en cas de violation affectant vos informations, nous vous en informerons, ainsi que les autorités, comme la loi l'exige.",
        ],
      },
      {
        heading: "10. Enfants",
        body: ["StockWise est destiné aux entreprises et non aux enfants de moins de 18 ans."],
      },
      {
        heading: "11. Modifications",
        body: [
          "Nous pouvons modifier cette politique. Les changements importants seront annoncés dans l'application avant leur entrée en vigueur. La date en haut indique la dernière version.",
        ],
      },
      {
        heading: "12. Contact",
        body: ["Questions ou demandes relatives à la vie privée : WhatsApp " + CONTACT_WHATSAPP + "."],
      },
    ],
  },
};

export const LEGAL = { en, fr } as const;
