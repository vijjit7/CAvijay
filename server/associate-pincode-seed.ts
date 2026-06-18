// Canonical associate -> pincode coverage, sourced from the admin PINCODES sheet.
// Used to auto-seed associate_locations on first boot when the table is empty
// (see server/db.ts). Keyed by users.username so it survives id changes. The same
// data is mirrored in script/data/seed-associate-pincodes.sql for manual runs.
//
// 80 pincodes. Where the source sheet listed a pincode under more than one
// associate, the leftmost column won; admins can reassign from the Pincode Mapping
// page. The 7-digit typo "5000070" was corrected to "500070".
export const ASSOCIATE_PINCODE_SEED: { username: string; pincodes: string[] }[] = [
  { username: "bharat", pincodes: ["500004", "500016", "500018", "500019", "500032", "500034", "500037", "500038", "500043", "500045", "500049", "500050", "500055", "500072", "500081", "500082", "500090", "500118", "502032", "502319"] },
  { username: "anosh", pincodes: ["500075", "500006", "500053", "500048", "500067", "500064", "500028", "500077", "500036", "500086", "500008", "500030", "500091", "500002", "500005", "500052"] },
  { username: "shankar", pincodes: ["500097", "500058", "500079", "500059", "500023", "500065", "500070", "501505", "501510"] },
  { username: "prashanth", pincodes: ["500013", "500024", "500060", "500068", "500074", "500035", "500039", "500088", "500092"] },
  { username: "avinash", pincodes: ["500076", "500007", "500098", "500027", "500029", "500063", "500003", "500047", "500040", "501301", "500044", "500017", "500026", "500080", "500020"] },
  { username: "srikanth", pincodes: ["500062", "500056", "500083", "500010", "500051", "500011", "500087", "500100", "501401", "500101", "500015"] },
];
