/**
 * Exempelfil för att kunna prova verktyget utan egen data.
 *
 * Den är medvetet stökig på precis de sätt som verklig svensk exportdata är:
 * blandade datumformat, ett Excel-serienummer, ett otolkbart datum, ett
 * postnummer med ledande nolla, belopp med decimalkomma och hårt mellanslag,
 * en rollkonto-adress utan namnmönster, en dubblett, och en rad med tomt
 * fält. Varje funktion i verktyget har då något att bita i direkt.
 */
export const EXEMPELFIL = [
  'Kundnr;Namn;E-post;Registrerad;Postnr;Ort;Belopp;Status',
  '10021;Anna Karlsson;anna.karlsson@nordbygg.se;2026-08-27 12:55;21120;Malmö;1 240,50;Aktiv',
  '10022;Erik Öberg;erik.oberg@nordbygg.se;27/08/2026;22350;Lund;980,00;Aktiv',
  '10023;Åsa Öhman;asa.ohman@vydata.se;2026-08-26;98139;Kiruna;12 000,00;Avslutad',
  '10024;Björn Åkesson;bjorn.akesson@vydata.se;45231;35236;Växjö;412,00;Aktiv',
  '10025;Carl-Johan Nilsson;c-j.nilsson@acme.se;den 27 augusti 2026;01234;Boden;2 010,00;Vilande',
  '10026;Zlatan Ek;zlatan.ek@acme.se;2026-08-25 09:12;41103;Göteborg;7 450,00;Aktiv',
  '10027;Ida Ängström;info@angstrom.se;i går;11122;Stockholm;;Aktiv',
  '10028;Nils Ödman;nils.odman@nordbygg.se;2026-08-24;72212;Västerås;315,75;Avslutad',
  '10029;Maja Lind;maja.lind@vydata.se;24/08/2026;58330;Linköping;1 890,00;Aktiv',
  '10030;Omar Haddad;omar.haddad@acme.se;2026-08-23 16:40;90325;Umeå;640,00;Vilande',
  '10031;Lisa Berg;lisa.berg@nordbygg.se;2026-08-22;75236;Uppsala;5 120,25;Aktiv',
  '10032;Sven Åström;sven.astrom@vydata.se;22/08/2026;85230;Sundsvall;98,00;Aktiv',
  '10033;Ella Norén;ella.noren@acme.se;2026-08-21 11:05;65224;Karlstad;3 300,00;Avslutad',
  '10034;Ravi Patel;ravi.patel@nordbygg.se;2026-08-20;70362;Örebro;1 175,50;Aktiv',
  '10035;Anna Karlsson;anna.karlsson@nordbygg.se;2026-08-27 12:55;21120;Malmö;1 240,50;Aktiv',
  ';;;;;;;',
  '10036;Greta Öhrn;greta.ohrn@acme.se;2026-08-19 08:30;93131;Skellefteå;875,00;Vilande',
  '',
].join('\r\n')

/**
 * Andra exempelfilen — order att slå ihop med kundfilen.
 *
 * Den är gjord för att matchningen ska ha något verkligt att bita i:
 * rubrikerna heter `Name` och `mail` i stället för `Namn` och `E-post`, så
 * namnförslaget får arbeta. Namnen är skrivna olika (gemener, VERSALER,
 * dubbelt mellanslag), en kund har två order så kardinaliteten syns, två
 * order tillhör personer som inte finns i kundfilen och blir restlista, och
 * en rad saknar namn helt och kan därför aldrig matcha.
 *
 * De tre sista raderna finns för verkstaden, en per väg ut ur restlistan:
 * ORD-1012 har rätt e-post men fel stavat namn och plockas upp av en ny runda
 * på e-post; ORD-1013 har namnet i omvänd ordning och likaså rätt e-post;
 * ORD-1014 har både skräp i namnet och ett stavfel i e-postadressen, så den
 * hittar sin kund först när värdet rättas för hand. ORD-1011 utan namn är den
 * naturliga kandidaten att para ihop för hand eller skriva av.
 */
export const EXEMPELFIL_ORDER = [
  'Order;Name;mail;Summa;Levererad',
  'ORD-1001;anna karlsson;anna.karlsson@nordbygg.se;2 400,00;Ja',
  'ORD-1002;Erik Öberg;erik.oberg@nordbygg.se;1 150,00;Ja',
  'ORD-1003;ERIK ÖBERG;erik.oberg@nordbygg.se;890,00;Nej',
  'ORD-1004;Åsa Öhman;asa.ohman@vydata.se;3 200,00;Ja',
  'ORD-1005;Björn  Åkesson;bjorn.akesson@vydata.se;450,00;Nej',
  'ORD-1006;Maja Lind;maja.lind@vydata.se;1 900,00;Ja',
  'ORD-1007;Ravi Patel;ravi.patel@nordbygg.se;760,00;Ja',
  'ORD-1008;Petra Sund;petra.sund@okand.se;540,00;Ja',
  'ORD-1009;Hans Vik;hans.vik@okand.se;1 020,00;Nej',
  'ORD-1010;Ella Norén;ella.noren@acme.se;2 780,00;Ja',
  'ORD-1011;;svea.ek@okand.se;310,00;Ja',
  'ORD-1012;Zlatan Ekk;zlatan.ek@acme.se;1 340,00;Ja',
  'ORD-1013;Ängström Ida;info@angstrom.se;2 250,00;Nej',
  'ORD-1014;Nils Ödman (avliden);nils.odman@nordbyg.se;880,00;Ja',
  '',
].join('\r\n')
