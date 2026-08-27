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
