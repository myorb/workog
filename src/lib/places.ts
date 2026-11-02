/**
 * Countries and cities we build location pages for, with the spellings the
 * career sites use. Labels are free text ("SF, NYC, SEA", "Austin, TX",
 * "Remote - USA"), so each alias is matched anywhere in a label.
 */
export interface Country {
  slug: string;
  name: string;
  pattern: RegExp;
}

export interface City {
  slug: string;
  name: string;
  country: string;
  pattern: RegExp;
}

const usStates =
  "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming";
// "CA" is left out: it is also Canada's code ("Toronto, ON, CA")
const usStateCodes = "AL|AZ|CO|CT|DC|FL|GA|IL|MA|MD|MI|MN|MO|NC|NJ|NV|NY|OH|OR|PA|TN|TX|UT|VA|WA|WI";

export const countries: Country[] = [
  {
    slug: "united-states",
    name: "United States",
    pattern: new RegExp(`\\b(united states|usa)\\b|\\bU\\.S\\.|\\bUS\\b|\\b(${usStates})\\b|, (${usStateCodes})\\b`, "i"),
  },
  { slug: "canada", name: "Canada", pattern: /\b(canada|ontario|quebec|british columbia|alberta)\b/i },
  { slug: "mexico", name: "Mexico", pattern: /\bmexico\b|\bMX\b/i },
  { slug: "brazil", name: "Brazil", pattern: /\b(brazil|BR)\b/i },
  { slug: "chile", name: "Chile", pattern: /\bchile\b/i },
  { slug: "argentina", name: "Argentina", pattern: /\bargentina\b/i },
  { slug: "colombia", name: "Colombia", pattern: /\bcolombia\b/i },
  { slug: "united-kingdom", name: "United Kingdom", pattern: /\b(united kingdom|UK|england|scotland|wales)\b/i },
  { slug: "ireland", name: "Ireland", pattern: /\b(ireland|IE)\b/i },
  { slug: "germany", name: "Germany", pattern: /\b(germany|deutschland)\b/i },
  { slug: "france", name: "France", pattern: /\b(france|FR)\b/i },
  { slug: "netherlands", name: "Netherlands", pattern: /\b(netherlands|holland)\b/i },
  { slug: "spain", name: "Spain", pattern: /\bspain\b/i },
  { slug: "portugal", name: "Portugal", pattern: /\bportugal\b/i },
  { slug: "italy", name: "Italy", pattern: /\bitaly\b/i },
  { slug: "switzerland", name: "Switzerland", pattern: /\bswitzerland\b/i },
  { slug: "austria", name: "Austria", pattern: /\baustria\b/i },
  { slug: "belgium", name: "Belgium", pattern: /\bbelgium\b/i },
  { slug: "luxembourg", name: "Luxembourg", pattern: /\bluxembourg\b/i },
  { slug: "sweden", name: "Sweden", pattern: /\bsweden\b/i },
  { slug: "denmark", name: "Denmark", pattern: /\bdenmark\b/i },
  { slug: "lithuania", name: "Lithuania", pattern: /\blithuania\b/i },
  { slug: "cyprus", name: "Cyprus", pattern: /\bcyprus\b/i },
  { slug: "poland", name: "Poland", pattern: /\bpoland\b/i },
  { slug: "romania", name: "Romania", pattern: /\bromania\b/i },
  { slug: "slovenia", name: "Slovenia", pattern: /\bslovenia\b/i },
  { slug: "iceland", name: "Iceland", pattern: /\biceland\b/i },
  { slug: "israel", name: "Israel", pattern: /\bisrael\b/i },
  { slug: "united-arab-emirates", name: "United Arab Emirates", pattern: /\b(united arab emirates|UAE)\b/i },
  { slug: "saudi-arabia", name: "Saudi Arabia", pattern: /\b(saudi arabia|KSA)\b/i },
  { slug: "india", name: "India", pattern: /\bindia\b/i },
  { slug: "singapore", name: "Singapore", pattern: /\b(singapore|SG)\b/i },
  { slug: "japan", name: "Japan", pattern: /\bjapan\b/i },
  { slug: "south-korea", name: "South Korea", pattern: /\b(south korea|korea)\b/i },
  { slug: "china", name: "China", pattern: /\bchina\b/i },
  { slug: "taiwan", name: "Taiwan", pattern: /\btaiwan\b/i },
  { slug: "thailand", name: "Thailand", pattern: /\bthailand\b/i },
  { slug: "vietnam", name: "Vietnam", pattern: /\bvietnam\b/i },
  { slug: "malaysia", name: "Malaysia", pattern: /\bmalaysia\b/i },
  { slug: "indonesia", name: "Indonesia", pattern: /\bindonesia\b/i },
  { slug: "philippines", name: "Philippines", pattern: /\bphilippines\b/i },
  { slug: "australia", name: "Australia", pattern: /\baustralia\b/i },
  { slug: "new-zealand", name: "New Zealand", pattern: /\bnew zealand\b/i },
];

function city(slug: string, name: string, country: string, pattern: RegExp): City {
  return { slug, name, country, pattern };
}

export const cities: City[] = [
  city("new-york", "New York", "united-states", /\b(new[ -]york( city)?|NYC|NY)\b(?!,? (USA, )?remote)/i),
  city("san-francisco", "San Francisco", "united-states", /\b(san francisco|SF)\b/i),
  city("seattle", "Seattle", "united-states", /\b(seattle|SEA)\b/i),
  city("austin", "Austin", "united-states", /\baustin\b/i),
  city("chicago", "Chicago", "united-states", /\b(chicago|CHI)\b/i),
  city("boston", "Boston", "united-states", /\bboston\b/i),
  city("denver", "Denver", "united-states", /\bdenver\b/i),
  city("los-angeles", "Los Angeles", "united-states", /\blos angeles\b/i),
  city("washington-dc", "Washington, D.C.", "united-states", /\b(washington,? d\.?c\.?|DC|district of columbia)\b/i),
  city("atlanta", "Atlanta", "united-states", /\b(atlanta|ATL)\b/i),
  city("pittsburgh", "Pittsburgh", "united-states", /\bpittsburgh\b/i),
  city("menlo-park", "Menlo Park", "united-states", /\bmenlo park\b/i),
  city("palo-alto", "Palo Alto", "united-states", /\bpalo alto\b/i),
  city("nashville", "Nashville", "united-states", /\bnashville\b/i),
  city("bellevue", "Bellevue", "united-states", /\bbellevue\b/i),
  city("dallas", "Dallas", "united-states", /\bdallas\b/i),
  city("houston", "Houston", "united-states", /\bhouston\b/i),
  city("phoenix", "Phoenix", "united-states", /\bphoenix\b/i),
  city("miami", "Miami", "united-states", /\bmiami\b/i),
  city("portland", "Portland", "united-states", /\bportland\b/i),
  city("raleigh", "Raleigh", "united-states", /\braleigh\b/i),
  city("detroit", "Detroit", "united-states", /\bdetroit\b/i),
  city("toronto", "Toronto", "canada", /\b(toronto|TOR)\b/i),
  city("vancouver", "Vancouver", "canada", /\bvancouver\b/i),
  city("montreal", "Montreal", "canada", /\bmontr[eé]al\b/i),
  city("mexico-city", "Mexico City", "mexico", /\b(mexico city|CDMX)\b/i),
  city("buenos-aires", "Buenos Aires", "argentina", /\bbuenos aires\b/i),
  city("sao-paulo", "São Paulo", "brazil", /\bs[aã]o paulo\b/i),
  city("london", "London", "united-kingdom", /\blondon\b/i),
  city("dublin", "Dublin", "ireland", /\bdublin\b/i),
  city("berlin", "Berlin", "germany", /\bberlin\b/i),
  city("munich", "Munich", "germany", /\b(munich|m[uü]nchen|muenchen)\b/i),
  city("paris", "Paris", "france", /\bparis\b/i),
  city("bordeaux", "Bordeaux", "france", /\bbordeaux\b/i),
  city("amsterdam", "Amsterdam", "netherlands", /\bamsterdam\b/i),
  city("madrid", "Madrid", "spain", /\bmadrid\b/i),
  city("barcelona", "Barcelona", "spain", /\bbarcelona\b/i),
  city("lisbon", "Lisbon", "portugal", /\blisbo[na]\b/i),
  city("milan", "Milan", "italy", /\bmilan\b/i),
  city("zurich", "Zurich", "switzerland", /\bz[uü]rich\b/i),
  city("brussels", "Brussels", "belgium", /\bbrussels\b/i),
  city("copenhagen", "Copenhagen", "denmark", /\bcopenhagen\b/i),
  city("stockholm", "Stockholm", "sweden", /\bstockholm\b/i),
  city("warsaw", "Warsaw", "poland", /\bwarsaw\b/i),
  city("bucharest", "Bucharest", "romania", /\bbucharest\b/i),
  city("ljubljana", "Ljubljana", "slovenia", /\bljubljana\b/i),
  city("reykjavik", "Reykjavík", "iceland", /\breykjav[ií]k\b/i),
  city("tel-aviv", "Tel Aviv", "israel", /\btel aviv\b/i),
  city("dubai", "Dubai", "united-arab-emirates", /\bdubai\b/i),
  city("abu-dhabi", "Abu Dhabi", "united-arab-emirates", /\babu dhabi\b/i),
  city("bangalore", "Bangalore", "india", /\b(bangalore|bengaluru)\b/i),
  city("hyderabad", "Hyderabad", "india", /\bhyderabad\b/i),
  city("mumbai", "Mumbai", "india", /\bmumbai\b/i),
  city("gurugram", "Gurugram", "india", /\b(gurugram|gurgaon)\b/i),
  city("tokyo", "Tokyo", "japan", /\btokyo\b/i),
  city("osaka", "Osaka", "japan", /\bosaka\b/i),
  city("seoul", "Seoul", "south-korea", /\bseoul\b/i),
  city("beijing", "Beijing", "china", /\bbeijing\b/i),
  city("taipei", "Taipei", "taiwan", /\btaipei\b/i),
  city("bangkok", "Bangkok", "thailand", /\bbangkok\b/i),
  city("kuala-lumpur", "Kuala Lumpur", "malaysia", /\bkuala lumpur\b/i),
  city("manila", "Manila", "philippines", /\bmanila\b/i),
  city("sydney", "Sydney", "australia", /\bsydney\b/i),
  city("melbourne", "Melbourne", "australia", /\bmelbourne\b/i),
  city("auckland", "Auckland", "new-zealand", /\bauckland\b/i),
];

export interface Places {
  countries: Set<string>;
  cities: Set<string>;
}

/** Country and city slugs a set of location labels refers to. A city implies its country. */
export function placesOf(locations: string[]): Places {
  const found: Places = { countries: new Set(), cities: new Set() };
  for (const label of locations) {
    for (const c of cities) {
      if (c.pattern.test(label)) {
        found.cities.add(c.slug);
        found.countries.add(c.country);
      }
    }
    for (const c of countries) if (c.pattern.test(label)) found.countries.add(c.slug);
  }
  return found;
}

export const getCountry = (slug: string) => countries.find((c) => c.slug === slug);
export const getCity = (slug: string) => cities.find((c) => c.slug === slug);
