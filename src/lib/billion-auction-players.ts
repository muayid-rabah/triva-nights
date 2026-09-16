export type BillionRole = "GK" | "DEF" | "MID" | "ATT" | "COACH";

export type BillionAuctionPlayer = {
  id: string;
  name: string;
  role: BillionRole;
  position: string;
  price: number;
  rating: number;
  asset?: string;
};

const card = (id: string, name: string, role: BillionRole, position: string, price: number, rating: number, asset?: string): BillionAuctionPlayer => ({ id, name, role, position, price, rating, asset });

/** Deliberately curated: only recognisable elite players and football legends.
 * We never load the complete third-party player archive into the game. */
export const BILLION_AUCTION_PLAYERS: BillionAuctionPlayer[] = [
  card("messi", "ليونيل ميسي", "ATT", "جناح / صانع لعب", 190, 97, "Lionel Messi.webp"),
  card("cristiano", "كريستيانو رونالدو", "ATT", "مهاجم", 180, 96, "Cristiano Ronaldo.webp"),
  card("haaland", "إيرلينغ هالاند", "ATT", "رأس حربة", 165, 94, "Erling Haaland.webp"),
  card("mbappe", "كيليان مبابي", "ATT", "جناح", 175, 95, "Kylian Mbappé.webp"),
  card("salah", "محمد صلاح", "ATT", "جناح", 145, 92, "Mohamed Salah.webp"),
  card("vinicius", "فينيسيوس جونيور", "ATT", "جناح", 140, 92, "Vini Jr..webp"),
  card("lewandowski", "روبرت ليفاندوفسكي", "ATT", "رأس حربة", 125, 91, "Robert Lewandowski.webp"),
  card("kane", "هاري كين", "ATT", "مهاجم", 120, 91, "Harry Kane.webp"),
  card("bellingham", "جود بيلينغهام", "MID", "وسط هجومي", 145, 93, "Jude Bellingham.webp"),
  card("de-bruyne", "كيفن دي بروين", "MID", "صانع لعب", 130, 92, "Kevin De Bruyne.webp"),
  card("modric", "لوكا مودريتش", "MID", "وسط", 105, 91, "Luka Modrić.webp"),
  card("de-jong", "فرينكي دي يونغ", "MID", "وسط", 94, 88, "Frenkie de Jong.webp"),
  card("lamine", "لامين يامال", "ATT", "جناح", 120, 90, "Lamine Yamal.webp"),
  card("griezmann", "أنطوان غريزمان", "ATT", "مهاجم ثانٍ", 100, 89, "Antoine Griezmann.webp"),
  card("saka", "بوكايو ساكا", "ATT", "جناح", 105, 90, "Bukayo Saka.webp"),
  card("kvaratskhelia", "خفيتشا كفاراتسخيليا", "ATT", "جناح", 95, 89, "Khvicha Kvaratskhelia.webp"),
  card("hakimi", "أشرف حكيمي", "DEF", "ظهير أيمن", 95, 89, "Achraf Hakimi.webp"),
  card("van-dijk", "فيرجيل فان دايك", "DEF", "قلب دفاع", 110, 91, "Virgil van Dijk.webp"),
  card("marquinhos", "ماركينيوس", "DEF", "قلب دفاع", 82, 88, "Marquinhos.webp"),
  card("courtois", "تيبو كورتوا", "GK", "حارس", 92, 90, "Thibaut Courtois.webp"),
  card("neuer", "مانويل نوير", "GK", "حارس", 80, 89, "Manuel Neuer.webp"),
  card("alisson", "أليسون بيكر", "GK", "حارس", 84, 89, "Alisson.webp"),
  card("bounou", "ياسين بونو", "GK", "حارس", 62, 85, "Yassine Bounou.webp"),
  card("donnarumma", "جيانلويجي دوناروما", "GK", "حارس", 85, 89, "Gianluigi Donnarumma.webp"),
  card("ronaldinho", "رونالدينيو", "MID", "أسطورة · صانع لعب", 150, 96),
  card("zidane", "زين الدين زيدان", "MID", "أسطورة · وسط", 165, 97),
  card("ronaldo", "رونالدو نازاريو", "ATT", "أسطورة · مهاجم", 170, 97),
  card("maradona", "دييغو مارادونا", "MID", "أسطورة · صانع لعب", 175, 98),
  card("neymar", "نيمار", "ATT", "جناح", 135, 92),
  card("henry", "تييري هنري", "ATT", "أسطورة · مهاجم", 145, 95),
  card("zlatan", "زلاتان إبراهيموفيتش", "ATT", "أسطورة · مهاجم", 130, 93),
  card("xavi", "تشافي", "MID", "أسطورة · وسط", 135, 95),
  card("iniesta", "أندريس إنييستا", "MID", "أسطورة · وسط", 140, 96),
  card("casemiro", "كاسيميرو", "MID", "ارتكاز", 78, 88, "Casemiro.webp"),
  card("ramos", "سيرخيو راموس", "DEF", "أسطورة · قلب دفاع", 112, 93),
  card("marcelo", "مارسيلو", "DEF", "أسطورة · ظهير", 96, 91),
  card("maldini", "باولو مالديني", "DEF", "أسطورة · دفاع", 155, 97),
  card("dias", "روبن دياز", "DEF", "قلب دفاع", 88, 88, "Rúben Dias.webp"),
  card("ederson", "إيدرسون", "GK", "مانشستر سيتي · حارس", 86, 89, "Ederson.webp"),
  card("bruno", "برونو فيرنانديز", "MID", "مانشستر يونايتد · وسط", 102, 90, "Bruno Fernandes.webp"),
  card("rashford", "ماركوس راشفورد", "ATT", "مانشستر يونايتد · جناح", 88, 87, "Marcus Rashford.webp"),
  card("garnacho", "أليخاندرو غارناتشو", "ATT", "مانشستر يونايتد · جناح", 72, 84, "Alejandro Garnacho.webp"),
  card("lautaro", "لاوتارو مارتينيز", "ATT", "إنتر ميلان · مهاجم", 118, 91),
  card("thuram", "ماركوس تورام", "ATT", "إنتر ميلان · مهاجم", 84, 87),
  card("barella", "نيكولو باريلا", "MID", "إنتر ميلان · وسط", 98, 90),
  card("calhanoglu", "هاكان تشالهان أوغلو", "MID", "إنتر ميلان · وسط", 88, 89),
  card("bastoni", "أليساندرو باستوني", "DEF", "إنتر ميلان · دفاع", 91, 89),
  card("dimarco", "فيديريكو ديماركو", "DEF", "إنتر ميلان · ظهير", 76, 86),
  card("leao", "رافاييل لياو", "ATT", "إيه سي ميلان · جناح", 105, 90),
  card("pulisic", "كريستيان بوليسيتش", "ATT", "إيه سي ميلان · جناح", 82, 87),
  card("theo", "ثيو هيرنانديز", "DEF", "إيه سي ميلان · ظهير", 93, 89),
  card("maignan", "مايك مينيان", "GK", "إيه سي ميلان · حارس", 82, 88),
  card("kaka", "كاكا", "MID", "إيه سي ميلان · أسطورة", 148, 96),
  card("pirlo", "أندريا بيرلو", "MID", "ميلان / يوفنتوس · أسطورة", 136, 95),
  card("puyol", "كارليس بويول", "DEF", "أسطورة · قلب دفاع", 120, 94),
  card("guardiola", "بيب غوارديولا", "COACH", "مدرب", 75, 96),
  card("ancelotti", "كارلو أنشيلوتي", "COACH", "مدرب", 70, 94),
  card("zidane-coach", "زين الدين زيدان · مدرب", "COACH", "مدرب", 70, 93),
  card("mourinho", "جوزيه مورينيو", "COACH", "مدرب", 65, 92),
];

export const billionPlayerAsset = (asset?: string) => asset ? `/assets/billion-players/${encodeURIComponent(asset)}` : undefined;
